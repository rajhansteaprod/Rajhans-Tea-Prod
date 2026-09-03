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

/**
 * Phase 5.5 — immutable quality-control evidence captured at execution time, so
 * a successful execution can later answer: what evaluator version ran, what risk
 * level it reported, what warnings existed, what checks passed, and which
 * metadata fields were written.
 *
 * OPTIONAL by design: every Phase 5.3/5.4 execution recorded before Phase 5.5
 * has no `qualityControl` and must keep loading and serializing safely. Old
 * records are never rewritten, and nothing here is a mutable "latest score" —
 * it is a snapshot of the evaluation that authorized this one execution.
 *
 * Codes are stored as plain strings rather than enums so that adding a future
 * check/warning code can never invalidate an existing historical record.
 */
export interface ExecutionQualityWarning {
  code: string;
  message: string;
  targetUrl?: string;
}

export interface ExecutionQualityCheck {
  code: string;
  status: string;
  message: string;
  targetUrl?: string;
}

export interface ExecutionQualityChangedFields {
  targetUrl: string;
  fields: string[];
}

export interface ExecutionQualityControl {
  preflightVersion: string;
  riskLevel: 'low' | 'medium' | 'high';
  warnings: ExecutionQualityWarning[];
  checks: ExecutionQualityCheck[];
  changedFields: ExecutionQualityChangedFields[];
  evaluatedAt: Date;
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
  /** Phase 5.5+. Absent on every execution recorded before Phase 5.5. */
  qualityControl?: ExecutionQualityControl;
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

const executionQualityWarningSchema = new Schema<ExecutionQualityWarning>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    targetUrl: { type: String },
  },
  { _id: false },
);

const executionQualityCheckSchema = new Schema<ExecutionQualityCheck>(
  {
    code: { type: String, required: true },
    status: { type: String, required: true },
    message: { type: String, required: true },
    targetUrl: { type: String },
  },
  { _id: false },
);

const executionQualityChangedFieldsSchema = new Schema<ExecutionQualityChangedFields>(
  {
    targetUrl: { type: String, required: true },
    fields: { type: [String], required: true },
  },
  { _id: false },
);

const executionQualityControlSchema = new Schema<ExecutionQualityControl>(
  {
    preflightVersion: { type: String, required: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
    warnings: { type: [executionQualityWarningSchema], default: [] },
    checks: { type: [executionQualityCheckSchema], default: [] },
    changedFields: { type: [executionQualityChangedFieldsSchema], default: [] },
    evaluatedAt: { type: Date, required: true },
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
    // No `default` — a pre-Phase-5.5 record must hydrate with qualityControl
    // undefined rather than being silently given a fabricated empty evaluation.
    qualityControl: { type: executionQualityControlSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Core idempotency guarantee: at most one successful execution per draft, ever.
seoChangeExecutionSchema.index({ draftId: 1 }, { unique: true });

export const SeoChangeExecution = mongoose.model<ISeoChangeExecutionDoc>(
  'SeoChangeExecution',
  seoChangeExecutionSchema,
);
