import mongoose, { Document, Schema } from 'mongoose';
import { GscSyncStatus, GscSyncTrigger } from '../gsc.types';

/** One GSC sync execution. `error` is ALWAYS sanitized (no credential material). */
export interface IGscSyncRunDoc extends Document {
  trigger: GscSyncTrigger;
  status: GscSyncStatus;
  dateRange: { start: string; end: string };
  pageRowsUpserted: number;
  queryPageRowsUpserted: number;
  opportunitiesDetected: number;
  /** Distinct GSC URLs dropped before persistence (never contaminate metrics). */
  ignoredRows: { noindexSystem: number; obsoleteSoft404: number; unresolved: number };
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const gscSyncRunSchema = new Schema<IGscSyncRunDoc>(
  {
    trigger: { type: String, enum: ['manual', 'cron', 'dry-run'], required: true },
    status: { type: String, enum: ['running', 'completed', 'degraded', 'failed'], default: 'running', index: true },
    dateRange: { start: { type: String, default: '' }, end: { type: String, default: '' } },
    pageRowsUpserted: { type: Number, default: 0 },
    queryPageRowsUpserted: { type: Number, default: 0 },
    opportunitiesDetected: { type: Number, default: 0 },
    ignoredRows: {
      noindexSystem: { type: Number, default: 0 },
      obsoleteSoft404: { type: Number, default: 0 },
      unresolved: { type: Number, default: 0 },
    },
    error: { type: String, default: null }, // sanitized only
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

gscSyncRunSchema.index({ createdAt: -1 });

export const GscSyncRun = mongoose.model<IGscSyncRunDoc>('GscSyncRun', gscSyncRunSchema);
