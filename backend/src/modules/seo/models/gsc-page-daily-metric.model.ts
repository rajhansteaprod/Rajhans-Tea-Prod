import mongoose, { Document, Schema } from 'mongoose';

/**
 * One page's GSC performance for one day (trend fact). Retained long-term for
 * long-range comparison — see gscConfig.retentionMonths (default ≥ 24 months).
 * Upserted idempotently on `{ date, normalizedUrl }`.
 */
export interface IGscPageDailyMetricDoc extends Document {
  date: string; // YYYY-MM-DD
  page: string; // raw GSC page URL
  normalizedUrl: string; // normalizeUrl(page) — the join key to SEO snapshots
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
  syncRunId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGscPageDailyMetricDoc>(
  {
    date: { type: String, required: true },
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

schema.index({ date: 1, normalizedUrl: 1 }, { unique: true });
schema.index({ normalizedUrl: 1, date: 1 });

export const GscPageDailyMetric = mongoose.model<IGscPageDailyMetricDoc>('GscPageDailyMetric', schema);
