import mongoose, { ClientSession } from 'mongoose';
import { SeoRecommendation, ISeoRecommendationDoc } from '../models/seo-recommendation.model';
import { SeoChangeDraft, ISeoChangeDraftDoc, MetadataProposedChange } from '../models/seo-change-draft.model';
import { SeoChangeExecution, ExecutedFieldSnapshot } from '../models/seo-change-execution.model';
import { Page, IPageDoc } from '../../cms/models/page.model';
import { CANONICAL_PAGE_SLUG } from '../../cms/page-slug.util';
import { seoConfig } from '../seo.config';

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
  | 'ambiguous_target';

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
  | 'blank_description';

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
  | 'no_duplicate_metadata';

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
  fields: ('metaTitle' | 'metaDescription')[];
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
export interface PreparedExecutionTarget {
  targetUrl: string;
  page: IPageDoc;
  before: ExecutedFieldSnapshot;
  proposed: ExecutedFieldSnapshot;
}

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

    prepared.push({ targetUrl, page, before, proposed });
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
