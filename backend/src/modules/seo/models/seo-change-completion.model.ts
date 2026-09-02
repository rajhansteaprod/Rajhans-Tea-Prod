import mongoose, { Document, Schema } from 'mongoose';

/**
 * Phase 5.4B — human completion. Immutable forensic record stating that an
 * admin intentionally marked ONE successful, VERIFIED Phase 5.3
 * SeoChangeExecution as implemented/completed.
 *
 * This is deliberately a SEPARATE record rather than a field on
 * SeoRecommendation: `SeoRecommendation.status` (open/resolved) and
 * `resolvedRunId` are machine/evidence owned — market recommendations reopen
 * and resolve automatically as audit/GSC/market runs rediscover or stop
 * seeing them — so a human implementation decision must never be written
 * there. Completion creates nothing but this record: no Page, draft,
 * execution, verification, or recommendation document is touched.
 *
 * Only successful completions are persisted; a rejected attempt is returned to
 * the caller as a structured error (see change-completion.service.ts) and is
 * never fabricated as a "failed" record. That keeps the collection's single
 * invariant load-bearing: the unique index on `executionId` alone guarantees
 * an execution can never be completed twice.
 */
export interface ISeoChangeCompletionDoc extends Document {
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  verificationId: mongoose.Types.ObjectId;
  completedByUserId: mongoose.Types.ObjectId;
  completedAt: Date;
  status: 'completed';
  completionVersion: string;
  createdAt: Date;
}

const seoChangeCompletionSchema = new Schema<ISeoChangeCompletionDoc>(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'SeoChangeExecution', required: true },
    recommendationId: { type: Schema.Types.ObjectId, ref: 'SeoRecommendation', required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, ref: 'SeoChangeDraft', required: true },
    // The specific verified verification this completion was based on — kept so
    // the completion decision stays auditable against the exact evidence used.
    verificationId: { type: Schema.Types.ObjectId, ref: 'SeoChangeVerification', required: true },
    completedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date, required: true },
    status: { type: String, enum: ['completed'], default: 'completed' },
    completionVersion: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Core invariant: at most one completion record per execution, ever.
seoChangeCompletionSchema.index({ executionId: 1 }, { unique: true });

export const SeoChangeCompletion = mongoose.model<ISeoChangeCompletionDoc>(
  'SeoChangeCompletion',
  seoChangeCompletionSchema,
);
