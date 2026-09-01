import mongoose, { Document, Schema } from 'mongoose';

/**
 * Phase 5.3 — controlled execution. Immutable forensic record of ONE successful
 * execution of an approved SeoChangeDraft's metadata-only proposed changes
 * against live CMS Page documents.
 *
 * Only SUCCESSFUL executions are persisted here. A rejected or failed attempt
 * never mutates production and is returned to the caller as a structured error
 * (see change-execution.service.ts) — it is never fabricated as a "failed"
 * record. This keeps the collection's only invariant simple and load-bearing:
 * a unique index on `draftId` is sufficient, on its own, to guarantee a draft
 * can never be successfully executed twice.
 */
export type ExecutionTargetType = 'cms_page';

/** Only the two whitelisted fields this phase may read or write. */
export interface ExecutedFieldSnapshot {
  metaTitle?: string;
  metaDescription?: string;
}

/** One resolved CMS page within a (possibly multi-target) draft execution. */
export interface ExecutedTarget {
  targetUrl: string;
  targetDocumentId: mongoose.Types.ObjectId;
  before: ExecutedFieldSnapshot;
  proposed: ExecutedFieldSnapshot;
  after: ExecutedFieldSnapshot;
}

export interface ISeoChangeExecutionDoc extends Document {
  draftId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  targetType: ExecutionTargetType;
  targets: ExecutedTarget[];
  executorUserId: mongoose.Types.ObjectId;
  executedAt: Date;
  status: 'succeeded';
  generatorVersion: string;
  executorVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

const executedFieldSnapshotSchema = new Schema<ExecutedFieldSnapshot>(
  {
    metaTitle: { type: String },
    metaDescription: { type: String },
  },
  { _id: false },
);

const executedTargetSchema = new Schema<ExecutedTarget>(
  {
    targetUrl: { type: String, required: true },
    targetDocumentId: { type: Schema.Types.ObjectId, required: true },
    before: { type: executedFieldSnapshotSchema, required: true },
    proposed: { type: executedFieldSnapshotSchema, required: true },
    after: { type: executedFieldSnapshotSchema, required: true },
  },
  { _id: false },
);

const seoChangeExecutionSchema = new Schema<ISeoChangeExecutionDoc>(
  {
    draftId: { type: Schema.Types.ObjectId, ref: 'SeoChangeDraft', required: true },
    recommendationId: { type: Schema.Types.ObjectId, ref: 'SeoRecommendation', required: true, index: true },
    recommendationFingerprint: { type: String, required: true },
    targetType: { type: String, enum: ['cms_page'], required: true },
    targets: { type: [executedTargetSchema], required: true },
    executorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    executedAt: { type: Date, required: true },
    status: { type: String, enum: ['succeeded'], default: 'succeeded' },
    generatorVersion: { type: String, required: true },
    executorVersion: { type: String, required: true },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Core idempotency guarantee: at most one successful execution per draft, ever.
seoChangeExecutionSchema.index({ draftId: 1 }, { unique: true });

export const SeoChangeExecution = mongoose.model<ISeoChangeExecutionDoc>(
  'SeoChangeExecution',
  seoChangeExecutionSchema,
);
