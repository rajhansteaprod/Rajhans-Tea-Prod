import mongoose, { Document, Schema } from 'mongoose';
import {
  RecommendationCategory,
  RecommendationEffort,
  RecommendationImpact,
  RecommendationPriority,
  RecommendationSource,
} from '../seo.types';

/**
 * A persistent growth recommendation, keyed by `fingerprint` so its lifecycle
 * (open → resolved → possibly reopened) and history (first/last seen) span runs —
 * the same set-based model the SeoIssue uses, so NEW / PERSISTENT / RESOLVED are
 * derived, not recomputed. Always automationLevel='recommend' (Phase 3).
 */
export interface ISeoRecommendationDoc extends Document {
  fingerprint: string; // hash(recommendationId + discriminator)
  recommendationId: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  impact: RecommendationImpact;
  score: number;
  title: string;
  why: string;
  suggestedFix: string;
  estimatedEffort: RecommendationEffort;
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  relatedCheckIds: string[];
  automationLevel: 'recommend';
  /** 'audit' (default) or 'gsc'. Keeps the two diff lifecycles independent. */
  source: RecommendationSource;
  /** GSC demand attached to this rec (capped bonus + impressions) — kept SEPARATE
   *  from technical severity/priority so the two stay conceptually distinct. */
  demandBonus: number;
  demandImpressions: number;
  status: 'open' | 'resolved';

  // Phase 5.1 — human review lifecycle. Deliberately independent from
  // open/resolved, which describes whether the SEO opportunity still exists.
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_changes';
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedBy: mongoose.Types.ObjectId | null;

  firstSeenRunId: mongoose.Types.ObjectId;
  lastSeenRunId: mongoose.Types.ObjectId;
  resolvedRunId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const seoRecommendationSchema = new Schema<ISeoRecommendationDoc>(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    recommendationId: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], required: true },
    impact: { type: String, enum: ['very-high', 'high', 'medium', 'low'], required: true },
    score: { type: Number, default: 0 },
    title: { type: String, default: '' },
    why: { type: String, default: '' },
    suggestedFix: { type: String, default: '' },
    estimatedEffort: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    affectedUrls: { type: [String], default: [] },
    evidence: { type: Schema.Types.Mixed, default: {} },
    relatedCheckIds: { type: [String], default: [] },
    automationLevel: { type: String, enum: ['recommend'], default: 'recommend' },
    source: { type: String, enum: ['audit', 'gsc', 'market'], default: 'audit', index: true },
    demandBonus: { type: Number, default: 0 },
    demandImpressions: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },

    // Human review does NOT execute or modify production SEO.
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_changes'],
      default: 'pending',
      index: true,
    },
    reviewNote: { type: String, default: null, maxlength: 5000 },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    firstSeenRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', required: true },
    lastSeenRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', required: true },
    resolvedRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', default: null },
  },
  { timestamps: true },
);

seoRecommendationSchema.index({ status: 1, priority: 1 });
seoRecommendationSchema.index({ status: 1, reviewStatus: 1, priority: 1 });
seoRecommendationSchema.index({ lastSeenRunId: 1 });

export const SeoRecommendation = mongoose.model<ISeoRecommendationDoc>(
  'SeoRecommendation',
  seoRecommendationSchema,
);
