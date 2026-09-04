import mongoose, { Document, Schema } from 'mongoose';
import {
  AnalysisEvidenceWindow,
  ContentOpportunity,
  MissingEvidence,
  PageContentState,
  PageExecutability,
  PageExistingWork,
  PageMarketEvidence,
  PageSearchPerformance,
  TopicCoverageEntry,
} from '../content.types';
import { PageType } from '../../market/market.types';

/**
 * Phase 6.1 — the persisted page-analysis artifact.
 *
 * What this collection IS: a deterministic, provenanced record of what was
 * observed about one page, in one evidence window, by one analyzer version,
 * and what opportunities that evidence did or did not support.
 *
 * What it is NOT, and must never become:
 *   - a second recommendation store (recommendations stay in SeoRecommendation,
 *     with its existing fingerprint/review/resolution lifecycle),
 *   - an execution or mutation queue (nothing here is ever applied),
 *   - a copy of the GSC/market collections (bounded summaries + stable
 *     references only — see contentConfig.limits).
 *
 * Negative results are first-class. A page analysed and found healthy is
 * persisted WITH its empty opportunity list, because Phase 8 needs the control
 * group as much as the findings, and "was this page ever looked at?" must be
 * answerable.
 *
 * ── Identity and growth ──
 * Unique on (normalizedUrl, analyzerVersion, evidenceWindowKey). Re-running the
 * CLI ten times against the same audit run and GSC period upserts ONE row; a
 * new row appears only when the evidence genuinely moves (new audit run or new
 * GSC period) or the analyzer version is bumped. Retention prunes per page on
 * top of that, so growth is bounded in both dimensions.
 */
export interface ISeoContentPageAnalysisDoc extends Document {
  // identity
  normalizedUrl: string;
  canonicalUrl: string;
  pageType: PageType;
  sourceRef: { model: string; documentId: mongoose.Types.ObjectId | null; slug: string };

  // provenance
  analyzerVersion: string;
  extractorVersion: string | null;
  analyzedAt: Date;
  inputsHash: string;
  evidenceWindowKey: string;
  evidenceWindow: AnalysisEvidenceWindow;

  // evidence
  currentState: PageContentState;
  searchPerformance: PageSearchPerformance;
  marketEvidence: PageMarketEvidence;
  existingWork: PageExistingWork;
  topicCoverage: TopicCoverageEntry[];

  // findings
  opportunities: ContentOpportunity[];
  missingEvidence: MissingEvidence[];
  executability: PageExecutability;

  createdAt: Date;
  updatedAt: Date;
}

const executabilitySchema = new Schema<PageExecutability>(
  {
    status: { type: String, enum: ['executable', 'recommendation_only', 'unsupported'], required: true },
    reason: { type: String, default: '' },
    supportedFields: { type: [String], default: [] },
    targetType: { type: String, default: null },
  },
  { _id: false },
);

const evidenceWindowSchema = new Schema<AnalysisEvidenceWindow>(
  {
    auditRunId: { type: String, default: null },
    auditRunAt: { type: Date, default: null },
    auditRunStatus: { type: String, default: null },
    snapshotContentHash: { type: String, default: null },
    gscPeriodStart: { type: String, default: null },
    gscPeriodEnd: { type: String, default: null },
    marketEvidenceAt: { type: Date, default: null },
  },
  { _id: false },
);

const missingEvidenceSchema = new Schema<MissingEvidence>(
  {
    source: { type: String, required: true },
    reason: { type: String, required: true },
    suppressedOpportunityTypes: { type: [String], default: [] },
    detail: { type: String, default: '' },
  },
  { _id: false },
);

const topicCoverageSchema = new Schema<TopicCoverageEntry>(
  {
    dimension: { type: String, required: true },
    term: { type: String, required: true },
    covered: { type: Boolean, required: true },
    foundIn: { type: String, default: null },
    demandSource: { type: String, required: true },
  },
  { _id: false },
);

// Opportunity/evidence payloads are stored as Mixed deliberately: the taxonomy
// and the evidence facts are versioned by `analyzerVersion`, and a historical
// row must keep loading verbatim even after a later version adds a type or a
// fact key. Enum-ing them would let a future addition invalidate stored history.
const opportunitySchema = new Schema<ContentOpportunity>(
  {
    type: { type: String, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], required: true },
    evidenceStrength: { type: String, enum: ['low', 'medium', 'high'], required: true },
    explanation: { type: String, default: '' },
    affectedQueries: { type: [String], default: [] },
    evidence: { type: Schema.Types.Mixed, default: [] },
    discriminator: { type: String, required: true },
  },
  { _id: false },
);

const schema = new Schema<ISeoContentPageAnalysisDoc>(
  {
    normalizedUrl: { type: String, required: true, index: true },
    canonicalUrl: { type: String, required: true },
    pageType: { type: String, required: true, index: true },
    sourceRef: {
      model: { type: String, default: '' },
      documentId: { type: Schema.Types.ObjectId, default: null },
      slug: { type: String, default: '' },
    },

    analyzerVersion: { type: String, required: true, index: true },
    extractorVersion: { type: String, default: null },
    analyzedAt: { type: Date, required: true },
    inputsHash: { type: String, required: true },
    evidenceWindowKey: { type: String, required: true },
    evidenceWindow: { type: evidenceWindowSchema, required: true },

    currentState: { type: Schema.Types.Mixed, required: true },
    searchPerformance: { type: Schema.Types.Mixed, required: true },
    marketEvidence: { type: Schema.Types.Mixed, required: true },
    existingWork: { type: Schema.Types.Mixed, required: true },
    topicCoverage: { type: [topicCoverageSchema], default: [] },

    opportunities: { type: [opportunitySchema], default: [] },
    missingEvidence: { type: [missingEvidenceSchema], default: [] },
    executability: { type: executabilitySchema, required: true },
  },
  { timestamps: true },
);

// The upsert identity: one row per page per analyzer version per evidence window.
schema.index({ normalizedUrl: 1, analyzerVersion: 1, evidenceWindowKey: 1 }, { unique: true });
// Retention + "latest analysis per page" reads.
schema.index({ normalizedUrl: 1, analyzedAt: -1 });
schema.index({ analyzedAt: -1 });

export const SeoContentPageAnalysis = mongoose.model<ISeoContentPageAnalysisDoc>(
  'SeoContentPageAnalysis',
  schema,
);
