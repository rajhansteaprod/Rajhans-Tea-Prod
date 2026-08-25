import mongoose, { Document, Schema } from 'mongoose';

/**
 * One query×page aggregated over an opportunity window (the fact the analyzers
 * read). Period snapshots are retained so a historical opportunity decision can
 * be reconstructed exactly. Upserted idempotently on `{ periodEnd, query, normalizedUrl }`.
 */
export interface IGscQueryPageMetricDoc extends Document {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  query: string;
  page: string;
  normalizedUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  syncRunId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGscQueryPageMetricDoc>(
  {
    periodStart: { type: String, required: true },
    periodEnd: { type: String, required: true, index: true },
    query: { type: String, required: true },
    page: { type: String, required: true },
    normalizedUrl: { type: String, required: true, index: true },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    position: { type: Number, default: 0 },
    syncRunId: { type: Schema.Types.ObjectId, ref: 'GscSyncRun', required: true },
  },
  { timestamps: true },
);

schema.index({ periodEnd: 1, query: 1, normalizedUrl: 1 }, { unique: true });
schema.index({ periodEnd: 1, query: 1 });

export const GscQueryPageMetric = mongoose.model<IGscQueryPageMetricDoc>('GscQueryPageMetric', schema);
