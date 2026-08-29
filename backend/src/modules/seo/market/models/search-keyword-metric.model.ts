import mongoose, { Document, Schema } from 'mongoose';

/**
 * Time-series, per-provider metric snapshot for a keyword. Every numeric field is
 * nullable — null = UNKNOWN, NEVER zero.
 *
 * PAID-advertiser signals (`cpc`, `paidCompetition*`) are stored here as provider
 * evidence and may only feed commercialValue — they are DELIBERATELY separate from
 * `organicDifficulty`, which is populated only from SERP/authority/GSC evidence
 * (Phase 4b.5+) and is null (UNKNOWN) until then. The two must never be conflated.
 */
export interface ISearchKeywordMetricDoc extends Document {
  keywordId: mongoose.Types.ObjectId;
  provider: string;
  capturedAt: Date;

  searchVolume: number | null;
  volumeRange: [number, number] | null;

  // ── PAID (advertiser) — NOT organic SEO difficulty ──
  cpc: { value: number; currency: string } | null;
  paidCompetition: 'low' | 'medium' | 'high' | null;
  paidCompetitionIndex: number | null;

  // ── ORGANIC difficulty — separate field, SERP/authority/GSC-sourced (4b.5+) ──
  organicDifficulty: { score: number; band: 'low' | 'medium' | 'high'; source: 'serp' | 'gsc'; reasons: string[] } | null;

  trend: 'rising' | 'flat' | 'declining' | null;
  seasonality: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISearchKeywordMetricDoc>(
  {
    keywordId: { type: Schema.Types.ObjectId, ref: 'SearchKeyword', required: true, index: true },
    provider: { type: String, required: true },
    capturedAt: { type: Date, required: true },
    searchVolume: { type: Number, default: null },
    volumeRange: { type: [Number], default: null },
    cpc: { type: Schema.Types.Mixed, default: null },
    paidCompetition: { type: String, enum: ['low', 'medium', 'high', null], default: null },
    paidCompetitionIndex: { type: Number, default: null },
    organicDifficulty: { type: Schema.Types.Mixed, default: null },
    trend: { type: String, enum: ['rising', 'flat', 'declining', null], default: null },
    seasonality: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

// One snapshot per (keyword, provider, capturedAt) — idempotent daily/periodic capture.
schema.index({ keywordId: 1, provider: 1, capturedAt: 1 }, { unique: true });

export const SearchKeywordMetric = mongoose.model<ISearchKeywordMetricDoc>('SearchKeywordMetric', schema);
