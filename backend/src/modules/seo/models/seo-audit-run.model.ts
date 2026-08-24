import mongoose, { Document, Schema } from 'mongoose';
import { RunScope, RunStatus, RunTrigger } from '../seo.types';

/**
 * One SEO audit execution. Holds the run-level rollups and the baseline-aware
 * delta vs the previous completed run. `isBaseline` marks the very first run so
 * existing issues are not mislabeled as regressions.
 */
export interface ISeoAuditRunDoc extends Document {
  trigger: RunTrigger;
  scope: RunScope;
  status: RunStatus;
  isBaseline: boolean;
  previousRunId: mongoose.Types.ObjectId | null;
  siteReachable: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  urlsDiscovered: number;
  urlsFetched: number;
  coverageRatio: number;
  counts: { critical: number; warning: number; info: number };
  delta: { new: number; resolved: number; regressions: number };
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const seoAuditRunSchema = new Schema<ISeoAuditRunDoc>(
  {
    trigger: { type: String, enum: ['manual', 'cron'], required: true },
    scope: { type: String, enum: ['daily', 'weekly', 'deep'], default: 'daily' },
    status: {
      type: String,
      enum: ['running', 'completed', 'degraded', 'failed'],
      default: 'running',
      index: true,
    },
    isBaseline: { type: Boolean, default: false },
    previousRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', default: null },
    siteReachable: { type: Boolean, default: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    urlsDiscovered: { type: Number, default: 0 },
    urlsFetched: { type: Number, default: 0 },
    coverageRatio: { type: Number, default: 0 },
    counts: {
      critical: { type: Number, default: 0 },
      warning: { type: Number, default: 0 },
      info: { type: Number, default: 0 },
    },
    delta: {
      new: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      regressions: { type: Number, default: 0 },
    },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

seoAuditRunSchema.index({ createdAt: -1 });
seoAuditRunSchema.index({ status: 1, createdAt: -1 });

export const SeoAuditRun = mongoose.model<ISeoAuditRunDoc>('SeoAuditRun', seoAuditRunSchema);
