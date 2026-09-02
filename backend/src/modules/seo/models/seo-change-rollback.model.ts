import mongoose, { Document, Schema } from 'mongoose';
import { ExecutedFieldSnapshot, ExecutionTargetType } from './seo-change-execution.model';

/**
 * Phase 5.4B — controlled rollback. Immutable forensic record of ONE
 * SUCCESSFUL rollback of ONE Phase 5.3 SeoChangeExecution: the whitelisted CMS
 * Page metadata fields that execution actually wrote are restored to the values
 * captured in `execution.targets[].before`, and nothing else.
 *
 * Only successful rollbacks are persisted here. A rejected attempt (stale,
 * unsupported target, missing page, …) never mutates production and is
 * returned to the caller as a structured error (see change-rollback.service.ts)
 * — it is never fabricated as a "failed" record. As with Phase 5.3 execution,
 * that keeps the single invariant simple and load-bearing: the unique index on
 * `executionId` alone guarantees an execution can never be rolled back twice.
 *
 * Rollback never deletes or rewrites execution/verification/completion history.
 * The presence of this record is what makes "rolled back" the current human
 * implementation outcome; an earlier SeoChangeCompletion stays exactly as it
 * was written.
 */

/** One rolled-back CMS page within a (possibly multi-target) execution. */
export interface RolledBackTarget {
  targetUrl: string;
  targetDocumentId: mongoose.Types.ObjectId;
  /** Live values immediately before this rollback wrote (== execution.after, stale-checked). */
  beforeRollback: ExecutedFieldSnapshot;
  /** Exactly what was written back — taken only from execution.before. */
  restored: ExecutedFieldSnapshot;
  /** Live values read back from the Page after the rollback write. */
  afterRollback: ExecutedFieldSnapshot;
}

export interface ISeoChangeRollbackDoc extends Document {
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  rollbackUserId: mongoose.Types.ObjectId;
  rolledBackAt: Date;
  targetType: ExecutionTargetType;
  targets: RolledBackTarget[];
  status: 'succeeded';
  rollbackVersion: string;
  createdAt: Date;
}

const rollbackFieldSnapshotSchema = new Schema<ExecutedFieldSnapshot>(
  {
    metaTitle: { type: String },
    metaDescription: { type: String },
  },
  { _id: false },
);

const rolledBackTargetSchema = new Schema<RolledBackTarget>(
  {
    targetUrl: { type: String, required: true },
    targetDocumentId: { type: Schema.Types.ObjectId, required: true },
    beforeRollback: { type: rollbackFieldSnapshotSchema, required: true },
    restored: { type: rollbackFieldSnapshotSchema, required: true },
    afterRollback: { type: rollbackFieldSnapshotSchema, required: true },
  },
  { _id: false },
);

const seoChangeRollbackSchema = new Schema<ISeoChangeRollbackDoc>(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'SeoChangeExecution', required: true },
    recommendationId: { type: Schema.Types.ObjectId, ref: 'SeoRecommendation', required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, ref: 'SeoChangeDraft', required: true },
    rollbackUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rolledBackAt: { type: Date, required: true },
    targetType: { type: String, enum: ['cms_page'], required: true },
    targets: { type: [rolledBackTargetSchema], required: true },
    status: { type: String, enum: ['succeeded'], default: 'succeeded' },
    rollbackVersion: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Core invariant: at most one successful rollback per execution, ever.
seoChangeRollbackSchema.index({ executionId: 1 }, { unique: true });

export const SeoChangeRollback = mongoose.model<ISeoChangeRollbackDoc>('SeoChangeRollback', seoChangeRollbackSchema);
