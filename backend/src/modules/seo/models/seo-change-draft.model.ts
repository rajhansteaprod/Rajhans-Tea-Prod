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
export type ProposedChangeKind = 'metadata' | 'structured_data' | 'internal_link' | 'content' | 'faq' | 'generic';

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
}

export interface ContentProposedChange {
  kind: 'content';
  targetUrl: string;
  blocks: { heading: string; body: string }[]; // body intentionally left blank when no factual source exists
}

export interface FaqProposedChange {
  kind: 'faq';
  targetUrl: string;
  items: { question: string; answer: string }[]; // may be empty when evidence supplies no Q&A content
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
  },
  { timestamps: true },
);

seoChangeDraftSchema.index({ recommendationId: 1, status: 1 });
seoChangeDraftSchema.index({ recommendationId: 1, generatedAt: -1 });

export const SeoChangeDraft = mongoose.model<ISeoChangeDraftDoc>('SeoChangeDraft', seoChangeDraftSchema);
