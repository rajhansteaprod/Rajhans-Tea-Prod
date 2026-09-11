import mongoose, { Document, Schema } from 'mongoose';
import { RecommendationCategory, RecommendationSource } from '../seo.types';

/**
 * Phase 5.2 — a structured, persistent DRAFT describing the exact SEO change
 * proposed for one approved recommendation. Purely descriptive data: creating,
 * reading, or regenerating a draft never touches Product/Category/CMS content,
 * Angular templates, the sitemap, live schema, or any other production SEO
 * field. There is no published/applied status — that is a later phase.
 */
export type ChangeDraftStatus = 'draft' | 'superseded';
export type ProposedChangeKind = 'metadata' | 'structured_data' | 'internal_link' | 'content' | 'faq' | 'blog_create' | 'generic';

export interface MetadataFieldChange {
  current: string | null;
  proposed: string;
}

export interface MetadataProposedChange {
  kind: 'metadata';
  targetUrl: string;
  fields: {
    title?: MetadataFieldChange;
    metaDescription?: MetadataFieldChange;
    h1?: MetadataFieldChange;
  };
}

export interface StructuredDataProposedChange {
  kind: 'structured_data';
  targetUrl: string;
  schemaType: string;
  jsonLd: Record<string, unknown>;
}

export interface InternalLinkProposedChange {
  kind: 'internal_link';
  sourceUrl: string | null; // null = not determinable from stored evidence; a human must pick it
  targetUrl: string;
  anchorText: string | null; // null = not determinable from stored evidence

  /**
   * Phase 6.4A — executable internal-link proposal. Optional for backward
   * compatibility with historical outline-only internal-linking
   * recommendations that only ever named an aspirational target with no
   * concrete source/anchor/context. Execution requires this: an exact,
   * deterministic content patch that preflight independently re-derives
   * from `beforeContent` + `contextSnapshot` + `anchorText` + `targetUrl`
   * (see internal-link-patch.util.ts) and requires to match `afterContent`
   * byte-for-byte — the draft's precomputed patch is never trusted blindly.
   */
  execution?: {
    /** The only source content field this phase can edit. */
    sourcePageType: 'blog_content';
    /** Full Blog.content exactly as read when the draft was generated. */
    beforeContent: string;
    /** Deterministically derived resulting Blog.content (see above). */
    afterContent: string;
    /**
     * The exact, already-present contiguous substring of `beforeContent`
     * that contains `anchorText` — must occur exactly once in
     * `beforeContent`, and `anchorText` must occur exactly once within it.
     */
    contextSnapshot: string;
  };
}

export interface ContentProposedChange {
  kind: 'content';
  targetUrl: string;

  /**
   * Phase 6.3A — executable product-content proposal.
   *
   * Optional for backward compatibility with historical outline-only drafts.
   * Execution accepts only name:'description' and requires exact current/proposed
   * values so stale-state protection is equivalent to the metadata executor.
   */
  field?: {
    name: 'description';
    current: string;
    proposed: string;
  };

  blocks: { heading: string; body: string }[];
}

export interface FaqProposedChange {
  kind: 'faq';
  targetUrl: string;
  items: { question: string; answer: string }[]; // may be empty when evidence supplies no Q&A content

  /**
   * Phase 6.5A — executable FAQPage schema proposal. Optional for backward
   * compatibility with historical outline-only add-faq-schema drafts (always
   * `items: []`, no source to draw from). Execution requires this: `items`
   * is deterministically extracted from `sourceContentSnapshot` (the CMS
   * Page's own `content` at draft-generation time) via
   * `extractFaqPairsFromHtml`, and `proposedJsonLd` is deterministically
   * built from those same items via `buildFaqJsonLd` — both re-derived and
   * required to match byte-for-byte by preflight, never trusted blindly
   * (see faq-schema.util.ts).
   */
  execution?: {
    /** Full Page.content exactly as read when the draft was generated. */
    sourceContentSnapshot: string;
    /** Deterministically derived from `items` via buildFaqJsonLd + serializeFaqJsonLd. */
    proposedJsonLd: Record<string, unknown>;
  };
}

/**
 * Phase 6.6A — executable "create a brand-new published Blog article"
 * proposal. Unlike every other executable kind, there is no existing live
 * document to diverge from — the whole point is CREATION. `targetUrl` is the
 * article's future canonical URL (`/blog/:slug/`); `execution` carries the
 * exact, already human-approved field values preflight will write verbatim
 * (after independently re-validating safety/structure/link-resolvability) —
 * never regenerated, never rewritten.
 */
export interface BlogCreateProposedChange {
  kind: 'blog_create';
  targetUrl: string;
  execution?: {
    slug: string;
    title: string;
    metaTitle: string;
    metaDescription: string;
    /** Shown as the visible teaser under the H1; also drives the live <meta name="description"> via the existing blog-detail template. */
    excerpt: string;
    /** Full article HTML, including every embedded internal link. */
    content: string;
    tags: string[];
    status: 'published';
  };
}

export interface GenericProposedChange {
  kind: 'generic';
  targetUrl: string;
  summary: string;
  instructions: string;
  details?: Record<string, unknown>;
}

export type ProposedChange =
  | MetadataProposedChange
  | StructuredDataProposedChange
  | InternalLinkProposedChange
  | ContentProposedChange
  | FaqProposedChange
  | BlogCreateProposedChange
  | GenericProposedChange;

export interface ChangeDraftValidation {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ISeoChangeDraftDoc extends Document {
  recommendationId: mongoose.Types.ObjectId; // ref SeoRecommendation._id — the stable identity (never the human-readable recommendationId, which can collide)
  recommendationFingerprint: string; // denormalized for display/traceability only
  targetUrl: string;
  source: RecommendationSource;
  type: RecommendationCategory;
  status: ChangeDraftStatus;
  generatorVersion: string;
  generatedAt: Date;
  generatedBy: mongoose.Types.ObjectId;
  inputSnapshot: Record<string, unknown>;
  proposedChanges: ProposedChange[];
  validation: ChangeDraftValidation;
  /**
   * Phase 6.7B preview-before-approval lifecycle. Deterministic hash of
   * `proposedChanges` (see change-draft-generator.service.ts
   * computeDraftContentHash) — the immutable fingerprint of exactly what a
   * human reviewed. An approval that binds to a specific draft
   * (SeoRecommendation.reviewedDraftContentHash) is compared against THIS
   * value at preflight time, so a draft regenerated after approval (with
   * different AI wording) can never silently execute under an old approval.
   */
  contentHash: string;
  /**
   * True when this draft was generated while its recommendation was still
   * `pending` (or `needs_changes`) — i.e. a human-reviewable PREVIEW, not
   * yet eligible for execution under any circumstance. Execution eligibility
   * is still governed entirely by the recommendation's live reviewStatus at
   * preflight time (this flag is informational/display only — it does not
   * by itself gate anything, so a later approval of the SAME draft correctly
   * makes it executable without needing to mutate this field).
   */
  previewOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const seoChangeDraftSchema = new Schema<ISeoChangeDraftDoc>(
  {
    recommendationId: { type: Schema.Types.ObjectId, ref: 'SeoRecommendation', required: true, index: true },
    recommendationFingerprint: { type: String, default: '' },
    targetUrl: { type: String, default: '' },
    source: { type: String, enum: ['audit', 'gsc', 'market', 'content'], required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['draft', 'superseded'], default: 'draft', index: true },
    generatorVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true, index: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inputSnapshot: { type: Schema.Types.Mixed, default: {} },
    proposedChanges: { type: Schema.Types.Mixed, default: [] },
    validation: {
      isValid: { type: Boolean, default: true },
      warnings: { type: [String], default: [] },
      errors: { type: [String], default: [] },
    },
    contentHash: { type: String, default: '' },
    previewOnly: { type: Boolean, default: false },
  },
  { timestamps: true },
);

seoChangeDraftSchema.index({ recommendationId: 1, status: 1 });
seoChangeDraftSchema.index({ recommendationId: 1, generatedAt: -1 });

export const SeoChangeDraft = mongoose.model<ISeoChangeDraftDoc>('SeoChangeDraft', seoChangeDraftSchema);
