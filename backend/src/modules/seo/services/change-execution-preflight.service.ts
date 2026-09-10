import mongoose, { ClientSession } from 'mongoose';
import { SeoRecommendation, ISeoRecommendationDoc } from '../models/seo-recommendation.model';
import {
  SeoChangeDraft,
  ISeoChangeDraftDoc,
  MetadataProposedChange,
  ContentProposedChange,
  InternalLinkProposedChange,
  FaqProposedChange,
  BlogCreateProposedChange,
} from '../models/seo-change-draft.model';
import { SeoChangeExecution, ExecutedFieldSnapshot } from '../models/seo-change-execution.model';
import { Page, IPageDoc } from '../../cms/models/page.model';
import { Product, IProductDoc } from '../../catalog/models/product.model';
import { Blog, IBlogDoc } from '../../cms/models/blog.model';
import { CANONICAL_PAGE_SLUG } from '../../cms/page-slug.util';
import { seoConfig } from '../seo.config';
import { applyInternalLinkPatch, contentAlreadyLinksTo } from './internal-link-patch.util';
import { extractFaqPairsFromHtml, buildFaqJsonLd, serializeFaqJsonLd, FaqItem } from './faq-schema.util';
import { validateArticleHtml, extractLinks, isInternalUrl, UNSUPPORTED_CLAIM_PATTERNS } from './blog-content-safety.util';

/**
 * Phase 5.5 — execution quality controls. THE single authoritative answer to
 * "is this approved draft still safe and sensible to execute right now?".
 *
 * This module absorbs Phase 5.3's entire Pass 1 (eligibility, target
 * resolution, and the exact stale comparison) rather than duplicating it, and
 * adds deterministic fail-closed blockers and advisory SEO quality warnings on
 * top. Both callers use this one evaluator:
 *
 *   - the advisory admin preflight endpoint (read-only preview), and
 *   - Phase 5.3 execution itself, which reruns it session-pinned INSIDE the
 *     Mongo transaction immediately before Pass 2 writes.
 *
 * A previously returned browser preflight result is therefore never trusted or
 * reused as authorization — the executor always re-derives everything.
 *
 * Deliberately deterministic, local, and cheap: only current database state and
 * immutable recommendation/draft data are consulted. No DataForSEO, no GSC, no
 * LLM, no network, no paid provider, no scheduling, and — critically — NO
 * WRITES of any kind, so a preview can never mutate production or create
 * database history.
 */
export const PREFLIGHT_VERSION = '5.5.0-preflight-v1';

// ─────────────────────────────────────────────────────────────────────────────
// Result vocabulary — stable machine-readable codes plus human-readable text.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every reason a draft may NOT be executed. The first fourteen are Phase 5.3's
 * original `ExecuteChangeDraftError` values, preserved verbatim (and in the
 * same evaluation order) so the execute endpoint's HTTP contract is unchanged;
 * the last three are new in Phase 5.5 and map to 409 like every other
 * eligibility/domain conflict.
 */
export type PreflightBlockerCode =
  | 'invalid_id'
  | 'not_found'
  | 'recommendation_not_found'
  | 'not_draft'
  | 'not_open'
  | 'not_approved'
  | 'fingerprint_mismatch'
  | 'invalid_draft'
  | 'unsupported_kind'
  | 'unsupported_field'
  | 'unsupported_target'
  | 'target_not_found'
  | 'stale'
  | 'already_executed'
  | 'no_effective_change'
  | 'malformed_value'
  | 'ambiguous_target'
  // Phase 6.4A — internal-link execution.
  | 'anchor_not_found'
  | 'ambiguous_anchor'
  | 'duplicate_link'
  | 'self_link'
  | 'external_target'
  | 'malformed_link'
  // Phase 6.5A — FAQ schema execution.
  | 'empty_faq_items'
  | 'duplicate_question'
  | 'schema_already_present'
  | 'schema_mismatch'
  // Phase 6.6A — blog article creation.
  | 'slug_already_exists'
  | 'unsafe_markup'
  | 'weak_structure'
  | 'cannibalizing_target'
  | 'unsupported_claim';

/**
 * SEO quality findings. These NEVER block execution — they are judgement calls
 * about copy quality, not correctness or safety faults, and a human admin is
 * still the one who clicks Execute.
 */
export type PreflightWarningCode =
  | 'title_too_short'
  | 'title_too_long'
  | 'description_too_short'
  | 'description_too_long'
  | 'duplicate_title'
  | 'duplicate_description'
  | 'normalized_no_op_title'
  | 'normalized_no_op_description'
  | 'blank_description'
  | 'content_requires_review';

/** One rule the evaluator actually ran. Rules after a short-circuiting gate are simply absent. */
export type PreflightCheckCode =
  | 'draft_exists'
  | 'not_already_executed'
  | 'draft_active'
  | 'recommendation_open'
  | 'recommendation_approved'
  | 'fingerprint_match'
  | 'draft_valid'
  | 'change_kind_supported'
  | 'fields_supported'
  | 'target_resolvable'
  | 'target_unique'
  | 'values_well_formed'
  | 'live_state_unchanged'
  | 'effective_change'
  | 'value_lengths'
  | 'no_duplicate_metadata'
  // Phase 6.4A — internal-link execution.
  | 'anchor_present'
  | 'link_target_valid'
  | 'no_duplicate_link'
  // Phase 6.5A — FAQ schema execution.
  | 'faq_items_well_formed'
  | 'faq_schema_novel'
  | 'faq_schema_matches_derivation'
  // Phase 6.6A — blog article creation.
  | 'slug_available'
  | 'markup_safe'
  | 'structure_reasonable'
  | 'links_internal_and_resolvable'
  | 'no_cannibalization'
  | 'single_article_creation';

export type PreflightCheckStatus = 'pass' | 'warn' | 'fail';
export type PreflightRiskLevel = 'low' | 'medium' | 'high';

export interface PreflightBlocker {
  code: PreflightBlockerCode;
  message: string;
  targetUrl?: string;
}

export interface PreflightWarning {
  code: PreflightWarningCode;
  message: string;
  targetUrl?: string;
}

export interface PreflightCheck {
  code: PreflightCheckCode;
  status: PreflightCheckStatus;
  message: string;
  targetUrl?: string;
}

/** The metadata fields this execution would write, per resolved target — the exact mutation scope. */
export interface PreflightChangedFields {
  targetUrl: string;
  fields: ('metaTitle' | 'metaDescription' | 'description' | 'content' | 'faqSchema' | 'blog_article')[];
}

export interface ExecutionPreflightResult {
  executable: boolean;
  riskLevel: PreflightRiskLevel;
  blockers: PreflightBlocker[];
  warnings: PreflightWarning[];
  checks: PreflightCheck[];
  changedFields: PreflightChangedFields[];
  evaluatedAt: Date;
  evaluatorVersion: string;
}

/**
 * Pass-1 output reused by Phase 5.3's Pass 2. Internal only — never serialized
 * to the API (it carries live mongoose documents).
 */
export type PreparedExecutionTarget =
  | {
      targetType: 'cms_page';
      targetUrl: string;
      page: IPageDoc;
      before: ExecutedFieldSnapshot;
      proposed: ExecutedFieldSnapshot;
    }
  | {
      targetType: 'product';
      targetUrl: string;
      product: IProductDoc;
      before: ExecutedFieldSnapshot;
      proposed: ExecutedFieldSnapshot;
    }
  | {
      targetType: 'blog';
      targetUrl: string;
      blog: IBlogDoc;
      before: ExecutedFieldSnapshot;
      proposed: ExecutedFieldSnapshot;
    }
  | {
      /** Phase 6.6A — no existing document: the whole point is CREATION. */
      targetType: 'blog_create';
      targetUrl: string;
      proposed: ExecutedFieldSnapshot;
    };

export interface ExecutionPreflightEvaluation {
  result: ExecutionPreflightResult;
  /** Fully populated only when `result.executable` is true. */
  prepared: PreparedExecutionTarget[];
  /** Null only when the draft id was invalid or the draft does not exist. */
  draft: ISeoChangeDraftDoc | null;
  recommendation: ISeoRecommendationDoc | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds — every quality number lives here, none are inline magic values.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The frontend's CMS page template renders `${metaTitle || title} — Rajhans Tea`
 * (see frontend static-page.ts), so a stored metaTitle is always 14 characters
 * shorter than what a search engine actually displays. Title LENGTH warnings are
 * therefore judged on the rendered value; DUPLICATE checks deliberately are not
 * — those compare the stored CMS representation, per the Phase 5.2→5.3 storage
 * title fix. Kept as a local constant to mirror the existing copies in
 * change-draft-generator.service.ts and change-verification.service.ts rather
 * than refactoring Phase 5.2/5.4A code in a Phase 5.5 change.
 */
const CMS_PAGE_TITLE_BRANDING_SUFFIX = ' — Rajhans Tea';

export const PREFLIGHT_THRESHOLDS = {
  /**
   * Rendered-title bounds. Existing published CMS pages store 28–40 char titles,
   * which render at 42–54 — comfortably inside 30–60. 60 is the widely used
   * SERP truncation approximation; below 30 rendered (16 stored) a title carries
   * essentially no information beyond the brand suffix.
   */
  renderedTitleMinLength: 30,
  renderedTitleMaxLength: 60,

  /**
   * Description bounds are taken from seoConfig so that preflight can never
   * contradict the audit engine's own `meta-description-length` rule (50–160).
   */
  descriptionMinLength: seoConfig.descriptionMinLength,
  descriptionMaxLength: seoConfig.descriptionMaxLength,

  /**
   * Hard structural caps. Not SEO advice — these reject values so far outside
   * any plausible metadata that writing them would be a data-integrity problem.
   */
  hardMaxTitleLength: 300,
  hardMaxDescriptionLength: 1000,

  /** Cap on the bounded duplicate-metadata lookup so a preview can never run an unbounded scan. */
  duplicateScanLimit: 5,
} as const;

/** Warnings that make a change high risk: it is probably wrong, just not provably unsafe. */
const HIGH_RISK_WARNING_CODES: PreflightWarningCode[] = [
  'duplicate_title',
  'duplicate_description',
  'normalized_no_op_title',
  'normalized_no_op_description',
];

/** Warnings that make a change medium risk: defensible, but worth a human look. */
const MEDIUM_RISK_WARNING_CODES: PreflightWarningCode[] = [
  'title_too_short',
  'title_too_long',
  'description_too_short',
  'description_too_long',
  'blank_description',
  'content_requires_review',
];

// ─────────────────────────────────────────────────────────────────────────────
// Target resolution (moved verbatim from Phase 5.3 — same rules, same reasons)
// ─────────────────────────────────────────────────────────────────────────────

export type TargetResolutionFailureReason = 'unsupported_host' | 'unsupported_path' | 'not_found';
export type TargetResolution = { ok: true; page: IPageDoc } | { ok: false; reason: TargetResolutionFailureReason };

/** Only `/page/:slug/` (or without the trailing slash) on the configured public origin resolves — everything else (other hosts, /blog/, /product/, /catalog/, the homepage, admin/api paths) is unsupported. */
const CMS_PAGE_PATH_PATTERN = /^\/page\/([^/]+)\/?$/;

type ParsedCmsPageTarget =
  | { ok: true; slugCandidates: string[] }
  | { ok: false; reason: 'unsupported_host' | 'unsupported_path' };

/**
 * Parse an executable CMS page target URL into the DB slugs it may address.
 * Pure/synchronous — the single place the executable-URL shape is defined, so
 * resolution and the preflight's "why did this not resolve?" explanation can
 * never drift apart.
 */
function parseCmsPageTarget(targetUrl: string): ParsedCmsPageTarget {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(targetUrl);
    base = new URL(seoConfig.baseUrl);
  } catch {
    return { ok: false, reason: 'unsupported_path' };
  }

  // Only a bare canonical page URL is executable — a query string, a fragment,
  // or embedded userinfo credentials each change what the URL actually
  // addresses (or imply context this phase never accounts for), so any of
  // them disqualifies the target even when the origin/path would otherwise
  // match.
  if (parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) {
    return { ok: false, reason: 'unsupported_host' };
  }

  const match = CMS_PAGE_PATH_PATTERN.exec(parsed.pathname);
  const urlSlug = match?.[1];
  if (!urlSlug) {
    return { ok: false, reason: 'unsupported_path' };
  }

  // A CMS page may still be stored under a legacy slug that 301s to the
  // canonical URL slug at the edge — try both, canonical first.
  const legacySlug = Object.keys(CANONICAL_PAGE_SLUG).find((k) => CANONICAL_PAGE_SLUG[k] === urlSlug);
  return { ok: true, slugCandidates: legacySlug ? [urlSlug, legacySlug] : [urlSlug] };
}

/**
 * Resolve a target URL to the live CMS Page it addresses. Only a PUBLISHED page
 * is executable — v1 is explicitly about live CMS metadata, so a
 * draft/unpublished page resolves as not_found (execution fails before any
 * write), the same as if no page existed at all.
 */
export async function resolveCmsPageTarget(targetUrl: string, session?: ClientSession): Promise<TargetResolution> {
  const parsed = parseCmsPageTarget(targetUrl);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  for (const slug of parsed.slugCandidates) {
    const page = await Page.findOne({ slug, status: 'published' }).session(session ?? null).exec();
    if (page) return { ok: true, page };
  }
  return { ok: false, reason: 'not_found' };
}

/**
 * Failure-path only: distinguish "no such CMS page" from "the CMS page exists
 * but is no longer published". Both remain the `target_not_found` blocker (and
 * therefore the same HTTP 404 Phase 5.3 already returned) — this only makes the
 * operator-facing message truthful.
 */
async function findUnpublishedCmsPage(targetUrl: string, session?: ClientSession): Promise<IPageDoc | null> {
  const parsed = parseCmsPageTarget(targetUrl);
  if (!parsed.ok) return null;
  for (const slug of parsed.slugCandidates) {
    const page = await Page.findOne({ slug }).session(session ?? null).exec();
    if (page) return page;
  }
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Phase 6.3A product-content target resolution
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_PATH_PATTERN = /^\/product\/([^/]+)\/?$/;

type ProductTargetResolution =
  | { ok: true; product: IProductDoc }
  | {
      ok: false;
      reason: 'unsupported_host' | 'unsupported_path' | 'not_found';
    };

export async function resolveProductTarget(
  targetUrl: string,
  session?: ClientSession,
): Promise<ProductTargetResolution> {
  let parsed: URL;
  let base: URL;

  try {
    parsed = new URL(targetUrl);
    base = new URL(seoConfig.baseUrl);
  } catch {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) {
    return { ok: false, reason: 'unsupported_host' };
  }

  const match = PRODUCT_PATH_PATTERN.exec(parsed.pathname);
  const slug = match?.[1];

  if (!slug) {
    return { ok: false, reason: 'unsupported_path' };
  }

  const product = await Product.findOne({
    slug,
    status: 'active',
  })
    .session(session ?? null)
    .exec();

  if (!product) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true, product };
}

function normalizeProductDescription(
  value: string | null | undefined,
): string {
  return value ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6.4A blog internal-link target resolution
// ─────────────────────────────────────────────────────────────────────────────

const BLOG_PATH_PATTERN = /^\/blog\/([^/]+)\/?$/;

type BlogTargetResolution =
  | { ok: true; blog: IBlogDoc }
  | {
      ok: false;
      reason: 'unsupported_host' | 'unsupported_path' | 'not_found';
    };

export async function resolveBlogTarget(
  targetUrl: string,
  session?: ClientSession,
): Promise<BlogTargetResolution> {
  let parsed: URL;
  let base: URL;

  try {
    parsed = new URL(targetUrl);
    base = new URL(seoConfig.baseUrl);
  } catch {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) {
    return { ok: false, reason: 'unsupported_host' };
  }

  const match = BLOG_PATH_PATTERN.exec(parsed.pathname);
  const slug = match?.[1];

  if (!slug) {
    return { ok: false, reason: 'unsupported_path' };
  }

  const blog = await Blog.findOne({ slug, status: 'published' })
    .session(session ?? null)
    .exec();

  if (!blog) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true, blog };
}

/**
 * Whether `url` resolves to a real, currently indexable Rajhans page this
 * phase recognizes as a valid link destination — product, blog, CMS page, or
 * the homepage. Deliberately conservative: an internal link is only ever
 * proposed to a page type the SEO pipeline already understands.
 */
async function isValidInternalLinkTarget(url: string, session?: ClientSession): Promise<boolean> {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(seoConfig.baseUrl);
  } catch {
    return false;
  }
  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) return false;

  if (parsed.pathname === '/' || parsed.pathname === '') return true;

  const productResult = await resolveProductTarget(url, session);
  if (productResult.ok) return true;

  const blogResult = await resolveBlogTarget(url, session);
  if (blogResult.ok) return true;

  const cmsResult = await resolveCmsPageTarget(url, session);
  if (cmsResult.ok) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/** v1 may only execute title/metaDescription. h1 (or any other field) disqualifies the whole change. */
const ALLOWED_METADATA_FIELD_KEYS = ['title', 'metaDescription'];

type FieldCheckResult = { ok: true } | { ok: false; message: string };

function checkMetadataFields(fields: MetadataProposedChange['fields']): FieldCheckResult {
  const keys = Object.keys(fields ?? {});
  const unknownKeys = keys.filter((k) => k !== 'h1' && !ALLOWED_METADATA_FIELD_KEYS.includes(k));
  if (unknownKeys.length) {
    return { ok: false, message: `Unsupported metadata field(s): ${unknownKeys.join(', ')}` };
  }
  if (fields?.h1 !== undefined) {
    return { ok: false, message: 'h1 changes cannot be executed in this phase' };
  }
  if (!fields?.title && !fields?.metaDescription) {
    return { ok: false, message: 'No executable field (title/metaDescription) was proposed' };
  }
  return { ok: true };
}

/**
 * Mongo stores metaTitle/metaDescription as '' by default, never null/undefined
 * — normalize accordingly FOR COMPARISON ONLY. This is the exact staleness
 * comparison and must never be loosened: a normalized comparison is used
 * elsewhere purely to raise an advisory warning.
 */
function normalizeForCompare(value: string | null | undefined): string {
  return value ?? '';
}

/**
 * Lossy normalization used ONLY for the advisory "effectively unchanged"
 * warning. Never used for staleness or for deciding whether a change is a no-op.
 */
function normalizeForQuality(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Control characters (including newlines and tabs) have no place in a title or meta description. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

/** The two executable draft field keys, and the Page/snapshot column each writes to. */
const EXECUTABLE_FIELDS = [
  { draftKey: 'title', snapshotKey: 'metaTitle', label: 'title' },
  { draftKey: 'metaDescription', snapshotKey: 'metaDescription', label: 'meta description' },
] as const;

type ExecutableFieldSpec = (typeof EXECUTABLE_FIELDS)[number];
type SnapshotKey = ExecutableFieldSpec['snapshotKey'];

/**
 * The execution capability this module actually implements, published so other
 * phases can DERIVE what the pipeline can do rather than restate it.
 *
 * Phase 6.1 reads these (together with the exported `resolveCmsPageTarget`) to
 * decide whether an opportunity it finds could currently flow through Phase 5
 * execution at all. Deriving it from here means the answer can never drift from
 * the executor's real behaviour: widening execution in a later phase updates
 * both the gate above and every consumer's capability report at once.
 */
export const EXECUTION_CAPABILITY = {
  /** The only draft change kind the executor accepts. */
  changeKind: 'metadata' as const,
  /** The only target type it can resolve and write. */
  targetType: 'cms_page' as const,
  /** The exact Page columns it may write. */
  fields: EXECUTABLE_FIELDS.map((f) => f.snapshotKey) as readonly SnapshotKey[],
};

// ─────────────────────────────────────────────────────────────────────────────
// The evaluator
// ─────────────────────────────────────────────────────────────────────────────

interface Accumulator {
  blockers: PreflightBlocker[];
  warnings: PreflightWarning[];
  checks: PreflightCheck[];
  changedFields: PreflightChangedFields[];
}

function block(acc: Accumulator, code: PreflightBlockerCode, message: string, targetUrl?: string): void {
  acc.blockers.push(targetUrl ? { code, message, targetUrl } : { code, message });
}

function warn(acc: Accumulator, code: PreflightWarningCode, message: string, targetUrl?: string): void {
  acc.warnings.push(targetUrl ? { code, message, targetUrl } : { code, message });
}

function record(
  acc: Accumulator,
  code: PreflightCheckCode,
  status: PreflightCheckStatus,
  message: string,
  targetUrl?: string,
): void {
  acc.checks.push(targetUrl ? { code, status, message, targetUrl } : { code, status, message });
}

/**
 * Risk is derived only from concrete facts — never from an invented numeric
 * score, and never in a way that could authorize anything. A blocker always
 * yields executable=false regardless of the level reported here.
 */
function classifyRisk(acc: Accumulator): PreflightRiskLevel {
  if (acc.blockers.length) return 'high';
  if (acc.warnings.some((w) => HIGH_RISK_WARNING_CODES.includes(w.code))) return 'high';
  const hasMediumWarning = acc.warnings.some((w) => MEDIUM_RISK_WARNING_CODES.includes(w.code));
  const broadScope = acc.changedFields.length > 1 || acc.changedFields.some((t) => t.fields.length > 1);
  if (hasMediumWarning || broadScope) return 'medium';
  return 'low';
}

function finalize(acc: Accumulator, evaluatedAt: Date): ExecutionPreflightResult {
  return {
    executable: acc.blockers.length === 0,
    riskLevel: classifyRisk(acc),
    blockers: acc.blockers,
    warnings: acc.warnings,
    checks: acc.checks,
    changedFields: acc.changedFields,
    evaluatedAt,
    evaluatorVersion: PREFLIGHT_VERSION,
  };
}

/**
 * Evaluate one draft's readiness to execute, addressed by the draft's own Mongo
 * `_id`. Performs reads only.
 *
 * Draft-level gates short-circuit in EXACTLY Phase 5.3's original order, so
 * `blockers[0].code` is always the error Phase 5.3 would have returned for the
 * same state. Per-target checks do not short-circuit the whole evaluation:
 * every target is evaluated and every blocker collected (one blocker anywhere
 * still rejects the whole execution), but they are collected in target order so
 * `blockers[0]` remains Phase 5.3's first failure.
 *
 * Pass a `session` to pin every read to an open transaction — this is what makes
 * the execution path's rerun authoritative rather than advisory.
 */
export async function evaluateExecutionPreflight(opts: {
  draftId: string;
  session?: ClientSession;
}): Promise<ExecutionPreflightEvaluation> {
  const { draftId, session } = opts;
  const evaluatedAt = new Date();
  const acc: Accumulator = { blockers: [], warnings: [], checks: [], changedFields: [] };
  const empty = (draft: ISeoChangeDraftDoc | null = null, recommendation: ISeoRecommendationDoc | null = null) => ({
    result: finalize(acc, evaluatedAt),
    prepared: [] as PreparedExecutionTarget[],
    draft,
    recommendation,
  });

  if (!mongoose.isValidObjectId(draftId)) {
    block(acc, 'invalid_id', 'Invalid draft id');
    return empty();
  }

  const draft = await SeoChangeDraft.findById(draftId).session(session ?? null).exec();
  if (!draft) {
    block(acc, 'not_found', 'Draft not found');
    record(acc, 'draft_exists', 'fail', 'Draft not found');
    return empty();
  }
  record(acc, 'draft_exists', 'pass', 'Draft found');

  // Mirrors Phase 5.3's pre-transaction fast path so preview and execution
  // agree on which reason wins for an already-executed draft. The unique index
  // on draftId (re-checked at insert time) remains the actual race-safety
  // guarantee; this is a read, and is intentionally not session-pinned, exactly
  // as Phase 5.3 does it.
  if (await SeoChangeExecution.exists({ draftId: draft._id })) {
    block(acc, 'already_executed', 'This draft has already been executed');
    record(acc, 'not_already_executed', 'fail', 'An execution already exists for this draft');
    return empty(draft);
  }
  record(acc, 'not_already_executed', 'pass', 'No execution exists for this draft yet');

  if (draft.status !== 'draft') {
    block(acc, 'not_draft', 'Only an active (non-superseded) draft can be executed');
    record(acc, 'draft_active', 'fail', `Draft status is "${draft.status}"`);
    return empty(draft);
  }
  record(acc, 'draft_active', 'pass', 'Draft is active');

  const recommendation = await SeoRecommendation.findById(draft.recommendationId).session(session ?? null).exec();
  if (!recommendation) {
    block(acc, 'recommendation_not_found', 'Recommendation not found');
    record(acc, 'recommendation_open', 'fail', 'Recommendation not found');
    return empty(draft);
  }

  if (recommendation.status !== 'open') {
    block(acc, 'not_open', 'Only an open recommendation can be executed');
    record(acc, 'recommendation_open', 'fail', `Recommendation status is "${recommendation.status}"`);
    return empty(draft, recommendation);
  }
  record(acc, 'recommendation_open', 'pass', 'Recommendation is open');

  if (recommendation.reviewStatus !== 'approved') {
    block(acc, 'not_approved', 'Only an approved recommendation can be executed');
    record(acc, 'recommendation_approved', 'fail', `Review status is "${recommendation.reviewStatus}"`);
    return empty(draft, recommendation);
  }
  record(acc, 'recommendation_approved', 'pass', 'Recommendation is approved');

  if (draft.recommendationFingerprint !== recommendation.fingerprint) {
    block(acc, 'fingerprint_mismatch', 'The recommendation has changed since this draft was generated');
    record(acc, 'fingerprint_match', 'fail', 'Recommendation fingerprint no longer matches the draft');
    return empty(draft, recommendation);
  }
  record(acc, 'fingerprint_match', 'pass', 'Recommendation fingerprint still matches the draft');

  if (!draft.validation.isValid) {
    block(acc, 'invalid_draft', 'This draft failed validation and cannot be executed');
    record(acc, 'draft_valid', 'fail', 'Draft failed its own generation-time validation');
    return empty(draft, recommendation);
  }
  if (!draft.proposedChanges.length) {
    block(acc, 'invalid_draft', 'This draft has no proposed changes');
    record(acc, 'draft_valid', 'fail', 'Draft contains no proposed changes');
    return empty(draft, recommendation);
  }
  record(acc, 'draft_valid', 'pass', 'Draft is valid and has proposed changes');

  const uniqueKinds = new Set(
    draft.proposedChanges.map((change) => change.kind),
  );

  if (uniqueKinds.size !== 1) {
    block(
      acc,
      'unsupported_kind',
      'A single execution draft cannot mix different change kinds',
    );
    record(
      acc,
      'change_kind_supported',
      'fail',
      'Mixed change kinds are outside the executable scope',
    );
    return empty(draft, recommendation);
  }

  // -------------------------------------------------------------------------
  // Phase 6.3A — Product.description content execution.
  // -------------------------------------------------------------------------
  if (draft.proposedChanges[0]?.kind === 'content') {
    const contentChanges =
      draft.proposedChanges as ContentProposedChange[];

    // Historical Phase 5.2 thin-content drafts are outline-only and contain
    // no executable field snapshot. Preserve their original contract:
    // they remain unsupported_kind rather than being reinterpreted as a
    // malformed executable product change.
    if (contentChanges.some((change) => !change.field)) {
      block(
        acc,
        'unsupported_kind',
        'Outline-only content drafts cannot be executed; regenerate the draft with executable product content support',
      );
      record(
        acc,
        'change_kind_supported',
        'fail',
        'Historical outline-only content is outside the executable scope',
      );
      return empty(draft, recommendation);
    }

    record(
      acc,
      'change_kind_supported',
      'pass',
      'All proposed changes are product content changes',
    );

    const prepared: PreparedExecutionTarget[] = [];
    const seenProductIds = new Map<string, string>();

    for (const change of contentChanges) {
      const targetUrl = change.targetUrl;

      if (
        !change.field ||
        change.field.name !== 'description'
      ) {
        const message =
          'Product content execution requires field.name="description" with exact current/proposed values';
        block(acc, 'unsupported_field', message, targetUrl);
        record(acc, 'fields_supported', 'fail', message, targetUrl);
        continue;
      }

      record(
        acc,
        'fields_supported',
        'pass',
        'Only Product.description is proposed',
        targetUrl,
      );

      if (
        typeof change.field.current !== 'string' ||
        typeof change.field.proposed !== 'string'
      ) {
        const message =
          'Product description current/proposed values must both be strings';
        block(acc, 'malformed_value', message, targetUrl);
        record(
          acc,
          'values_well_formed',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      if (!change.field.proposed.trim()) {
        const message =
          'Proposed Product.description cannot be empty';
        block(acc, 'malformed_value', message, targetUrl);
        record(
          acc,
          'values_well_formed',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      if (change.field.proposed.length > 12000) {
        const message =
          'Proposed Product.description exceeds the 12000-character structural limit';
        block(acc, 'malformed_value', message, targetUrl);
        record(
          acc,
          'values_well_formed',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      record(
        acc,
        'values_well_formed',
        'pass',
        'Product description values are well-formed strings',
        targetUrl,
      );

      const target = await resolveProductTarget(
        targetUrl,
        session,
      );

      if (!target.ok) {
        const message =
          target.reason === 'not_found'
            ? `No active Product found for ${targetUrl}`
            : `${targetUrl} is not an executable product URL`;

        block(
          acc,
          target.reason === 'not_found'
            ? 'target_not_found'
            : 'unsupported_target',
          message,
          targetUrl,
        );
        record(
          acc,
          'target_resolvable',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      const product = target.product;

      record(
        acc,
        'target_resolvable',
        'pass',
        `Resolves to active Product "${product.slug}"`,
        targetUrl,
      );

      const productId = String(product._id);
      const claimedBy = seenProductIds.get(productId);

      if (claimedBy) {
        const message =
          `${targetUrl} and ${claimedBy} both resolve to Product "${product.slug}"`;

        block(
          acc,
          'ambiguous_target',
          message,
          targetUrl,
        );
        record(
          acc,
          'target_unique',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      seenProductIds.set(productId, targetUrl);

      record(
        acc,
        'target_unique',
        'pass',
        `No other target in this draft writes "${product.slug}"`,
        targetUrl,
      );

      const liveDescription =
        normalizeProductDescription(product.description);

      if (change.field.current !== liveDescription) {
        const message =
          `Live Product.description for "${product.slug}" has changed since this draft was generated`;

        block(acc, 'stale', message, targetUrl);
        record(
          acc,
          'live_state_unchanged',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      record(
        acc,
        'live_state_unchanged',
        'pass',
        'Live Product.description still matches the draft snapshot',
        targetUrl,
      );

      if (change.field.proposed === liveDescription) {
        const message =
          `Proposed Product.description for ${targetUrl} is identical to the current value`;

        block(
          acc,
          'no_effective_change',
          message,
          targetUrl,
        );
        record(
          acc,
          'effective_change',
          'fail',
          message,
          targetUrl,
        );
        continue;
      }

      record(
        acc,
        'effective_change',
        'pass',
        'Changes Product.description',
        targetUrl,
      );

      acc.changedFields.push({
        targetUrl,
        fields: ['description'],
      });

      // Product body-copy changes always deserve a human look even when all
      // mechanical safety checks pass.
      warn(
        acc,
        'content_requires_review',
        'Product body-copy change requires human editorial review before execution',
        targetUrl,
      );

      prepared.push({
        targetType: 'product',
        targetUrl,
        product,
        before: {
          description: liveDescription,
        },
        proposed: {
          description: change.field.proposed,
        },
      });
    }

    const result = finalize(acc, evaluatedAt);

    return {
      result,
      prepared: result.executable ? prepared : [],
      draft,
      recommendation,
    };
  }

  // -------------------------------------------------------------------------
  // Phase 6.4A — blog internal-link content execution.
  // -------------------------------------------------------------------------
  if (draft.proposedChanges[0]?.kind === 'internal_link') {
    const linkChanges = draft.proposedChanges as InternalLinkProposedChange[];

    // Historical outline-only internal-link recommendations only ever named
    // an aspirational target/anchor with no concrete execution payload.
    if (linkChanges.some((change) => !change.execution || !change.sourceUrl || !change.anchorText)) {
      block(
        acc,
        'unsupported_kind',
        'Outline-only internal-link drafts cannot be executed; regenerate the draft with executable internal-link support',
      );
      record(
        acc,
        'change_kind_supported',
        'fail',
        'Historical outline-only internal-link recommendation is outside the executable scope',
      );
      return empty(draft, recommendation);
    }

    record(acc, 'change_kind_supported', 'pass', 'All proposed changes are internal-link content changes');

    const prepared: PreparedExecutionTarget[] = [];
    const seenBlogIds = new Map<string, string>();

    for (const change of linkChanges) {
      // Here "targetUrl" (as used by check()/block()) means the EXECUTION
      // target — the blog page being edited (change.sourceUrl) — not the
      // link's destination (change.targetUrl). Same convention the content
      // branch above uses for Product.
      const sourceUrl = change.sourceUrl as string;
      const linkDestination = change.targetUrl;
      const anchorText = change.anchorText as string;
      const exec = change.execution!;

      if (exec.sourcePageType !== 'blog_content') {
        const message = `Unsupported internal-link source page type "${exec.sourcePageType}"`;
        block(acc, 'unsupported_target', message, sourceUrl);
        record(acc, 'target_resolvable', 'fail', message, sourceUrl);
        continue;
      }

      if (
        typeof exec.beforeContent !== 'string' ||
        typeof exec.afterContent !== 'string' ||
        typeof exec.contextSnapshot !== 'string' ||
        !exec.contextSnapshot
      ) {
        const message = 'Internal-link execution requires beforeContent, afterContent, and a non-empty contextSnapshot';
        block(acc, 'malformed_value', message, sourceUrl);
        record(acc, 'values_well_formed', 'fail', message, sourceUrl);
        continue;
      }
      record(acc, 'values_well_formed', 'pass', 'Internal-link execution payload is well-formed', sourceUrl);

      // Self-link: the source page must not link to itself.
      const normalizePath = (u: string) => {
        try {
          const p = new URL(u);
          return `${p.origin.toLowerCase()}${p.pathname.replace(/\/+$/, '') || '/'}`;
        } catch {
          return u;
        }
      };
      if (normalizePath(sourceUrl) === normalizePath(linkDestination)) {
        const message = `${sourceUrl} cannot link to itself`;
        block(acc, 'self_link', message, sourceUrl);
        record(acc, 'link_target_valid', 'fail', message, sourceUrl);
        continue;
      }

      // External/non-Rajhans target, and the target must resolve to a page
      // type this phase actually recognizes (product, blog, CMS page, or
      // the homepage) — never propose a link to a URL that doesn't exist.
      const validTarget = await isValidInternalLinkTarget(linkDestination, session);
      if (!validTarget) {
        let parsedOk = true;
        let sameOrigin = false;
        try {
          const p = new URL(linkDestination);
          const base = new URL(seoConfig.baseUrl);
          sameOrigin = p.origin.toLowerCase() === base.origin.toLowerCase();
        } catch {
          parsedOk = false;
        }
        if (!parsedOk || !sameOrigin) {
          const message = `Internal-link target "${linkDestination}" is external or not a recognized Rajhans URL`;
          block(acc, 'external_target', message, sourceUrl);
          record(acc, 'link_target_valid', 'fail', message, sourceUrl);
        } else {
          const message = `Internal-link target "${linkDestination}" does not resolve to an existing, indexable page`;
          block(acc, 'target_not_found', message, sourceUrl);
          record(acc, 'link_target_valid', 'fail', message, sourceUrl);
        }
        continue;
      }
      record(acc, 'link_target_valid', 'pass', `Link target "${linkDestination}" resolves to an existing page`, sourceUrl);

      const target = await resolveBlogTarget(sourceUrl, session);
      if (!target.ok) {
        const message =
          target.reason === 'not_found'
            ? `No published blog post found for ${sourceUrl}`
            : `${sourceUrl} is not an executable blog URL`;
        block(acc, target.reason === 'not_found' ? 'target_not_found' : 'unsupported_target', message, sourceUrl);
        record(acc, 'target_resolvable', 'fail', message, sourceUrl);
        continue;
      }
      const blog = target.blog;
      record(acc, 'target_resolvable', 'pass', `Resolves to published blog post "${blog.slug}"`, sourceUrl);

      const blogId = String(blog._id);
      const claimedBy = seenBlogIds.get(blogId);
      if (claimedBy) {
        const message = `${sourceUrl} and ${claimedBy} both resolve to blog post "${blog.slug}"`;
        block(acc, 'ambiguous_target', message, sourceUrl);
        record(acc, 'target_unique', 'fail', message, sourceUrl);
        continue;
      }
      seenBlogIds.set(blogId, sourceUrl);
      record(acc, 'target_unique', 'pass', `No other target in this draft writes "${blog.slug}"`, sourceUrl);

      // Stale-current protection.
      const liveContent = blog.content ?? '';
      if (exec.beforeContent !== liveContent) {
        const message = `Live content for blog post "${blog.slug}" has changed since this draft was generated`;
        block(acc, 'stale', message, sourceUrl);
        record(acc, 'live_state_unchanged', 'fail', message, sourceUrl);
        continue;
      }
      record(acc, 'live_state_unchanged', 'pass', 'Live blog content still matches the draft snapshot', sourceUrl);

      // Duplicate-link protection: the source must not already link to this
      // exact target anywhere in its content.
      if (contentAlreadyLinksTo(liveContent, linkDestination)) {
        const message = `Blog post "${blog.slug}" already links to ${linkDestination}`;
        block(acc, 'duplicate_link', message, sourceUrl);
        record(acc, 'no_duplicate_link', 'fail', message, sourceUrl);
        continue;
      }
      record(acc, 'no_duplicate_link', 'pass', 'Source content does not already link to this target', sourceUrl);

      // Independently re-derive the patch from beforeContent + contextSnapshot
      // + anchorText + targetUrl — the draft's precomputed afterContent is
      // NEVER trusted; it must match this derivation byte-for-byte. This is
      // what makes "anchor not present exactly", "ambiguous occurrence", and
      // "malformed HTML" all fail-closed rather than trusting stored data.
      const derived = applyInternalLinkPatch(liveContent, exec.contextSnapshot, anchorText, linkDestination);
      if (!derived.ok) {
        const reasonMessages: Record<string, string> = {
          context_not_found: `The proposed context is no longer present in blog post "${blog.slug}"`,
          context_ambiguous: `The proposed context occurs more than once in blog post "${blog.slug}"`,
          anchor_not_in_context: `Anchor text "${anchorText}" is not present in the proposed context`,
          anchor_ambiguous_in_context: `Anchor text "${anchorText}" occurs more than once in the proposed context`,
          malformed_anchor_text: 'Anchor text contains characters that would produce malformed HTML',
          malformed_target_url: 'Link target URL contains characters that would produce malformed HTML',
        };
        const message = reasonMessages[derived.reason] ?? `Could not apply the internal-link patch (${derived.reason})`;
        const blockerCode: PreflightBlockerCode =
          derived.reason === 'context_not_found' || derived.reason === 'context_ambiguous'
            ? 'ambiguous_anchor'
            : derived.reason === 'anchor_not_in_context' || derived.reason === 'anchor_ambiguous_in_context'
              ? 'anchor_not_found'
              : 'malformed_link';
        block(acc, blockerCode, message, sourceUrl);
        record(acc, 'anchor_present', 'fail', message, sourceUrl);
        continue;
      }
      record(acc, 'anchor_present', 'pass', 'Anchor text is present exactly once in an unambiguous context', sourceUrl);

      if (derived.afterContent !== exec.afterContent) {
        const message = `Proposed afterContent for blog post "${blog.slug}" does not match the deterministic patch derived from beforeContent/contextSnapshot/anchorText`;
        block(acc, 'malformed_value', message, sourceUrl);
        record(acc, 'values_well_formed', 'fail', message, sourceUrl);
        continue;
      }

      if (derived.afterContent === liveContent) {
        const message = `Proposed change for blog post "${blog.slug}" would not change the live content`;
        block(acc, 'no_effective_change', message, sourceUrl);
        record(acc, 'effective_change', 'fail', message, sourceUrl);
        continue;
      }
      record(acc, 'effective_change', 'pass', 'Changes blog post content (adds one internal link)', sourceUrl);

      acc.changedFields.push({ targetUrl: sourceUrl, fields: ['content'] });

      // Body-content changes always deserve a human look even when every
      // mechanical safety check passes.
      warn(acc, 'content_requires_review', 'Internal-link body-content change requires human editorial review before execution', sourceUrl);

      prepared.push({
        targetType: 'blog',
        targetUrl: sourceUrl,
        blog,
        before: { content: liveContent },
        proposed: {
          content: derived.afterContent,
          linkTargetUrl: linkDestination,
          linkAnchorText: anchorText,
        },
      });
    }

    const result = finalize(acc, evaluatedAt);
    return {
      result,
      prepared: result.executable ? prepared : [],
      draft,
      recommendation,
    };
  }

  // -------------------------------------------------------------------------
  // Phase 6.5A — FAQPage schema execution on an existing CMS Page.
  //
  // The draft's `items`/`proposedJsonLd` are NEVER trusted: this branch
  // independently re-extracts Q&A pairs from the LIVE Page.content via
  // extractFaqPairsFromHtml and re-derives the canonical JSON-LD via
  // buildFaqJsonLd, requiring an exact match to what the draft proposed. A
  // draft generated against stale/edited/invented content therefore always
  // fails closed here, never silently executes a divergent schema.
  // -------------------------------------------------------------------------
  if (draft.proposedChanges[0]?.kind === 'faq') {
    const faqChanges = draft.proposedChanges as FaqProposedChange[];

    // Historical outline-only add-faq-schema drafts (always items: [], no
    // execution payload) remain unsupported_kind rather than reinterpreted.
    if (faqChanges.some((change) => !change.execution)) {
      block(acc, 'unsupported_kind', 'Outline-only FAQ schema drafts cannot be executed; regenerate the draft with executable FAQ schema support');
      record(acc, 'change_kind_supported', 'fail', 'Historical outline-only FAQ schema recommendation is outside the executable scope');
      return empty(draft, recommendation);
    }
    record(acc, 'change_kind_supported', 'pass', 'All proposed changes are FAQ schema changes');

    const prepared: PreparedExecutionTarget[] = [];
    const seenPageIds = new Map<string, string>();

    for (const change of faqChanges) {
      const targetUrl = change.targetUrl;
      const exec = change.execution!;

      if (typeof exec.sourceContentSnapshot !== 'string' || !exec.sourceContentSnapshot) {
        const message = 'FAQ schema execution requires a non-empty sourceContentSnapshot';
        block(acc, 'malformed_value', message, targetUrl);
        record(acc, 'faq_items_well_formed', 'fail', message, targetUrl);
        continue;
      }
      if (!exec.proposedJsonLd || typeof exec.proposedJsonLd !== 'object') {
        const message = 'FAQ schema execution requires a proposedJsonLd object';
        block(acc, 'malformed_value', message, targetUrl);
        record(acc, 'faq_items_well_formed', 'fail', message, targetUrl);
        continue;
      }
      record(acc, 'faq_items_well_formed', 'pass', 'FAQ schema execution payload is well-formed', targetUrl);

      const target = await resolveCmsPageTarget(targetUrl, session);
      if (!target.ok) {
        const message =
          target.reason === 'not_found'
            ? `No published CMS page found for ${targetUrl}`
            : `${targetUrl} is not an executable CMS page URL`;
        block(acc, target.reason === 'not_found' ? 'target_not_found' : 'unsupported_target', message, targetUrl);
        record(acc, 'target_resolvable', 'fail', message, targetUrl);
        continue;
      }
      const page = target.page;
      record(acc, 'target_resolvable', 'pass', `Resolves to published CMS page "${page.slug}"`, targetUrl);

      const pageId = String(page._id);
      const claimedBy = seenPageIds.get(pageId);
      if (claimedBy) {
        const message = `${targetUrl} and ${claimedBy} both resolve to CMS page "${page.slug}"`;
        block(acc, 'ambiguous_target', message, targetUrl);
        record(acc, 'target_unique', 'fail', message, targetUrl);
        continue;
      }
      seenPageIds.set(pageId, targetUrl);
      record(acc, 'target_unique', 'pass', `No other target in this draft writes "${page.slug}"`, targetUrl);

      // Stale-source protection: the visible FAQ content must not have
      // changed since the draft was generated.
      const liveContent = page.content ?? '';
      if (exec.sourceContentSnapshot !== liveContent) {
        const message = `Live content for CMS page "${page.slug}" has changed since this draft was generated`;
        block(acc, 'stale', message, targetUrl);
        record(acc, 'live_state_unchanged', 'fail', message, targetUrl);
        continue;
      }
      record(acc, 'live_state_unchanged', 'pass', 'Live FAQ page content still matches the draft snapshot', targetUrl);

      // Independently re-extract Q&A pairs from the LIVE content — this is
      // what makes "invented/non-visible answer", "empty question/answer",
      // "duplicate question", and "no FAQ entries" all fail-closed rather
      // than trusting the draft's stored items.
      const derivedItems = extractFaqPairsFromHtml(liveContent);
      if (!derivedItems.ok) {
        const reasonMessages: Record<string, string> = {
          no_faq_entries: `No <h3>Question</h3><p>Answer</p> pairs found in CMS page "${page.slug}"`,
          empty_question: `An empty question was found in CMS page "${page.slug}"`,
          empty_answer: `An empty answer was found in CMS page "${page.slug}"`,
          duplicate_question: `A duplicate question was found in CMS page "${page.slug}"`,
        };
        const message = reasonMessages[derivedItems.reason] ?? `Could not extract FAQ items (${derivedItems.reason})`;
        const blockerCode: PreflightBlockerCode = derivedItems.reason === 'duplicate_question' ? 'duplicate_question' : 'empty_faq_items';
        block(acc, blockerCode, message, targetUrl);
        record(acc, 'faq_items_well_formed', 'fail', message, targetUrl);
        continue;
      }

      const derivedItemsSorted: FaqItem[] = derivedItems.items;
      const draftItemsMatch =
        change.items.length === derivedItemsSorted.length &&
        change.items.every(
          (item, i) => item.question === derivedItemsSorted[i]!.question && item.answer === derivedItemsSorted[i]!.answer,
        );
      if (!draftItemsMatch) {
        const message = `Proposed FAQ items for "${page.slug}" do not match the deterministic reconstruction from live page content`;
        block(acc, 'schema_mismatch', message, targetUrl);
        record(acc, 'faq_schema_matches_derivation', 'fail', message, targetUrl);
        continue;
      }

      const derivedJsonLd = buildFaqJsonLd(derivedItemsSorted);
      const derivedSerialized = serializeFaqJsonLd(derivedJsonLd);
      const proposedSerialized = serializeFaqJsonLd(exec.proposedJsonLd);
      if (derivedSerialized !== proposedSerialized) {
        const message = `Proposed JSON-LD for "${page.slug}" does not match the deterministic reconstruction from live page content`;
        block(acc, 'schema_mismatch', message, targetUrl);
        record(acc, 'faq_schema_matches_derivation', 'fail', message, targetUrl);
        continue;
      }
      record(acc, 'faq_schema_matches_derivation', 'pass', 'Proposed JSON-LD matches the deterministic reconstruction exactly', targetUrl);

      // "Existing equivalent FAQPage schema already present" / no-op.
      const liveSchema = page.faqSchema ?? '';
      if (liveSchema === derivedSerialized) {
        const message = `CMS page "${page.slug}" already has this exact FAQPage schema`;
        block(acc, 'schema_already_present', message, targetUrl);
        record(acc, 'faq_schema_novel', 'fail', message, targetUrl);
        continue;
      }
      record(acc, 'faq_schema_novel', 'pass', 'No equivalent FAQPage schema is already present', targetUrl);

      acc.changedFields.push({ targetUrl, fields: ['faqSchema'] });

      prepared.push({
        targetType: 'cms_page',
        targetUrl,
        page,
        before: { faqSchema: liveSchema },
        proposed: { faqSchema: derivedSerialized },
      });
    }

    const result = finalize(acc, evaluatedAt);
    return {
      result,
      prepared: result.executable ? prepared : [],
      draft,
      recommendation,
    };
  }

  // -------------------------------------------------------------------------
  // Phase 6.6A — new Blog article creation.
  //
  // Structurally different from every other executable kind: there is no
  // existing live document to resolve/diverge from, so "stale protection"
  // here means re-verifying the proposed slug is STILL absent, re-checked
  // inside the transaction immediately before Pass 2 (the same session-
  // pinned rerun every other kind already relies on).
  // -------------------------------------------------------------------------
  if (draft.proposedChanges[0]?.kind === 'blog_create') {
    const blogCreateChanges = draft.proposedChanges as BlogCreateProposedChange[];

    if (blogCreateChanges.length !== 1) {
      block(acc, 'ambiguous_target', 'Exactly one new blog article may be created per execution');
      record(acc, 'single_article_creation', 'fail', 'More than one blog_create change was proposed in a single draft');
      return empty(draft, recommendation);
    }
    record(acc, 'single_article_creation', 'pass', 'Exactly one new article is proposed');

    const change = blogCreateChanges[0]!;
    const targetUrl = change.targetUrl;

    if (!change.execution) {
      block(acc, 'unsupported_kind', 'Outline-only blog_create drafts cannot be executed; regenerate the draft with approved article content');
      record(acc, 'change_kind_supported', 'fail', 'Historical outline-only topical-authority recommendation is outside the executable scope');
      return empty(draft, recommendation);
    }
    record(acc, 'change_kind_supported', 'pass', 'Proposed change is an executable blog article creation');
    const exec = change.execution;

    // Target URL must be a well-formed /blog/:slug/ URL on the configured
    // origin, and its slug must match exec.slug exactly — never create a
    // document whose slug disagrees with the URL the draft/report names.
    let parsedOk = true;
    let urlSlug: string | null = null;
    try {
      const parsed = new URL(targetUrl);
      const base = new URL(seoConfig.baseUrl);
      if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) parsedOk = false;
      else {
        const m = BLOG_PATH_PATTERN.exec(parsed.pathname);
        urlSlug = m?.[1] ?? null;
      }
    } catch {
      parsedOk = false;
    }
    const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!parsedOk || !urlSlug || urlSlug !== exec.slug || !slugPattern.test(exec.slug)) {
      const message = `Target URL "${targetUrl}" is not a well-formed /blog/:slug/ URL matching the proposed slug "${exec.slug}"`;
      block(acc, 'malformed_value', message, targetUrl);
      record(acc, 'values_well_formed', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }

    if (!exec.title.trim() || !exec.content.trim()) {
      const message = 'Blog article creation requires a non-empty title (rendered as the H1) and content';
      block(acc, 'malformed_value', message, targetUrl);
      record(acc, 'values_well_formed', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }
    record(acc, 'values_well_formed', 'pass', 'Slug/title/content are present and well-formed', targetUrl);

    const htmlCheck = validateArticleHtml(exec.content);
    if (!htmlCheck.ok) {
      const isSafety = ['script_tag_present', 'inline_event_handler', 'javascript_uri', 'iframe_present', 'style_tag_present'].includes(
        htmlCheck.reason,
      );
      const blockerCode: PreflightBlockerCode = isSafety ? 'unsafe_markup' : 'weak_structure';
      const message = `Article content failed its safety/structure check (${htmlCheck.reason})`;
      block(acc, blockerCode, message, targetUrl);
      record(acc, isSafety ? 'markup_safe' : 'structure_reasonable', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }
    record(acc, 'markup_safe', 'pass', 'No script/style/iframe/inline-event markup found', targetUrl);
    record(acc, 'structure_reasonable', 'pass', 'Article has at least one heading and two paragraphs', targetUrl);

    // Deterministic unsupported-claim guard: reject a small, explicit set of
    // unverifiable superlative/marketing claims that have no place in
    // grounded editorial content. Not a substitute for human review — a
    // narrow, fail-closed safety net. Shared with the autonomous article
    // quality gate (blog-content-safety.util.ts) so the two never drift.
    const foundClaim = UNSUPPORTED_CLAIM_PATTERNS.find((p) => p.test(exec.content) || p.test(exec.title));
    if (foundClaim) {
      const message = `Article content contains an unsupported/unverifiable claim matching ${foundClaim}`;
      block(acc, 'unsupported_claim', message, targetUrl);
      record(acc, 'structure_reasonable', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }

    const links = extractLinks(exec.content);
    if (!links) {
      const message = 'Article content contains a malformed <a> tag (missing href, empty anchor, or nested markup in the anchor text)';
      block(acc, 'unsafe_markup', message, targetUrl);
      record(acc, 'markup_safe', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }

    for (const link of links) {
      if (!isInternalUrl(link.href, seoConfig.baseUrl)) {
        const message = `Article links to an external or unrecognized host: ${link.href}`;
        block(acc, 'external_target', message, targetUrl);
        record(acc, 'links_internal_and_resolvable', 'fail', message, targetUrl);
        return empty(draft, recommendation);
      }
      const resolvable = await isValidInternalLinkTarget(link.href, session);
      if (!resolvable) {
        const message = `Article links to "${link.href}", which does not resolve to an existing, indexable page`;
        block(acc, 'target_not_found', message, targetUrl);
        record(acc, 'links_internal_and_resolvable', 'fail', message, targetUrl);
        return empty(draft, recommendation);
      }
    }
    record(acc, 'links_internal_and_resolvable', 'pass', `All ${links.length} embedded link(s) are internal and resolve to existing pages`, targetUrl);

    // No duplicate slug — checked against ANY status (draft or published),
    // and re-checked inside the transaction immediately before Pass 2, which
    // is this kind's entire stale-protection story (there is no existing
    // live field to diverge from; the only thing that can go stale is
    // "is this slug still free?").
    const existingBySlug = await Blog.findOne({ slug: exec.slug }).session(session ?? null).exec();
    if (existingBySlug) {
      const message = `A blog post with slug "${exec.slug}" already exists`;
      block(acc, 'slug_already_exists', message, targetUrl);
      record(acc, 'slug_available', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }
    record(acc, 'slug_available', 'pass', `Slug "${exec.slug}" is not already in use`, targetUrl);

    // No duplicate/cannibalizing target: reject an exact (case-insensitive)
    // title collision with any existing post — the only cannibalization
    // signal deterministically detectable from existing blog titles/slugs.
    const existingByTitle = await Blog.findOne({
      title: { $regex: `^${exec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
      .session(session ?? null)
      .exec();
    if (existingByTitle) {
      const message = `An existing blog post ("${existingByTitle.slug}") already has the exact same title`;
      block(acc, 'cannibalizing_target', message, targetUrl);
      record(acc, 'no_cannibalization', 'fail', message, targetUrl);
      return empty(draft, recommendation);
    }
    record(acc, 'no_cannibalization', 'pass', 'No existing post has the exact same title', targetUrl);

    acc.changedFields.push({ targetUrl, fields: ['blog_article'] });
    warn(acc, 'content_requires_review', 'New blog article creation requires human editorial review before execution', targetUrl);

    const prepared: PreparedExecutionTarget[] = [
      {
        targetType: 'blog_create',
        targetUrl,
        proposed: {
          title: exec.title,
          slug: exec.slug,
          metaTitle: exec.metaTitle,
          metaDescription: exec.metaDescription,
          excerpt: exec.excerpt,
          content: exec.content,
          tags: exec.tags,
          blogStatus: exec.status,
        },
      },
    ];

    const result = finalize(acc, evaluatedAt);
    return {
      result,
      prepared: result.executable ? prepared : [],
      draft,
      recommendation,
    };
  }

  const metadataChanges: MetadataProposedChange[] = [];
  for (const change of draft.proposedChanges) {
    if (change.kind !== 'metadata') {
      block(acc, 'unsupported_kind', `Change kind "${change.kind}" cannot be executed in this phase`);
      record(acc, 'change_kind_supported', 'fail', `Change kind "${change.kind}" is outside the executable scope`);
      return empty(draft, recommendation);
    }
    metadataChanges.push(change);
  }
  record(acc, 'change_kind_supported', 'pass', 'All proposed changes are metadata changes');

  for (const change of metadataChanges) {
    const fieldCheck = checkMetadataFields(change.fields);
    if (!fieldCheck.ok) {
      block(acc, 'unsupported_field', fieldCheck.message, change.targetUrl);
      record(acc, 'fields_supported', 'fail', fieldCheck.message, change.targetUrl);
      return empty(draft, recommendation);
    }
  }
  record(acc, 'fields_supported', 'pass', 'Only metaTitle/metaDescription are proposed');

  // ── Per-target evaluation. Every target is evaluated; a blocker anywhere
  // rejects the whole draft, and Pass 2 is never reached. ──
  const prepared: PreparedExecutionTarget[] = [];
  const seenPageIds = new Map<string, string>(); // page id → the target URL that claimed it

  for (const change of metadataChanges) {
    const targetUrl = change.targetUrl;

    const target = await resolveCmsPageTarget(targetUrl, session);
    if (!target.ok) {
      if (target.reason === 'not_found') {
        const unpublished = await findUnpublishedCmsPage(targetUrl, session);
        const message = unpublished
          ? `The CMS page for ${targetUrl} exists but is no longer published`
          : `No CMS page found for ${targetUrl}`;
        block(acc, 'target_not_found', message, targetUrl);
        record(acc, 'target_resolvable', 'fail', message, targetUrl);
      } else {
        const message = `${targetUrl} is not an executable CMS page URL`;
        block(acc, 'unsupported_target', message, targetUrl);
        record(acc, 'target_resolvable', 'fail', message, targetUrl);
      }
      continue;
    }
    const page = target.page;
    record(acc, 'target_resolvable', 'pass', `Resolves to the published CMS page "${page.slug}"`, targetUrl);

    // Two proposed changes writing the same Page would make the executed result
    // depend on ordering, and would leave the execution record's before/after
    // snapshots (and therefore rollback) ambiguous.
    const pageId = String(page._id);
    const claimedBy = seenPageIds.get(pageId);
    if (claimedBy) {
      const message = `${targetUrl} and ${claimedBy} both resolve to the CMS page "${page.slug}"`;
      block(acc, 'ambiguous_target', message, targetUrl);
      record(acc, 'target_unique', 'fail', message, targetUrl);
      continue;
    }
    seenPageIds.set(pageId, targetUrl);
    record(acc, 'target_unique', 'pass', `No other target in this draft writes "${page.slug}"`, targetUrl);

    // ── Value well-formedness. Runs before the stale comparison because a
    // non-string value cannot be meaningfully compared against live state. ──
    const malformed = checkValuesWellFormed(change, targetUrl);
    if (malformed.length) {
      for (const message of malformed) {
        block(acc, 'malformed_value', message, targetUrl);
        record(acc, 'values_well_formed', 'fail', message, targetUrl);
      }
      continue;
    }
    record(acc, 'values_well_formed', 'pass', 'Proposed values are well-formed strings', targetUrl);

    // ── Exact staleness comparison — unchanged from Phase 5.3. ──
    const stale = checkStale(change, page);
    if (stale) {
      block(acc, 'stale', stale, targetUrl);
      record(acc, 'live_state_unchanged', 'fail', stale, targetUrl);
      continue;
    }
    record(acc, 'live_state_unchanged', 'pass', 'Live values still match what this draft recorded', targetUrl);

    // ── Would this write actually change anything? ──
    const written: SnapshotKey[] = [];
    const changed: SnapshotKey[] = [];
    for (const spec of EXECUTABLE_FIELDS) {
      const field = change.fields[spec.draftKey];
      if (!field) continue;
      written.push(spec.snapshotKey);
      if (field.proposed !== normalizeForCompare(field.current)) changed.push(spec.snapshotKey);
    }

    if (!changed.length) {
      const message = `Every proposed value for ${targetUrl} is identical to the current value — executing would change nothing`;
      block(acc, 'no_effective_change', message, targetUrl);
      record(acc, 'effective_change', 'fail', message, targetUrl);
      continue;
    }
    record(acc, 'effective_change', 'pass', `Changes ${changed.join(', ')}`, targetUrl);

    acc.changedFields.push({ targetUrl, fields: written });

    // ── Advisory quality checks. Never blocking. ──
    evaluateLengthQuality(acc, change, targetUrl);
    evaluateNormalizedNoOp(acc, change, changed, targetUrl);
    await evaluateDuplicateMetadata(acc, change, page, targetUrl, session);

    const proposed: ExecutedFieldSnapshot = {};
    if (change.fields.title) proposed.metaTitle = change.fields.title.proposed;
    if (change.fields.metaDescription) proposed.metaDescription = change.fields.metaDescription.proposed;

    const before: ExecutedFieldSnapshot = {
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
    };

    prepared.push({
      targetType: 'cms_page',
      targetUrl,
      page,
      before,
      proposed,
    });
  }

  const result = finalize(acc, evaluatedAt);
  return { result, prepared: result.executable ? prepared : [], draft, recommendation };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structural validity of the proposed/current values. `proposedChanges` is a
 * Mixed schema path, so nothing before this point guarantees these are even
 * strings — without this a corrupt or hand-crafted draft could write a non-string
 * straight into Page.metaTitle.
 */
function checkValuesWellFormed(change: MetadataProposedChange, targetUrl: string): string[] {
  const problems: string[] = [];

  for (const spec of EXECUTABLE_FIELDS) {
    const field = change.fields[spec.draftKey];
    if (!field) continue;

    if (typeof field.proposed !== 'string') {
      problems.push(`Proposed ${spec.label} for ${targetUrl} is not a string`);
      continue;
    }
    if (field.current !== null && field.current !== undefined && typeof field.current !== 'string') {
      problems.push(`Recorded current ${spec.label} for ${targetUrl} is neither a string nor null`);
      continue;
    }
    if (CONTROL_CHARACTER_PATTERN.test(field.proposed)) {
      problems.push(`Proposed ${spec.label} for ${targetUrl} contains control characters`);
      continue;
    }

    const hardMax =
      spec.snapshotKey === 'metaTitle'
        ? PREFLIGHT_THRESHOLDS.hardMaxTitleLength
        : PREFLIGHT_THRESHOLDS.hardMaxDescriptionLength;
    if (field.proposed.length > hardMax) {
      problems.push(
        `Proposed ${spec.label} for ${targetUrl} is ${field.proposed.length} characters, beyond the ${hardMax}-character structural limit`,
      );
      continue;
    }

    // A page with a blank <title> is a correctness fault, not a style choice.
    // A blank meta description is a legitimate (if rarely wanted) edit and is
    // handled as a warning instead.
    if (spec.snapshotKey === 'metaTitle' && field.proposed.trim() === '') {
      problems.push(`Proposed title for ${targetUrl} is empty or whitespace only`);
    }
  }

  return problems;
}

/** The exact Phase 5.3 stale comparison. Returns a message on failure, null when fresh. */
function checkStale(change: MetadataProposedChange, page: IPageDoc): string | null {
  const fields = change.fields;
  if (fields.title && normalizeForCompare(fields.title.current) !== normalizeForCompare(page.metaTitle)) {
    return `Live metaTitle for "${page.slug}" has changed since this draft was generated`;
  }
  if (
    fields.metaDescription &&
    normalizeForCompare(fields.metaDescription.current) !== normalizeForCompare(page.metaDescription)
  ) {
    return `Live metaDescription for "${page.slug}" has changed since this draft was generated`;
  }
  return null;
}

/** Length advisories, judged on the value a search engine actually sees. */
function evaluateLengthQuality(acc: Accumulator, change: MetadataProposedChange, targetUrl: string): void {
  const notes: string[] = [];

  if (change.fields.title) {
    const stored = change.fields.title.proposed;
    const rendered = stored.length + CMS_PAGE_TITLE_BRANDING_SUFFIX.length;
    if (rendered < PREFLIGHT_THRESHOLDS.renderedTitleMinLength) {
      const message = `Proposed title renders as ${rendered} characters (with the "${CMS_PAGE_TITLE_BRANDING_SUFFIX.trim()}" suffix), below the ${PREFLIGHT_THRESHOLDS.renderedTitleMinLength}-character guideline`;
      warn(acc, 'title_too_short', message, targetUrl);
      notes.push(message);
    } else if (rendered > PREFLIGHT_THRESHOLDS.renderedTitleMaxLength) {
      const message = `Proposed title renders as ${rendered} characters (with the "${CMS_PAGE_TITLE_BRANDING_SUFFIX.trim()}" suffix), above the ${PREFLIGHT_THRESHOLDS.renderedTitleMaxLength}-character guideline and likely to be truncated`;
      warn(acc, 'title_too_long', message, targetUrl);
      notes.push(message);
    }
  }

  if (change.fields.metaDescription) {
    const proposed = change.fields.metaDescription.proposed;
    if (proposed.trim() === '') {
      const message = `Proposed meta description for ${targetUrl} is empty — the page will have no meta description`;
      warn(acc, 'blank_description', message, targetUrl);
      notes.push(message);
    } else if (proposed.length < PREFLIGHT_THRESHOLDS.descriptionMinLength) {
      const message = `Proposed meta description is ${proposed.length} characters, below the ${PREFLIGHT_THRESHOLDS.descriptionMinLength}-character guideline`;
      warn(acc, 'description_too_short', message, targetUrl);
      notes.push(message);
    } else if (proposed.length > PREFLIGHT_THRESHOLDS.descriptionMaxLength) {
      const message = `Proposed meta description is ${proposed.length} characters, above the ${PREFLIGHT_THRESHOLDS.descriptionMaxLength}-character guideline and likely to be truncated`;
      warn(acc, 'description_too_long', message, targetUrl);
      notes.push(message);
    }
  }

  record(
    acc,
    'value_lengths',
    notes.length ? 'warn' : 'pass',
    notes.length ? notes.join('; ') : 'Proposed value lengths are within the configured guidelines',
    targetUrl,
  );
}

/**
 * A change that survives only because of whitespace or letter case is real, but
 * almost certainly not what the operator intended. Advisory only — the exact
 * comparison above is what decides whether anything actually changes.
 */
function evaluateNormalizedNoOp(
  acc: Accumulator,
  change: MetadataProposedChange,
  changed: SnapshotKey[],
  targetUrl: string,
): void {
  const notes: string[] = [];

  for (const spec of EXECUTABLE_FIELDS) {
    if (!changed.includes(spec.snapshotKey)) continue;
    const field = change.fields[spec.draftKey];
    if (!field) continue;
    if (normalizeForQuality(field.proposed) !== normalizeForQuality(normalizeForCompare(field.current))) continue;

    const message = `Proposed ${spec.label} for ${targetUrl} differs from the current value only in whitespace or letter case`;
    warn(acc, spec.snapshotKey === 'metaTitle' ? 'normalized_no_op_title' : 'normalized_no_op_description', message, targetUrl);
    notes.push(message);
  }

  if (notes.length) {
    record(acc, 'effective_change', 'warn', notes.join('; '), targetUrl);
  }
}

/**
 * Would this proposal collide with another published CMS page's STORED
 * metadata? Compares the stored representation (never the rendered, brand-suffixed
 * title), excludes the target page itself, and uses one bounded indexed-status
 * query per target rather than scanning the collection.
 */
async function evaluateDuplicateMetadata(
  acc: Accumulator,
  change: MetadataProposedChange,
  page: IPageDoc,
  targetUrl: string,
  session?: ClientSession,
): Promise<void> {
  const clauses: Record<string, string>[] = [];
  // An empty value cannot meaningfully "duplicate" another page — every page
  // defaults to '' — so it is never matched.
  if (change.fields.title && change.fields.title.proposed !== '') {
    clauses.push({ metaTitle: change.fields.title.proposed });
  }
  if (change.fields.metaDescription && change.fields.metaDescription.proposed !== '') {
    clauses.push({ metaDescription: change.fields.metaDescription.proposed });
  }

  if (!clauses.length) {
    record(acc, 'no_duplicate_metadata', 'pass', 'No non-empty values to compare against other pages', targetUrl);
    return;
  }

  const clashes = await Page.find({ _id: { $ne: page._id }, status: 'published', $or: clauses })
    .select('_id slug metaTitle metaDescription')
    .limit(PREFLIGHT_THRESHOLDS.duplicateScanLimit)
    .session(session ?? null)
    .exec();

  const titleClashes = change.fields.title
    ? clashes.filter((p) => p.metaTitle === change.fields.title!.proposed).map((p) => p.slug)
    : [];
  const descriptionClashes = change.fields.metaDescription
    ? clashes.filter((p) => p.metaDescription === change.fields.metaDescription!.proposed).map((p) => p.slug)
    : [];

  const notes: string[] = [];
  if (titleClashes.length) {
    const message = `Proposed title already stored on published page(s): ${titleClashes.join(', ')}`;
    warn(acc, 'duplicate_title', message, targetUrl);
    notes.push(message);
  }
  if (descriptionClashes.length) {
    const message = `Proposed meta description already stored on published page(s): ${descriptionClashes.join(', ')}`;
    warn(acc, 'duplicate_description', message, targetUrl);
    notes.push(message);
  }

  record(
    acc,
    'no_duplicate_metadata',
    notes.length ? 'warn' : 'pass',
    notes.length ? notes.join('; ') : 'No other published CMS page stores these values',
    targetUrl,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API view — the serializable subset. Deliberately excludes `prepared`, which
// carries live mongoose documents.
// ─────────────────────────────────────────────────────────────────────────────
export function toPreflightView(result: ExecutionPreflightResult) {
  return {
    executable: result.executable,
    riskLevel: result.riskLevel,
    blockers: result.blockers,
    warnings: result.warnings,
    checks: result.checks,
    changedFields: result.changedFields,
    evaluatedAt: result.evaluatedAt,
    evaluatorVersion: result.evaluatorVersion,
  };
}
