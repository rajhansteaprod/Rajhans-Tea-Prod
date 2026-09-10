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
  BlogCreateProposedChange,
  GenericProposedChange,
} from '../models/seo-change-draft.model';
import { seoConfig } from '../seo.config';
import { Product } from '../../catalog/models/product.model';
import { ProductVariant } from '../../catalog/models/product-variant.model';
import { Blog } from '../../cms/models/blog.model';
import { Page } from '../../cms/models/page.model';
import { applyInternalLinkPatch, contentAlreadyLinksTo, countOccurrences } from './internal-link-patch.util';
import { validateArticleHtml, extractLinks } from './blog-content-safety.util';
import { extractFaqPairsFromHtml, buildFaqJsonLd } from './faq-schema.util';
import {
  generateGroundedProductDraft,
} from '../ai/openai-seo-drafting.service';
import {
  ProductContentEvidence,
} from '../ai/seo-ai.types';
import { generateGroundedBlogDraft } from '../ai/openai-seo-blog-drafting.service';
import { planArticleAngle } from '../ai/blog-content-planner';
import { BlogContentEvidence, ExistingBlogSummary } from '../ai/blog-ai.types';

/**
 * Phase 5.2 — deterministic, rule-based generator that turns an APPROVED, OPEN
 * SeoRecommendation into a structured SeoChangeDraft. GENERATION ONLY: never
 * calls DataForSEO/GSC/an LLM, never mutates the recommendation's review/open
 * state, and never touches Product/Category/CMS content, templates, the
 * sitemap, or any live SEO field. Same recommendation/evidence state always
 * produces the same proposal for a given `GENERATOR_VERSION`.
 */
export const GENERATOR_VERSION = '6.7.0-ai-product-content-and-article-drafting-v1';

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

  const {
    proposedChanges,
    warnings,
    generationEvidence,
  } = await buildProposedChanges(rec);

  const validation =
    validateProposedChanges(proposedChanges, warnings);

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
    inputSnapshot: {
      ...buildInputSnapshot(rec),
      generationEvidence,
    },
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
interface GeneratedProposal {
  proposedChanges: ProposedChange[];
  warnings: string[];
  generationEvidence?: Record<string, unknown>;
}

async function buildProposedChanges(
  rec: ISeoRecommendationDoc,
): Promise<GeneratedProposal> {
  switch (rec.category) {
    case 'metadata':
      return generateMetadataChanges(rec);

    case 'schema':
      return await generateSchemaChanges(rec);

    case 'internal-linking':
      return await generateInternalLinkChanges(rec);

    case 'content':
      return generateContentChanges(rec);

    case 'topical-authority':
      return generateBlogCreateChanges(rec);

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
async function generateSchemaChanges(rec: ISeoRecommendationDoc): Promise<{ proposedChanges: ProposedChange[]; warnings: string[] }> {
  const warnings: string[] = [];
  const evidence = rec.evidence as { pages?: { url: string; schemaTypes?: string[] }[] };
  const urls = evidence.pages?.length ? evidence.pages.map((p) => p.url) : rec.affectedUrls;
  const capped = cap(urls, warnings, 'pages');

  if (!capped.length) {
    return generateGenericChange(rec, [...warnings, 'No page URLs found in evidence for this schema recommendation.']);
  }

  if (rec.recommendationId === 'add-faq-schema') {
    return await generateFaqSchemaChanges(capped, warnings);
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

/** Only `/page/:slug/` (or without the trailing slash) on the configured public origin — the one target shape add-faq-schema ever proposes. */
const FAQ_CMS_PAGE_PATH_PATTERN = /^\/page\/([^/]+)\/?$/;

/**
 * Phase 6.5A — for each add-faq-schema target that resolves to a published
 * CMS Page, deterministically extract the page's own visible `<h3>Question
 * </h3><p>Answer</p>` pairs (never invented, never rewritten — see
 * faq-schema.util.ts) and build an executable FAQPage schema proposal from
 * them. Falls back to the historical outline-only proposal (`items: []`,
 * no `execution`) whenever the target isn't a resolvable CMS page or its
 * content contains no safe, well-formed FAQ pairs.
 */
async function generateFaqSchemaChanges(
  targetUrls: string[],
  warnings: string[],
): Promise<{ proposedChanges: ProposedChange[]; warnings: string[] }> {
  const changes: FaqProposedChange[] = [];
  const skipped: { targetUrl: string; reason: string }[] = [];

  for (const targetUrl of targetUrls) {
    let slug: string | null = null;
    try {
      const parsed = new URL(targetUrl);
      const base = new URL(seoConfig.baseUrl);
      if (parsed.origin.toLowerCase() === base.origin.toLowerCase()) {
        const match = FAQ_CMS_PAGE_PATH_PATTERN.exec(parsed.pathname);
        if (match) slug = match[1]!.toLowerCase();
      }
    } catch {
      slug = null;
    }

    if (!slug) {
      skipped.push({ targetUrl, reason: 'not_a_cms_page_url' });
      changes.push({ kind: 'faq', targetUrl, items: [] });
      continue;
    }

    const page = await Page.findOne({ slug, status: 'published' }).lean();
    if (!page) {
      skipped.push({ targetUrl, reason: 'page_not_found' });
      changes.push({ kind: 'faq', targetUrl, items: [] });
      continue;
    }

    const content = page.content ?? '';
    const extracted = extractFaqPairsFromHtml(content);
    if (!extracted.ok) {
      skipped.push({ targetUrl, reason: extracted.reason });
      changes.push({ kind: 'faq', targetUrl, items: [] });
      continue;
    }

    const proposedJsonLd = buildFaqJsonLd(extracted.items);
    changes.push({
      kind: 'faq',
      targetUrl,
      items: extracted.items,
      execution: {
        sourceContentSnapshot: content,
        proposedJsonLd,
      },
    });
  }

  if (skipped.length) {
    for (const { targetUrl, reason } of skipped) {
      warnings.push(`${targetUrl}: could not derive an executable FAQ schema (${reason}) — falling back to an outline-only recommendation.`);
    }
  }
  if (changes.some((c) => c.execution)) {
    warnings.push('FAQ question/answer content is the exact visible text already rendered on the page — nothing was invented.');
  }

  return { proposedChanges: changes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) topical-authority — Phase 6.6A executable "create a brand-new blog
// article" proposal. The article is brand-new content, so there is no live
// field to deterministically re-derive it from the way internal-link/FAQ
// execution do; instead, this generator uses an explicit, COMMITTED table of
// already human-approved article text, keyed by the recommendation's own
// `evidence.entity`. This keeps generation fully deterministic (no OpenAI
// call) whenever a human has pre-approved the exact wording — which is the
// ONLY case v1 executes. A topical-authority-gap recommendation for an
// entity with no approved entry here falls back to the historical outline-
// only proposal (no execution payload), exactly like every other generator
// in this file when evidence is insufficient.
// ─────────────────────────────────────────────────────────────────────────────

interface ApprovedBlogArticle {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  content: string;
  tags: string[];
}

/**
 * Human-approved article text, committed verbatim as reviewed — never
 * rewritten or regenerated by this generator. See the session's editorial
 * review for the Assam entry's provenance: grounded only in Product
 * "rajhans-royal-assam" and the existing "garden-to-cup-tea-journey" /
 * "art-of-perfect-tea-brewing" blog posts, with every unsupported claim
 * (market-ranking claims, climate/soil causation, health benefits) removed.
 */
const APPROVED_BLOG_ARTICLES: Record<string, ApprovedBlogArticle> = {
  Assam: {
    slug: 'assam-tea-guide',
    title: 'What Is Assam Tea?',
    metaTitle: 'Assam Tea Guide: Flavour, Origin & Brewing — Rajhans Tea',
    metaDescription:
      "Learn about Rajhans Royal Assam's strong, malty character, its Upper Assam origin, how much tea to use per cup, and available pack sizes.",
    excerpt:
      "Learn about Rajhans Royal Assam's strong, malty character, its Upper Assam origin, how much tea to use per cup, and available pack sizes.",
    tags: ['assam', 'guide', 'tea-tips'],
    content: `
      <p>Rajhans Royal Assam is a strong, malty black tea grown in the Brahmaputra valley of Upper Assam. It brews a deep amber colour that turns rich golden when milk is added, making it well suited to a strong cup of kadak chai.</p>

      <h2>Where It Comes From</h2>
      <p>Rajhans Royal Assam comes from the Brahmaputra valley of Upper Assam. It is bought from gardens Rajhans has worked with for years and harvested at the peak May–June flush, then packed fresh after purchase rather than stored for months. For the full sourcing story — harvesting, CTC processing, and quality control — see <a href="https://rajhanstea.com/blog/garden-to-cup-tea-journey/">our sourcing journey</a>.</p>

      <h2>Flavour and Strength</h2>
      <p>Because of this strength, three-quarters of a spoon makes one full-strength cup, instead of using a whole spoon. A 1kg pack gives 540+ cups, while most chai gives 400.</p>

      <h2>How to Brew It</h2>
      <p>Use three-quarters of a spoon per cup rather than a full spoon — Rajhans Royal Assam is concentrated enough that the usual measure makes a stronger cup than intended. For guidance on water temperature, steeping time, and the other fundamentals of a good brew, see <a href="https://rajhanstea.com/blog/art-of-perfect-tea-brewing/">our complete brewing guide</a>.</p>

      <h2>When to Enjoy It</h2>
      <p>Rajhans Royal Assam is best taken in the morning.</p>

      <h2>Choosing Your Pack</h2>
      <p>Rajhans Royal Assam is available in 500 gm, 750 gm, and 1 Kg packs. You can explore pack options and pricing on the <a href="https://rajhanstea.com/product/rajhans-royal-assam/">Rajhans Royal Assam product page</a>.</p>
    `,
  },
};

/**
 * Phase 6.7A — deterministically assembles the ONLY factual authority the
 * autonomous article writer/verifier may draw on: the target product, the
 * recommendation's own opportunity facts, and a deterministic, factual
 * footprint of every existing published post (never the AI's own summary).
 */
async function buildBlogContentEvidence(rec: ISeoRecommendationDoc, entity: string): Promise<BlogContentEvidence | null> {
  const relatedProductUrl = (rec.evidence as { relatedProducts?: string[] })?.relatedProducts?.[0] ?? rec.affectedUrls[0];
  let productSlug: string | null = null;
  try {
    if (relatedProductUrl) {
      const match = /^\/product\/([^/]+)\/?$/.exec(new URL(relatedProductUrl).pathname);
      productSlug = match?.[1] ?? null;
    }
  } catch {
    productSlug = null;
  }

  const product = productSlug ? await Product.findOne({ slug: productSlug, status: 'active' }).lean() : null;
  if (!product) return null;

  const activeVariants = product.hasVariants
    ? await ProductVariant.find({ productId: product._id, isActive: true }).select('name').lean()
    : [];

  const publishedBlogs = await Blog.find({ status: 'published' }).select('title slug tags content').lean();
  const baseUrl = seoConfig.baseUrl.replace(/\/$/, '');

  const existingCorpus: ExistingBlogSummary[] = publishedBlogs.map((b) => {
    const paragraphs = extractPlainParagraphSentences(b.content ?? '');
    return {
      title: b.title,
      slug: b.slug,
      url: `${baseUrl}/blog/${b.slug}/`,
      tags: b.tags ?? [],
      topicSummary: paragraphs.slice(0, 3).join(' '),
      keyIntents: [...blogIntentCategories(b)],
    };
  });

  return {
    product: {
      productId: String(product._id),
      name: product.name,
      slug: product.slug,
      region: product.region ?? null,
      description: product.description ?? '',
      shortDescription: product.shortDescription ?? null,
      bestTakenFor: normalizeBestTakenFor(product.bestTakenFor),
      packOptions: activeVariants.map((v) => ({ label: v.name })),
      url: `${baseUrl}/product/${product.slug}/`,
    },
    opportunity: {
      recommendationId: rec.recommendationId,
      recommendationType: rec.category,
      entity,
      targetUrl: rec.affectedUrls[0] ?? '',
      rationale: rec.why,
    },
    existingCorpus,
    siteFacts: { baseUrl },
  };
}

export async function generateBlogCreateChanges(
  rec: ISeoRecommendationDoc,
): Promise<GeneratedProposal> {
  const warnings: string[] = [];
  const targetUrl = rec.affectedUrls[0] ?? '';

  if (rec.recommendationId !== 'topical-authority-gap') {
    return generateGenericChange(rec, [...warnings, `Unrecognized topical-authority recommendation "${rec.recommendationId}" — falling back to a generic proposal.`]);
  }

  const evidence = rec.evidence as { entity?: string };
  const entity = evidence.entity;
  const approved = entity ? APPROVED_BLOG_ARTICLES[entity] : undefined;

  // Historical/manual path: a human has committed exact article text for
  // this entity. Never required going forward (see generateAutonomousBlogArticle
  // below) — kept for backward compatibility only.
  if (approved) {
    const htmlCheck = validateArticleHtml(approved.content);
    if (!htmlCheck.ok) {
      warnings.push(`Approved article text for "${entity}" failed its own safety/structure check (${htmlCheck.reason}) — falling back to an outline-only recommendation.`);
      const change: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: targetUrl || `${seoConfig.baseUrl}/blog/` };
      return { proposedChanges: [change], warnings };
    }

    const articleUrl = `${seoConfig.baseUrl}/blog/${approved.slug}/`;
    const change: BlogCreateProposedChange = {
      kind: 'blog_create',
      targetUrl: articleUrl,
      execution: {
        slug: approved.slug,
        title: approved.title,
        metaTitle: approved.metaTitle,
        metaDescription: approved.metaDescription,
        excerpt: approved.excerpt,
        content: approved.content,
        tags: approved.tags,
        status: 'published',
      },
    };
    warnings.push('Article text is the exact human-approved wording committed for this entity — nothing was regenerated or invented.');
    return { proposedChanges: [change], warnings, generationEvidence: { mode: 'manual-approved-article', entity } };
  }

  // Phase 6.7A — autonomous grounded drafting. No source-code entry required.
  if (!entity) {
    warnings.push('Recommendation evidence has no entity — falling back to an outline-only recommendation.');
    const change: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: targetUrl || `${seoConfig.baseUrl}/blog/` };
    return { proposedChanges: [change], warnings, generationEvidence: { mode: 'ai-article-drafting', status: 'no_entity' } };
  }

  const blogEvidence = await buildBlogContentEvidence(rec, entity);
  if (!blogEvidence) {
    warnings.push(`Could not resolve a grounded product evidence source for "${entity}" — falling back to an outline-only recommendation.`);
    const change: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: targetUrl || `${seoConfig.baseUrl}/blog/` };
    return { proposedChanges: [change], warnings, generationEvidence: { mode: 'ai-article-drafting', status: 'no_product_evidence', entity } };
  }

  const planResult = planArticleAngle(blogEvidence);
  if (!planResult.ok) {
    warnings.push(`No material content opportunity for "${entity}": ${planResult.details.join('; ')} — falling back to an outline-only recommendation.`);
    const change: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: targetUrl || `${seoConfig.baseUrl}/blog/` };
    return {
      proposedChanges: [change],
      warnings,
      generationEvidence: { mode: 'ai-article-drafting', status: 'no_material_content_opportunity', entity, details: planResult.details },
    };
  }

  const aiResult = await generateGroundedBlogDraft(blogEvidence, planResult.plan);

  const generationEvidence: Record<string, unknown> = {
    mode: 'ai-article-drafting',
    status: aiResult.disposition ?? (aiResult.ok ? 'draft_ready' : 'rejected'),
    provider: aiResult.provider,
    model: aiResult.model,
    openaiCallCount: aiResult.openaiCallCount,
    entity,
    evidence: blogEvidence,
    plan: planResult.plan,
    error: aiResult.error ?? null,
    unsupportedClaims: aiResult.output?.unsupportedClaims ?? [],
    notes: aiResult.output?.notes ?? [],
  };

  if (!aiResult.ok || !aiResult.output || aiResult.output.status !== 'ok' || !aiResult.output.contentHtml || !aiResult.output.title || !aiResult.output.slug || !aiResult.output.h1) {
    warnings.push(`Autonomous article drafting did not produce an executable proposal for "${entity}": ${aiResult.error ?? 'unknown failure'}`);
    const change: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: targetUrl || `${seoConfig.baseUrl}/blog/` };
    return { proposedChanges: [change], warnings, generationEvidence };
  }

  const output = aiResult.output;
  const slug = output.slug!;
  const articleUrl = `${seoConfig.baseUrl}/blog/${slug}/`;
  const contentHtml = output.contentHtml!;

  const linksForTags = extractLinks(contentHtml) ?? [];
  const change: BlogCreateProposedChange = {
    kind: 'blog_create',
    targetUrl: articleUrl,
    execution: {
      slug,
      title: output.title!,
      metaTitle: output.metaTitle ?? output.title!,
      metaDescription: output.metaDescription ?? '',
      excerpt: output.metaDescription ?? '',
      content: contentHtml,
      tags: [entity.toLowerCase(), 'guide'],
      status: 'published',
    },
  };
  warnings.push(
    `Article text was autonomously drafted and independently verified (${aiResult.openaiCallCount} OpenAI call(s)) — grounded only in Product "${blogEvidence.product!.slug}" and the existing blog corpus. ${linksForTags.length} internal link(s) proposed.`,
  );
  return { proposedChanges: [change], warnings, generationEvidence };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) internal-linking — the target page is always known from evidence.
//
// Phase 6.4A: for link-strengthening recommendations whose target is a
// published blog post, attempt a fully executable blog→blog internal link
// FIRST — deterministic entity/topic overlap only, no invented copy: the
// candidate source page, anchor text, and surrounding context are all
// substrings that already exist verbatim in that source page's own content.
// Falls back to the historical outline-only proposal (sourceUrl left null
// for a human to pick) whenever no safe, unambiguous candidate is found.
// ─────────────────────────────────────────────────────────────────────────────

const LINK_STRENGTHENING_RECOMMENDATION_IDS = new Set(['boost-low-inbound-pages', 'link-orphan-pages']);

/** Domain words too generic to justify placing a link on their own. */
const GENERIC_TOPIC_STOPWORDS = new Set([
  'tea', 'teas', 'rajhans', 'chai', 'water', 'brew', 'brewing', 'brewed',
  'cup', 'cups', 'leaf', 'leaves', 'drink', 'perfect', 'cold', 'fresh',
]);

const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'our', 'your',
  'is', 'are', 'from', 'beyond', 'that', 'this', 'these', 'those', 'have', 'has', 'had',
  'will', 'would', 'each', 'which', 'when', 'where', 'while', 'than', 'then', 'them',
  'they', 'their', 'here', 'there', 'about', 'into', 'over', 'more', 'most', 'some',
  'such', 'only', 'just', 'also', 'been', 'were', 'was', 'not', 'can', 'use', 'used',
  'using', 'per', 'you',
]);

/**
 * Phase 6.4B (candidate quality gate) — standalone anchors that a reader
 * would find meaningless in isolation: they give no indication of what the
 * link leads to. Rejected regardless of whether they happen to occur only
 * once in the source content, because "occurs uniquely" is not the same as
 * "is a good anchor." Colors, generic beverage nouns, and vague pointer
 * words ("here", "read more") are exactly the class of false-positive
 * anchors human review rejected from the first preview batch.
 */
const BANNED_GENERIC_ANCHORS = new Set([
  'here', 'there', 'read', 'more', 'click', 'link', 'this', 'that', 'article', 'post',
  'page', 'guide', 'learn', 'info', 'information', 'science', 'modern', 'black', 'white',
  'green', 'red', 'perfect', 'good', 'great', 'best',
]);

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True only when a single word is a genuinely distinctive entity/brand/
 * product term tied to the TARGET page specifically — an acronym (e.g.
 * "CTC"), or a word that the target blog itself lists as a tag (e.g.
 * "Darjeeling"). Being capitalized in running text is NOT sufficient on its
 * own ("Black" at the start of "Black tea is..." is not an entity) — this is
 * the exact false positive human review rejected from the first preview
 * batch.
 */
function isDistinctiveEntityAnchor(rawAnchor: string, targetBlog: { tags?: string[] }): boolean {
  if (/^[A-Z]{2,6}$/.test(rawAnchor)) return true; // acronym, e.g. "CTC"
  const lower = rawAnchor.toLowerCase();
  return (targetBlog.tags ?? []).some((t) => t.toLowerCase() === lower);
}

export type AnchorQualityResult = { ok: true } | { ok: false; reason: string };

/**
 * Phase 6.4B candidate quality gate — evaluated independently of, and in
 * addition to, `applyInternalLinkPatch`'s exact-match/uniqueness rules. An
 * anchor can be perfectly unambiguous in the source text and still be a bad
 * anchor: this function is what actually rejects "here", "science",
 * "modern", or a bare color/beverage noun that gives a reader no idea what
 * the link leads to. A single word is only ever allowed through
 * `isDistinctiveEntityAnchor`.
 */
export function evaluateAnchorQuality(anchorText: string, targetBlog: { tags?: string[] }): AnchorQualityResult {
  const trimmed = anchorText.trim();
  if (!trimmed) return { ok: false, reason: 'empty_anchor' };

  const words = trimmed.split(/\s+/).filter(Boolean);
  const normalizedWords = words.map(normalizeWord);

  if (words.length === 1) {
    if (BANNED_GENERIC_ANCHORS.has(normalizedWords[0]) || GENERIC_TOPIC_STOPWORDS.has(normalizedWords[0])) {
      return { ok: false, reason: 'generic_single_word_anchor' };
    }
    if (!isDistinctiveEntityAnchor(trimmed, targetBlog)) {
      return { ok: false, reason: 'single_word_not_distinctive_entity' };
    }
    return { ok: true };
  }

  if (words.length > 6) {
    return { ok: false, reason: 'anchor_too_long' };
  }

  const allMeaningless = normalizedWords.every(
    (w) => BANNED_GENERIC_ANCHORS.has(w) || TITLE_STOPWORDS.has(w) || GENERIC_TOPIC_STOPWORDS.has(w),
  );
  if (allMeaningless) {
    return { ok: false, reason: 'anchor_lacks_meaning' };
  }

  return { ok: true };
}

function tokenizeWithOffsets(text: string): { word: string; start: number; end: number }[] {
  const tokens: { word: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function stripEdgePunctuation(s: string): string {
  return s.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '');
}

/**
 * Finds the best descriptive anchor phrase in `sentence` around the word
 * `matchWord` (already known to be one of the target's topic keywords).
 * Prefers longer, more descriptive windows (up to 6 words) over shorter
 * ones, trims leading/trailing stopwords off each candidate window so a
 * phrase never starts or ends mid-thought (e.g. "the" or "and"), and only
 * ever falls back to a single word when that word independently passes
 * `evaluateAnchorQuality`'s distinctive-entity bar. Returns null — never a
 * forced/manufactured anchor — when no window in the sentence qualifies;
 * callers must treat that as `no_safe_contextual_insertion` for this
 * source/target pair, not retry with a lower bar.
 */
export function selectAnchorPhrase(
  sentence: string,
  matchWord: string,
  targetBlog: { tags?: string[] },
): string | null {
  const tokens = tokenizeWithOffsets(sentence);
  const matchIdx = tokens.findIndex((t) => normalizeWord(t.word) === matchWord);
  if (matchIdx === -1) return null;

  for (let windowSize = 6; windowSize >= 2; windowSize--) {
    for (let start = Math.max(0, matchIdx - windowSize + 1); start <= matchIdx; start++) {
      const end = start + windowSize - 1;
      if (end >= tokens.length || matchIdx > end) continue;

      let first = start;
      let last = end;
      while (first < last && TITLE_STOPWORDS.has(normalizeWord(tokens[first].word))) first++;
      while (last > first && TITLE_STOPWORDS.has(normalizeWord(tokens[last].word))) last--;
      if (last - first + 1 < 2 || matchIdx < first || matchIdx > last) continue;

      const phrase = stripEdgePunctuation(sentence.slice(tokens[first].start, tokens[last].end));
      const wordCount = phrase.split(/\s+/).filter(Boolean).length;
      if (wordCount < 2 || wordCount > 6) continue;

      if (evaluateAnchorQuality(phrase, targetBlog).ok) return phrase;
    }
  }

  const singleWord = stripEdgePunctuation(tokens[matchIdx].word);
  if (evaluateAnchorQuality(singleWord, targetBlog).ok) return singleWord;

  return null;
}

function significantWords(text: string, minLength = 4): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= minLength && !TITLE_STOPWORDS.has(w));
}

/**
 * Same tokenization as `significantWords` but with no arbitrary minimum
 * length — used only when checking a sentence for a keyword HIT (never for
 * generating anchor text itself). A short acronym like "CTC" is exactly the
 * kind of strong, unambiguous identity signal the relationship-quality gate
 * depends on, and a length-4 floor would silently make it undetectable.
 */
function keywordMatchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !TITLE_STOPWORDS.has(w));
}

export interface TopicKeywords {
  /** High-confidence identity signals: author-curated tags and acronyms (e.g. "CTC"). A single hit is enough to justify a link. */
  strong: Set<string>;
  /** Lower-confidence signals: proper nouns drawn from the post's own PARAGRAPH prose (never headings, which are structural, not subject matter) and significant title words. Coincidental — needs corroboration before it counts as a real relationship. */
  weak: Set<string>;
}

/**
 * Every distinctive topic word this blog post is genuinely "about" — split
 * into "strong" (tags/acronyms — a curated or unambiguous identity signal)
 * and "weak" (proper nouns/title words — plausible but easily coincidental)
 * so a match against a single weak keyword can never, on its own, justify a
 * link (see the relationship-quality gate in generateExecutableBlogLinkChanges).
 * Proper nouns are deliberately read ONLY from `<p>` paragraph prose, never
 * from headings: a heading like "Water Temperature" is structural markup,
 * not evidence the post is genuinely "about" water or temperature, and
 * treating it as one was the root cause of weak, coincidental candidate
 * matches in the first preview batch.
 */
function topicKeywords(blog: { title: string; tags?: string[]; content?: string }): TopicKeywords {
  const paragraphText = extractPlainParagraphSentences(blog.content ?? '').join(' ');
  const properNouns = [...paragraphText.matchAll(/\b[A-Z][a-z]{3,}\b/g)].map((m) => m[0].toLowerCase());
  const acronyms = [...`${blog.title} ${paragraphText}`.matchAll(/\b[A-Z]{2,6}\b/g)].map((m) => m[0].toLowerCase());
  const tags = (blog.tags ?? []).map((t) => t.toLowerCase());
  const titleWords = significantWords(blog.title, 5);

  const isNoise = (w: string) => GENERIC_TOPIC_STOPWORDS.has(w) || TITLE_STOPWORDS.has(w);
  const strong = new Set([...tags, ...acronyms].filter((w) => !isNoise(w)));
  const weak = new Set([...properNouns, ...titleWords].filter((w) => !isNoise(w) && !strong.has(w)));
  return { strong, weak };
}

/**
 * Phase 6.4C — destination-intent taxonomy. Topic/entity overlap alone is
 * not enough to justify a link (two posts can both mention "CTC" while one
 * is a brewing guide and the other a sourcing story). Each category is a
 * distinct real-world PURPOSE a blog post serves; a candidate context
 * sentence must independently exhibit the SAME purpose the target page
 * exists to serve, not merely share a keyword with it. Phrases are matched
 * as case-insensitive substrings, so both single words ("steep") and short
 * fixed phrases ("water temperature") work uniformly.
 */
const INTENT_CATEGORIES: Record<string, string[]> = {
  brewing: [
    'brew', 'brewing', 'brewed', 'steep', 'steeping', 'steeped', 'infuse', 'infusion',
    'infusing', 'water temperature', 'temperature', 'boiling', 'boil', 'brewing time',
    'steeping time',
  ],
  sourcing: [
    'source', 'sourcing', 'sourced', 'garden', 'gardens', 'harvest', 'harvesting',
    'harvested', 'estate', 'estates', 'processed', 'processing', 'farmer', 'farmers',
    'origin', 'journey', 'flush', 'plantation', 'plantations',
  ],
  health: [
    'health', 'healthy', 'benefit', 'benefits', 'antioxidant', 'antioxidants', 'wellness',
    'digestion', 'digestive', 'immune', 'immunity', 'nutrient', 'nutrients', 'cardiovascular',
    'metabolism',
  ],
  recipe: [
    'recipe', 'recipes', 'variation', 'variations', 'ingredient', 'ingredients', 'blend',
    'blends', 'spice', 'spices', 'preparation method', 'homemade',
  ],
};

/** Every intent category whose signal phrase appears (as a substring) in `text`. */
export function textIntentCategories(text: string): Set<string> {
  const lower = text.toLowerCase();
  const cats = new Set<string>();
  for (const [category, signals] of Object.entries(INTENT_CATEGORIES)) {
    if (signals.some((s) => lower.includes(s))) cats.add(category);
  }
  return cats;
}

/**
 * The destination purpose(s) a blog post itself serves, derived from its own
 * title/tags/paragraph prose. An empty result means this target's purpose
 * cannot be deterministically classified — callers must treat that as
 * "no destination intent could be verified," never as "anything goes."
 */
export function blogIntentCategories(blog: { title: string; tags?: string[]; content?: string }): Set<string> {
  const paragraphText = extractPlainParagraphSentences(blog.content ?? '').join(' ');
  return textIntentCategories(`${blog.title} ${(blog.tags ?? []).join(' ')} ${paragraphText}`);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Every sentence from a plain `<p>...text...</p>` paragraph (no nested
 * tags), extracted so each returned sentence is a byte-for-byte substring
 * of `rawContent` — required because the patch operates on that same raw
 * HTML, not a stripped/normalized copy of it.
 */
function extractPlainParagraphSentences(rawContent: string): string[] {
  const sentences: string[] = [];
  const paragraphPattern = /<p>([^<]*)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = paragraphPattern.exec(rawContent)) !== null) {
    sentences.push(...splitSentences(m[1]));
  }
  return sentences;
}

async function generateInternalLinkChanges(rec: ISeoRecommendationDoc): Promise<{ proposedChanges: ProposedChange[]; warnings: string[] }> {
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

  if (LINK_STRENGTHENING_RECOMMENDATION_IDS.has(rec.recommendationId)) {
    const executable = await generateExecutableBlogLinkChanges(cap(targets, warnings, 'link targets'), warnings);
    if (executable.length) {
      warnings.push('Anchor text and surrounding context are existing text taken verbatim from the source page — nothing was invented.');
      return { proposedChanges: executable, warnings };
    }
    warnings.push('No safe, deterministic blog-to-blog internal-link candidate could be found for any target; falling back to an outline-only recommendation.');
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

/**
 * For each target URL that resolves to a published blog post, find another
 * published blog post that already contains — verbatim, unambiguously — a
 * sentence mentioning a topic word genuinely drawn from the target post's
 * own title/tags/body. At most one link per unique source page, since a
 * single draft executes all its targets together and a source page can only
 * be safely edited once per execution.
 */
export async function generateExecutableBlogLinkChanges(
  targetUrls: string[],
  warnings: string[],
): Promise<InternalLinkProposedChange[]> {
  const publishedBlogs = await Blog.find({ status: 'published' }).select('title slug tags content').lean();
  if (!publishedBlogs.length) return [];

  const blogByPath = new Map(publishedBlogs.map((b) => [`/blog/${b.slug}/`, b]));
  const baseUrl = seoConfig.baseUrl.replace(/\/$/, '');
  const claimedSourceUrls = new Set<string>();
  const changes: InternalLinkProposedChange[] = [];
  const skippedTargets: { targetUrl: string; reason: string }[] = [];

  for (const targetUrl of targetUrls) {
    let targetPath: string;
    try {
      targetPath = new URL(targetUrl).pathname.replace(/\/+$/, '') + '/';
    } catch {
      skippedTargets.push({ targetUrl, reason: 'unsupported_target_type' });
      continue;
    }

    const targetBlog = blogByPath.get(targetPath);
    if (!targetBlog) {
      // v1 only supports a blog post as the link target's KNOWN page type
      // for automatic candidate discovery (product/CMS targets still fall
      // back to the outline-only proposal below).
      skippedTargets.push({ targetUrl, reason: 'unsupported_target_type' });
      continue;
    }

    const keywords = topicKeywords(targetBlog);
    const targetIntents = blogIntentCategories(targetBlog);
    if (targetIntents.size === 0) {
      // Cannot deterministically verify what purpose this target page
      // serves, so no context sentence can be confirmed to describe or
      // imply it — fail closed rather than allow a topic-only match.
      skippedTargets.push({ targetUrl, reason: 'no_safe_contextual_insertion' });
      continue;
    }
    let match: { source: (typeof publishedBlogs)[number]; anchorText: string; contextSnapshot: string } | null = null;

    for (const candidate of publishedBlogs) {
      if (String(candidate._id) === String(targetBlog._id)) continue; // never self-link
      const candidateSourceUrl = `${baseUrl}/blog/${candidate.slug}/`;
      if (claimedSourceUrls.has(candidateSourceUrl)) continue; // one link per source per draft

      const candidateContent = candidate.content ?? '';
      if (contentAlreadyLinksTo(candidateContent, targetUrl)) continue;

      for (const sentence of extractPlainParagraphSentences(candidateContent)) {
        const words = keywordMatchWords(sentence).filter((w) => !GENERIC_TOPIC_STOPWORDS.has(w));
        const strongHits = words.filter((w) => keywords.strong.has(w));
        const weakHits = [...new Set(words.filter((w) => keywords.weak.has(w)))];

        // Relationship-quality gate: a single coincidental shared word is not
        // enough to justify a link (that is exactly how "Black tea contains
        // powerful antioxidants" ended up pointed at a brewing-technique
        // guide). One STRONG hit (a tag/acronym the target is genuinely
        // identified by) is sufficient; a WEAK hit (an incidental proper
        // noun) requires a second independent weak hit corroborating it.
        if (strongHits.length < 1 && weakHits.length < 2) continue;
        const matchWord = strongHits[0] ?? weakHits[0];
        if (!matchWord) continue;

        // Destination-intent gate: topic/entity overlap is not sufficient —
        // this sentence must also describe or naturally imply the SAME
        // purpose the target page exists to serve (e.g. brewing instructions
        // pointing at a brewing guide, not merely sharing a keyword with
        // one). No overlap in intent ⇒ this sentence cannot be used.
        const sentenceIntents = textIntentCategories(sentence);
        const sharesIntent = [...sentenceIntents].some((c) => targetIntents.has(c));
        if (!sharesIntent) continue;

        // Quality gate: never settle for the bare matched word just because
        // it happens to occur once — prefer a longer, genuinely descriptive
        // phrase, and only accept a single word when it independently
        // clears the distinctive-entity bar. No forced/manufactured anchor.
        const anchorText = selectAnchorPhrase(sentence, matchWord, targetBlog);
        if (!anchorText) continue;

        if (countOccurrences(candidateContent, sentence) !== 1) continue;
        if (countOccurrences(sentence, anchorText) !== 1) continue;

        match = { source: candidate, anchorText, contextSnapshot: sentence };
        break;
      }
      if (match) break;
    }

    if (!match) {
      skippedTargets.push({ targetUrl, reason: 'no_safe_contextual_insertion' });
      continue;
    }

    const sourceUrl = `${baseUrl}/blog/${match.source.slug}/`;
    const beforeContent = match.source.content ?? '';
    const patch = applyInternalLinkPatch(beforeContent, match.contextSnapshot, match.anchorText, targetUrl);
    if (!patch.ok) {
      skippedTargets.push({ targetUrl, reason: 'no_safe_contextual_insertion' });
      continue;
    }

    claimedSourceUrls.add(sourceUrl);
    changes.push({
      kind: 'internal_link',
      sourceUrl,
      targetUrl,
      anchorText: match.anchorText,
      execution: {
        sourcePageType: 'blog_content',
        beforeContent,
        afterContent: patch.afterContent,
        contextSnapshot: match.contextSnapshot,
      },
    });
  }

  if (skippedTargets.length) {
    for (const { targetUrl, reason } of skippedTargets) {
      warnings.push(`${targetUrl}: ${reason} — no safe, non-conflicting, quality-gated blog source page was found.`);
    }
  }

  return changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) content — thin-content: headings are a fixed structural outline, never
// fabricated body copy. Body is left blank for a human to author.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeBestTakenFor(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is string => typeof v === 'string',
    );
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

async function generateContentChanges(
  rec: ISeoRecommendationDoc,
): Promise<GeneratedProposal> {
  const warnings: string[] = [];

  const evidence = rec.evidence as {
    opportunityType?: string;
    pageType?: string;
    sourceRef?: {
      model?: string;
      documentId?: string;
      slug?: string;
    };
    pages?: {
      url: string;
      wordCount: number | null;
      hasH1: boolean | null;
    }[];
    wordCountThreshold?: number;
  };

  const isExecutableProductOpportunity =
    rec.source === 'content' &&
    evidence.opportunityType === 'thin-content' &&
    evidence.pageType === 'product' &&
    evidence.sourceRef?.model === 'Product';

  if (isExecutableProductOpportunity) {
    let product: any = null;

    if (
      evidence.sourceRef?.documentId &&
      mongoose.isValidObjectId(
        evidence.sourceRef.documentId,
      )
    ) {
      product = await Product.findOne({
        _id: evidence.sourceRef.documentId,
        status: 'active',
      })
        .lean()
        .exec();
    }

    if (
      !product &&
      evidence.sourceRef?.slug
    ) {
      product = await Product.findOne({
        slug: evidence.sourceRef.slug,
        status: 'active',
      })
        .lean()
        .exec();
    }

    if (!product) {
      warnings.push(
        'Active Product could not be resolved; executable AI content generation was skipped.',
      );

      return {
        proposedChanges: [],
        warnings,
        generationEvidence: {
          mode: 'ai-product-content',
          status: 'product_not_found',
        },
      };
    }

    // .lean() does not populate the `variants` virtual, and pack-size context
    // is exactly the fact category the writer/verifier need to avoid
    // misleadingly implying exclusivity (e.g. "available in a 1kg pack" when
    // other sizes are also active) — so fetch it explicitly.
    const activeVariants = product.hasVariants
      ? await ProductVariant.find({ productId: product._id, isActive: true })
          .select('name')
          .lean()
      : [];

    const productEvidence: ProductContentEvidence = {
      productId: String(product._id),
      name: product.name,
      slug: product.slug,
      region: product.region ?? null,
      description:
        product.description ?? '',
      shortDescription:
        product.shortDescription ?? null,
      bestTakenFor:
        normalizeBestTakenFor(
          product.bestTakenFor,
        ),
      imageAltText:
        product.imageAltText ?? null,
      packOptions: activeVariants.map((v) => ({ label: v.name })),
    };

    const aiResult =
      await generateGroundedProductDraft(
        productEvidence,
      );

    if (
      aiResult.disposition === 'no_material_improvement'
    ) {
      warnings.push(
        'Grounded AI found no material factual expansion worth making. Existing product copy should be retained rather than padded.',
      );

      return {
        proposedChanges: [],
        warnings,
        generationEvidence: {
          mode: 'ai-product-content',
          status: 'no_material_improvement',
          provider: aiResult.provider,
          model: aiResult.model,
          error: aiResult.error ?? null,
          output: aiResult.output,
          evidence: productEvidence,
        },
      };
    }

    if (
      !aiResult.ok ||
      !aiResult.output ||
      aiResult.output.status !== 'ok' ||
      !aiResult.output.draft
    ) {
      warnings.push(
        `AI product drafting did not produce an executable proposal: ${aiResult.error ?? aiResult.output?.status ?? 'unknown failure'}`,
      );

      return {
        proposedChanges: [],
        warnings,
        generationEvidence: {
          mode: 'ai-product-content',
          status: 'rejected',
          provider: aiResult.provider,
          model: aiResult.model,
          error: aiResult.error ?? null,
          output: aiResult.output,
          evidence: productEvidence,
        },
      };
    }

    const targetUrl =
      rec.affectedUrls[0] ??
      `${seoConfig.baseUrl.replace(/\/$/, '')}/product/${product.slug}/`;

    warnings.push(
      'Product description was generated by the grounded AI drafting pipeline and passed independent factual verification.',
    );

    warnings.push(
      'Human approval remains required before execution.',
    );

    return {
      proposedChanges: [
        {
          kind: 'content',
          targetUrl,
          field: {
            name: 'description',
            current:
              product.description ?? '',
            proposed:
              aiResult.output.draft,
          },
          blocks: [],
        },
      ],
      warnings,
      generationEvidence: {
        mode: 'ai-product-content',
        status: 'verified',
        provider: aiResult.provider,
        model: aiResult.model,
        evidence: productEvidence,
        claimsUsed:
          aiResult.output.claimsUsed,
        unsupportedClaims:
          aiResult.output.unsupportedClaims,
        notes:
          aiResult.output.notes,
      },
    };
  }

  // Existing non-product/general content behavior remains safe and non-executable.
  const pages =
    evidence.pages?.length
      ? evidence.pages
      : rec.affectedUrls.map(
          (url) => ({
            url,
            wordCount: null,
            hasH1: null,
          }),
        );

  if (!pages.length) {
    return generateGenericChange(
      rec,
      [
        ...warnings,
        'No page URLs found in evidence for this content recommendation.',
      ],
    );
  }

  const capped =
    cap(pages, warnings, 'pages');

  const changes: ContentProposedChange[] =
    capped.map((p) => ({
      kind: 'content',
      targetUrl: p.url,
      blocks:
        CONTENT_OUTLINE_HEADINGS.map(
          (heading) => ({
            heading,
            body: '',
          }),
        ),
    }));

  warnings.push(
    'Section headings are a structural outline only; body copy is intentionally left blank — original, factual content must be authored before execution.',
  );

  return {
    proposedChanges: changes,
    warnings,
    generationEvidence: {
      mode: 'outline-only',
    },
  };
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
        // Phase 6.3C executable product content uses `field.description`.
        // Historical content recommendations use structural `blocks`.
        // Either representation is valid; an empty blocks[] is expected
        // for an executable Product.description draft.
        if (change.field) {
          if (change.field.name !== 'description') {
            errors.push(`${label}: unsupported executable content field.`);
          }

          if (typeof change.field.current !== 'string') {
            errors.push(`${label}: field.current must be a string.`);
          }

          if (
            typeof change.field.proposed !== 'string' ||
            !change.field.proposed.trim()
          ) {
            errors.push(`${label}: field.proposed must be a non-empty string.`);
          }

          if (
            typeof change.field.current === 'string' &&
            typeof change.field.proposed === 'string' &&
            change.field.current === change.field.proposed
          ) {
            errors.push(`${label}: proposed description is identical to current description.`);
          }
        } else if (!change.blocks.length) {
          errors.push(`${label}: no content field or content blocks proposed.`);
        }

        break;
      }
      case 'faq': {
        if (!change.items.length) warnings.push(`${label}: no FAQ items — insufficient evidence to propose Q&A content.`);
        break;
      }
      case 'blog_create': {
        if (!change.execution) {
          warnings.push(`${label}: no approved article content — insufficient evidence to propose a new blog article.`);
        } else if (!change.execution.content.trim() || !change.execution.title.trim() || !change.execution.slug.trim()) {
          errors.push(`${label}: blog_create execution requires non-empty slug/title/content.`);
        }
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
