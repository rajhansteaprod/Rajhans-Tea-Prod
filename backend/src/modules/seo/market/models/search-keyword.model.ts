import mongoose, { Document, Schema } from 'mongoose';
import { Intent, Market, RelevanceBand, RelevanceConfidence } from '../market.types';

/**
 * One canonical keyword identity discovered from the search market. Normalized
 * intelligence lives here; per-provider time-series metrics live in
 * SearchKeywordMetric; raw provider payloads (optional) in SearchProviderRawResponse.
 * `clusterId` is a forward reference — clustering itself is Phase 4b.3.
 */
export interface ISearchKeywordDoc extends Document {
  keyword: string; // representative surface form
  normalizedKeyword: string; // identity/dedup key
  variants: string[]; // preserved original surface forms
  market: Market;
  language: string;
  sources: string[]; // provider ids that returned it

  intents: { intent: Intent; confidence: number; reasons: string[] }[]; // filled in 4b.3

  businessRelevance: { score: number; band: RelevanceBand; confidence: RelevanceConfidence } | null;
  commercialIntent: { score: number; band: RelevanceBand } | null;
  competitorBranded: boolean;
  hardNegative: boolean;

  clusterId: mongoose.Types.ObjectId | null;
  currentRajhansUrl: string | null;

  discoveredAt: Date;
  lastCheckedAt: Date | null;
  sourceFreshness: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const intentSchema = new Schema(
  { intent: { type: String }, confidence: { type: Number }, reasons: { type: [String], default: [] } },
  { _id: false },
);

const schema = new Schema<ISearchKeywordDoc>(
  {
    keyword: { type: String, required: true },
    normalizedKeyword: { type: String, required: true, index: true },
    variants: { type: [String], default: [] },
    market: { type: Schema.Types.Mixed, required: true },
    language: { type: String, default: 'en' },
    sources: { type: [String], default: [] },
    intents: { type: [intentSchema], default: [] },
    businessRelevance: { type: Schema.Types.Mixed, default: null },
    commercialIntent: { type: Schema.Types.Mixed, default: null },
    competitorBranded: { type: Boolean, default: false },
    hardNegative: { type: Boolean, default: false },
    clusterId: { type: Schema.Types.ObjectId, ref: 'SearchCluster', default: null },
    currentRajhansUrl: { type: String, default: null },
    discoveredAt: { type: Date, default: Date.now },
    lastCheckedAt: { type: Date, default: null },
    sourceFreshness: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ normalizedKeyword: 1, 'market.country': 1, 'market.language': 1 }, { unique: true });
schema.index({ clusterId: 1 });

export const SearchKeyword = mongoose.model<ISearchKeywordDoc>('SearchKeyword', schema);
