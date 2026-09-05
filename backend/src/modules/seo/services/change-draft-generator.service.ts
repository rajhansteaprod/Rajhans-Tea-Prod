import mongoose from 'mongoose';
import { SeoRecommendation, ISeoRecommendationDoc } from '../models/seo-recommendation.model';
import {
  SeoChangeDraft,
  ISeoChangeDraftDoc,
  ProposedChange,
  ChangeDraftValidation,
  MetadataProposedChange,
  StructuredDataProposedChange,
  InternalLinkProposedChange,
  ContentProposedChange,
  FaqProposedChange,
  GenericProposedChange,
} from '../models/seo-change-draft.model';
import { seoConfig } from '../seo.config';

/**
 * Phase 5.2 — deterministic, rule-based generator that turns an APPROVED, OPEN
 * SeoRecommendation into a structured SeoChangeDraft. GENERATION ONLY: never
 * calls DataForSEO/GSC/an LLM, never mutates the recommendation's review/open
 * state, and never touches Product/Category/CMS content, templates, the
 * sitemap, or any live SEO field. Same recommendation/evidence state always
 * produces the same proposal for a given `GENERATOR_VERSION`.
 */
export const GENERATOR_VERSION = '5.2.0-rule-v1';

// Bounds draft size for recommendations that span many URLs (e.g. a
// site-wide schema gap) so a single draft never balloons unboundedly.
const MAX_ENTRIES_PER_DRAFT = 25;
const REQUIRED_PLACEHOLDER = 'REQUIRED — populate before use';
const CONTENT_OUTLINE_HEADINGS = ['Overview', 'Usage & Brewing', 'Sourcing', 'FAQs'];
const SCHEMA_TYPE_BY_RECOMMENDATION: Record<string, string> = {
  'add-organization-schema': 'Organization',
  'add-breadcrumb-schema': 'BreadcrumbList',
  'add-article-schema': 'Article',
  'product-schema-completeness': 'Product',
};

export type GenerateDraftError = 'not_found' | 'not_open' | 'not_approved';

export type GenerateDraftResult =
  | { ok: true; draft: ISeoChangeDraftDoc }
  | { ok: false; error: GenerateDraftError; message: string };

/**
 * Generate a new change draft for one recommendation, addressed by its
 * persisted Mongo `_id` (never the human-readable `recommendationId`, which
 * is not guaranteed globally unique once fingerprint discriminators are
 * involved — the same identity rule Phase 5.1 review already follows).
 */
export async function generateChangeDraft(opts: {
  recommendationId: string;
  generatedBy: string;
}): Promise<GenerateDraftResult> {
  if (!mongoose.isValidObjectId(opts.recommendationId)) {
    return { ok: false, error: 'not_found', message: 'Invalid recommendation id' };
  }
  const rec = await SeoRecommendation.findById(opts.recommendationId).exec();
  if (!rec) return { ok: false, error: 'not_found', message: 'Recommendation not found' };
  if (rec.status !== 'open') {
    return { ok: false, error: 'not_open', message: 'Only an open recommendation can generate a draft' };
  }
  if (rec.reviewStatus !== 'approved') {
    return { ok: false, error: 'not_approved', message: 'Only an approved recommendation can generate a draft' };
  }

  const { proposedChanges, warnings } = buildProposedChanges(rec);
  const validation = validateProposedChanges(proposedChanges, warnings);

  // Regeneration/versioning — CREATE FIRST, then supersede. If create() throws,
  // the previous active draft must remain untouched (never left with zero active
  // drafts). Only once the replacement is safely persisted do we flip the OLDER
  // active draft(s) to 'superseded', explicitly excluding the new one by _id.
  const draft = await SeoChangeDraft.create({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    targetUrl: rec.affectedUrls[0] ?? '',
    source: rec.source ?? 'audit',
    type: rec.category,
    status: 'draft',
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date(),
    generatedBy: new mongoose.Types.ObjectId(opts.generatedBy),
    inputSnapshot: buildInputSnapshot(rec),
    proposedChanges,
    validation,
  });

  await SeoChangeDraft.updateMany(
    { recommendationId: rec._id, status: 'draft', _id: { $ne: draft._id } },
    { $set: { status: 'superseded' } },
  ).exec();

  return { ok: true, draft };
}

/** Whether a recommendation (by Mongo _id) exists, for the controller's 404 check. */
export async function recommendationExists(recommendationId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(recommendationId)) return false;
  return !!(await SeoRecommendation.exists({ _id: recommendationId }));
}

/** Draft history for one recommendation, newest first. Null ⇒ invalid id. */
export async function listChangeDrafts(recommendationId: string): Promise<ISeoChangeDraftDoc[] | null> {
  if (!mongoose.isValidObjectId(recommendationId)) return null;
  return SeoChangeDraft.find({ recommendationId }).sort({ generatedAt: -1 }).exec();
}

/** Single draft by its own _id. Null ⇒ invalid id or not found. */
export async function getChangeDraftById(draftId: string): Promise<ISeoChangeDraftDoc | null> {
  if (!mongoose.isValidObjectId(draftId)) return null;
  return SeoChangeDraft.findById(draftId).exec();
}

export function toChangeDraftView(doc: ISeoChangeDraftDoc) {
  return {
    id: String(doc._id),
    recommendationId: String(doc.recommendationId),
    recommendationFingerprint: doc.recommendationFingerprint,
    targetUrl: doc.targetUrl,
    source: doc.source,
    type: doc.type,
    status: doc.status,
    generatorVersion: doc.generatorVersion,
    generatedAt: doc.generatedAt,
    generatedBy: String(doc.generatedBy),
    inputSnapshot: doc.inputSnapshot,
    proposedChanges: doc.proposedChanges,
    validation: doc.validation,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence-grounded snapshot — captured verbatim from the recommendation so a
// human reviewer can see exactly what the proposal was derived from.
// ─────────────────────────────────────────────────────────────────────────────
function buildInputSnapshot(rec: ISeoRecommendationDoc): Record<string, unknown> {
  return {
    recommendationId: rec.recommendationId,
    fingerprint: rec.fingerprint,
    category: rec.category,
    priority: rec.priority,
    impact: rec.impact,
    score: rec.score,
    title: rec.title,
    why: rec.why,
    suggestedFix: rec.suggestedFix,
    estimatedEffort: rec.estimatedEffort,
    affectedUrls: rec.affectedUrls,
    evidence: rec.evidence,
    relatedCheckIds: rec.relatedCheckIds,
    source: rec.source,
    demandBonus: rec.demandBonus,
    demandImpressions: rec.demandImpressions,
    reviewStatus: rec.reviewStatus,
    reviewNote: rec.reviewNote,
    reviewedAt: rec.reviewedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher — one deterministic generator per recommendation category.
// Anything not explicitly covered gets the safe generic fallback.
// ─────────────────────────────────────────────────────────────────────────────
function buildProposedChanges(rec: ISeoRecommendationDoc): { proposedChanges: ProposedChange[]; warnings: string[] } {
  switch (rec.category) {
    case 'metadata':
      return generateMetadataChanges(rec);
    case 'schema':
      return generateSchemaChanges(rec);
    case 'internal-linking':
      return generateInternalLinkChanges(rec);
    case 'content':
      return generateContentChanges(rec);
    default:
      return generateGenericChange(rec);
  }
}

/** Bounds a list to MAX_ENTRIES_PER_DRAFT, recording a warning when truncated. */
function cap<T>(items: T[], warnings: string[], label: string): T[] {
  if (items.length <= MAX_ENTRIES_PER_DRAFT) return items;
  warnings.push(`Only the first ${MAX_ENTRIES_PER_DRAFT} of ${items.length} affected ${label} are included in this draft.`);
  return items.slice(0, MAX_ENTRIES_PER_DRAFT);
}

/** Mechanical, deterministic label from a URL's last path segment — never a fabricated claim. */
function humanizeSlug(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    if (!last) return '';
    return last
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return '';
  }
}

function isValidUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively walks a JSON-LD value (objects/arrays) looking for an EXACT
 * `REQUIRED_PLACEHOLDER` occurrence — never a substring/fuzzy match. Used to
 * block publication-readiness (isValid=false) while a schema skeleton still
 * has unresolved business-specific fields, so a future execution phase can
 * never mistake a placeholder for real content.
 */
function containsPlaceholder(value: unknown): boolean {
  if (value === REQUIRED_PLACEHOLDER) return true;
  if (Array.isArray(value)) return value.some((v) => containsPlaceholder(v));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) => containsPlaceholder(v));
  }
  return false;
}

// The technical audit records the RENDERED <title>, but a CMS Page's frontend
// template appends this suffix at render time (never stored in Page.metaTitle).
// Only ever strip one exact TRAILING occurrence — never a global replace, and
// never anywhere but at the end of the string.
const CMS_PAGE_TITLE_BRANDING_SUFFIX = ' — Rajhans Tea';
const CMS_PAGE_TARGET_PATH_PATTERN = /^\/page\/([^/]+)\/?$/;

/** True only for a canonical `/page/:slug/` URL on the configured public origin — the one target shape whose rendered <title> carries the frontend's appended branding suffix. */
function isCmsPageTargetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(seoConfig.baseUrl);
    return parsed.origin.toLowerCase() === base.origin.toLowerCase() && CMS_PAGE_TARGET_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Convert a rendered <title> back to the CMS Page STORAGE representation
 * (i.e. what is actually in Page.metaTitle) for CMS Page targets ONLY, so a
 * generated draft's `current` — and any `proposed` built from it — truthfully
 * reflects what Phase 5.3 will compare against and write. Product/blog/
 * category/other targets are returned unchanged: their rendered title IS the
 * stored value, with no frontend-appended suffix to reverse.
 */
function toStorageTitle(renderedTitle: string, targetUrl: string): string {
  if (!isCmsPageTargetUrl(targetUrl)) return renderedTitle;
  if (renderedTitle.endsWith(CMS_PAGE_TITLE_BRANDING_SUFFIX)) {
    return renderedTitle.slice(0, -CMS_PAGE_TITLE_BRANDING_SUFFIX.length);
  }
  return renderedTitle;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) metadata — duplicate-metadata: current values come straight from stored
// evidence; the proposed value is a mechanical differentiation (append the
// page's own URL-derived label) — never invented marketing copy.
// ─────────────────────────────────────────────────────────────────────────────
function generateMetadataChanges(rec: ISeoRecommendationDoc): { proposedChanges: ProposedChange[]; warnings: string[] } {
  const warnings: string[] = [];
  const evidence = rec.evidence as {
    sharedTitles?: { value: unknown; urls: string[] }[];
    sharedDescriptions?: { value: unknown; urls: string[] }[];
    opportunityType?: string;
    pageState?: {
      title?: string | null;
      metaDescription?: string | null;
    };
    evidenceRefs?: {
      facts?: Record<string, unknown>;
    }[];
  };

  // Phase 6.2 content metadata recommendation.
  // A rendered CMS title can be:
  //   "Privacy Policy — Rajhans Tea — Rajhans Tea"
  //
  // The frontend appends one branding suffix automatically. Therefore the
  // stored CMS value is:
  //   "Privacy Policy — Rajhans Tea"
  //
  // When the detector proves that the trailing segment is repeated, the
  // deterministic storage fix is:
  //   "Privacy Policy"
  //
  // No marketing copy is invented and the description is left untouched.
  if (
    rec.source === 'content' &&
    rec.recommendationId === 'content-opportunity:metadata-opportunity'
  ) {
    const repeatedSegment = evidence.evidenceRefs
      ?.map((ref) => ref.facts?.repeatedTrailingTitleSegment)
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const renderedTitle = evidence.pageState?.title ?? null;
    const targetUrl = rec.affectedUrls[0] ?? '';

    if (repeatedSegment && renderedTitle && targetUrl) {
      const storageCurrent = toStorageTitle(renderedTitle, targetUrl);

      const escaped = repeatedSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const trailing = new RegExp(`\\s*(?:—|–|-|\\|)\\s*${escaped}\\s*$`, 'i');
      const proposed = storageCurrent.replace(trailing, '').trim();

      if (proposed && proposed !== storageCurrent) {
        return {
          proposedChanges: [{
            kind: 'metadata',
            targetUrl,
            fields: {
              title: {
                current: storageCurrent,
                proposed,
              },
            },
          }],
          warnings,
        };
      }

      warnings.push(
        `${targetUrl}: repeated title segment was detected but a safe storage-level removal could not be derived.`,
      );
    }
  }
  const sharedTitles = evidence.sharedTitles ?? [];
  const sharedDescriptions = evidence.sharedDescriptions ?? [];

  const titleByUrl = new Map<string, string>();
  for (const g of sharedTitles) {
    if (g.value == null) continue;
    for (const u of g.urls) titleByUrl.set(u, String(g.value));
  }
  const descByUrl = new Map<string, string>();
  for (const g of sharedDescriptions) {
    if (g.value == null) continue;
    for (const u of g.urls) descByUrl.set(u, String(g.value));
  }

  const urls = cap(rec.affectedUrls, warnings, 'pages');
  const changes: MetadataProposedChange[] = [];
  for (const url of urls) {
    const label = humanizeSlug(url);
    const fields: MetadataProposedChange['fields'] = {};

    const currentTitle = titleByUrl.get(url);
    if (currentTitle) {
      const storageTitle = toStorageTitle(currentTitle, url);
      fields.title = { current: storageTitle, proposed: label ? `${storageTitle} — ${label}` : storageTitle };
    }
    const currentDesc = descByUrl.get(url);
    if (currentDesc) {
      fields.metaDescription = { current: currentDesc, proposed: label ? `${currentDesc} ${label}.` : currentDesc };
    }

    if (!fields.title && !fields.metaDescription) {
      warnings.push(`${url}: no duplicate title/description value found in evidence — skipped.`);
      continue;
    }
    if (!label) {
      warnings.push(`${url}: could not derive a distinguishing label from the URL — proposed value may still collide with other pages.`);
    }
    changes.push({ kind: 'metadata', targetUrl: url, fields });
  }

  if (!changes.length) {
    return generateGenericChange(rec, [
      ...warnings,
      'No per-page duplicate title/description values were available in evidence; falling back to a generic proposal.',
    ]);
  }

  return { proposedChanges: changes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) schema — structured-data recommendations. JSON-LD skeletons use only
// known facts (the target URL, the schema type); business-specific fields
// (name/logo/price/…) are left as an explicit placeholder rather than
// fabricated. add-faq-schema is handled separately (kind 'faq') since it is
// specifically about Q&A content, not a generic schema skeleton.
// ─────────────────────────────────────────────────────────────────────────────
function generateSchemaChanges(rec: ISeoRecommendationDoc): { proposedChanges: ProposedChange[]; warnings: string[] } {
  const warnings: string[] = [];
  const evidence = rec.evidence as { pages?: { url: string; schemaTypes?: string[] }[] };
  const urls = evidence.pages?.length ? evidence.pages.map((p) => p.url) : rec.affectedUrls;
  const capped = cap(urls, warnings, 'pages');

  if (!capped.length) {
    return generateGenericChange(rec, [...warnings, 'No page URLs found in evidence for this schema recommendation.']);
  }

  if (rec.recommendationId === 'add-faq-schema') {
    const changes: FaqProposedChange[] = capped.map((url) => ({ kind: 'faq', targetUrl: url, items: [] }));
    warnings.push(
      'No FAQ question/answer content was found in stored evidence; add real Q&A content to each item before this schema can be published.',
    );
    return { proposedChanges: changes, warnings };
  }

  const schemaType = SCHEMA_TYPE_BY_RECOMMENDATION[rec.recommendationId];
  if (!schemaType) {
    return generateGenericChange(rec, [
      ...warnings,
      `Unrecognized schema recommendation "${rec.recommendationId}" — falling back to a generic proposal.`,
    ]);
  }

  const changes: StructuredDataProposedChange[] = capped.map((url) => ({
    kind: 'structured_data',
    targetUrl: url,
    schemaType,
    jsonLd: buildJsonLdSkeleton(schemaType, url),
  }));
  warnings.push(
    `This is a structural JSON-LD skeleton only — fields marked "${REQUIRED_PLACEHOLDER}" are not filled in because that content is not present in stored recommendation evidence.`,
  );
  return { proposedChanges: changes, warnings };
}

function buildJsonLdSkeleton(schemaType: string, url: string): Record<string, unknown> {
  switch (schemaType) {
    case 'Organization':
      return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        url,
        name: REQUIRED_PLACEHOLDER,
        logo: REQUIRED_PLACEHOLDER,
        sameAs: [],
      };
    case 'BreadcrumbList':
      return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] };
    case 'Article':
      return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        mainEntityOfPage: url,
        headline: REQUIRED_PLACEHOLDER,
        author: REQUIRED_PLACEHOLDER,
        datePublished: REQUIRED_PLACEHOLDER,
        image: REQUIRED_PLACEHOLDER,
      };
    case 'Product':
      return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        url,
        name: REQUIRED_PLACEHOLDER,
        offers: {
          '@type': 'Offer',
          price: REQUIRED_PLACEHOLDER,
          priceCurrency: REQUIRED_PLACEHOLDER,
          availability: REQUIRED_PLACEHOLDER,
        },
      };
    default:
      return { '@context': 'https://schema.org', '@type': schemaType };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) internal-linking — the target page is always known from evidence; the
// SOURCE page is never recorded by the current audit generators (only an
// aggregate count), so sourceUrl is left null with a warning rather than
// invented. Anchor text is a mechanical suggestion from the target's own URL.
// ─────────────────────────────────────────────────────────────────────────────
function generateInternalLinkChanges(rec: ISeoRecommendationDoc): { proposedChanges: ProposedChange[]; warnings: string[] } {
  const warnings: string[] = [];
  let targets: string[];
  if (rec.recommendationId === 'fix-redirecting-links') {
    const evidence = rec.evidence as { redirectTargets?: { canonical: string }[] };
    targets = (evidence.redirectTargets ?? []).map((r) => r.canonical);
  } else {
    targets = rec.affectedUrls;
  }

  if (!targets.length) {
    return generateGenericChange(rec, [...warnings, 'No target URLs found in evidence for this internal-linking recommendation.']);
  }

  const capped = cap(targets, warnings, 'link targets');
  const changes: InternalLinkProposedChange[] = capped.map((targetUrl) => ({
    kind: 'internal_link',
    targetUrl,
    sourceUrl: null,
    anchorText: humanizeSlug(targetUrl) || null,
  }));
  warnings.push(
    'Source page(s) to add the link from are not recorded in stored evidence and must be chosen manually; anchor text is a mechanical suggestion derived from the target URL.',
  );
  return { proposedChanges: changes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) content — thin-content: headings are a fixed structural outline, never
// fabricated body copy. Body is left blank for a human to author.
// ─────────────────────────────────────────────────────────────────────────────
function generateContentChanges(rec: ISeoRecommendationDoc): { proposedChanges: ProposedChange[]; warnings: string[] } {
  const warnings: string[] = [];
  const evidence = rec.evidence as {
    pages?: { url: string; wordCount: number | null; hasH1: boolean | null }[];
    wordCountThreshold?: number;
  };
  const pages: { url: string; wordCount: number | null; hasH1: boolean | null }[] = evidence.pages?.length
    ? evidence.pages
    : rec.affectedUrls.map((url) => ({ url, wordCount: null, hasH1: null }));

  if (!pages.length) {
    return generateGenericChange(rec, [...warnings, 'No page URLs found in evidence for this content recommendation.']);
  }

  const capped = cap(pages, warnings, 'pages');
  const changes: ContentProposedChange[] = capped.map((p) => ({
    kind: 'content',
    targetUrl: p.url,
    blocks: CONTENT_OUTLINE_HEADINGS.map((heading) => ({ heading, body: '' })),
  }));
  warnings.push(
    'Section headings are a structural outline only; body copy is intentionally left blank — original, factual content must be authored by a human, not fabricated.',
  );
  if (evidence.wordCountThreshold != null) {
    warnings.push(`Current word counts are below the ${evidence.wordCountThreshold}-word thin-content threshold; see inputSnapshot for per-page counts.`);
  }
  return { proposedChanges: changes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) generic fallback — any category without a dedicated deterministic rule
// (indexability, crawl, topical-authority, search-opportunity, and every
// market category). Structures the existing recommendation fields; invents
// nothing new.
// ─────────────────────────────────────────────────────────────────────────────
function generateGenericChange(
  rec: ISeoRecommendationDoc,
  extraWarnings: string[] = [],
): { proposedChanges: ProposedChange[]; warnings: string[] } {
  const warnings = [
    ...extraWarnings,
    'No deterministic rule covers this recommendation category/type in detail; generated a generic structured proposal from the recommendation title/why/suggestedFix.',
  ];
  const targetUrl = rec.affectedUrls[0] ?? '';
  const change: GenericProposedChange = {
    kind: 'generic',
    targetUrl,
    summary: rec.title,
    instructions: rec.suggestedFix || rec.why,
    details: {
      why: rec.why,
      affectedUrls: rec.affectedUrls,
      category: rec.category,
      recommendationId: rec.recommendationId,
    },
  };
  return { proposedChanges: [change], warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation — every generated draft is checked before persistence.
// ─────────────────────────────────────────────────────────────────────────────
function validateProposedChanges(changes: ProposedChange[], generationWarnings: string[]): ChangeDraftValidation {
  const warnings = [...generationWarnings];
  const errors: string[] = [];

  if (!changes.length) errors.push('No proposed changes were generated.');

  changes.forEach((change, i) => {
    const label = `proposedChanges[${i}] (${change.kind})`;
    if (!isValidUrl(change.targetUrl)) errors.push(`${label}: targetUrl is missing or invalid.`);

    switch (change.kind) {
      case 'metadata': {
        const { title, metaDescription, h1 } = change.fields;
        if (!title && !metaDescription && !h1) {
          errors.push(`${label}: no proposed fields.`);
          break;
        }
        if (title) {
          if (!title.proposed.trim()) errors.push(`${label}: title.proposed is empty.`);
          else if (title.proposed.length > 60) warnings.push(`${label}: proposed title is ${title.proposed.length} chars (recommended ≤60).`);
          else if (title.proposed.length < 15) warnings.push(`${label}: proposed title is very short (${title.proposed.length} chars).`);
        }
        if (metaDescription) {
          if (!metaDescription.proposed.trim()) errors.push(`${label}: metaDescription.proposed is empty.`);
          else if (metaDescription.proposed.length > 160)
            warnings.push(`${label}: proposed meta description is ${metaDescription.proposed.length} chars (recommended ≤160).`);
          else if (metaDescription.proposed.length < 50)
            warnings.push(`${label}: proposed meta description is short (${metaDescription.proposed.length} chars).`);
        }
        break;
      }
      case 'structured_data': {
        if (!change.jsonLd || !change.jsonLd['@context'] || !change.jsonLd['@type']) {
          errors.push(`${label}: jsonLd is missing @context/@type.`);
        }
        try {
          JSON.stringify(change.jsonLd);
        } catch {
          errors.push(`${label}: jsonLd is not serializable.`);
        }
        if (containsPlaceholder(change.jsonLd)) {
          errors.push(`${label}: jsonLd contains unresolved required placeholders.`);
        }
        break;
      }
      case 'internal_link': {
        if (!change.sourceUrl) warnings.push(`${label}: sourceUrl not determinable from evidence.`);
        else if (!isValidUrl(change.sourceUrl)) errors.push(`${label}: sourceUrl is invalid.`);
        if (!change.anchorText || !change.anchorText.trim()) warnings.push(`${label}: anchorText not determinable from evidence.`);
        break;
      }
      case 'content': {
        if (!change.blocks.length) errors.push(`${label}: no content blocks proposed.`);
        break;
      }
      case 'faq': {
        if (!change.items.length) warnings.push(`${label}: no FAQ items — insufficient evidence to propose Q&A content.`);
        break;
      }
      case 'generic': {
        if (!change.instructions || !change.instructions.trim()) errors.push(`${label}: instructions are empty.`);
        if (!change.summary || !change.summary.trim()) warnings.push(`${label}: summary is empty.`);
        break;
      }
    }
  });

  return { isValid: errors.length === 0, warnings, errors };
}
