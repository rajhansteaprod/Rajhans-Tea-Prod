import mongoose, { Document, Schema } from 'mongoose';
import { Market } from '../market.types';

export type SeedType = 'region' | 'processing' | 'consumption' | 'attribute' | 'commercial' | 'category' | 'product' | 'brand';

/** A discovery seed derived from real Rajhans inventory / curated facets. */
export interface ISearchSeedDoc extends Document {
  term: string;
  normalizedTerm: string;
  type: SeedType;
  sourceRef: { kind: 'product' | 'category' | 'blog' | 'page' | 'facet'; id?: string; slug?: string } | null;
  market: Market;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISearchSeedDoc>(
  {
    term: { type: String, required: true },
    normalizedTerm: { type: String, required: true, index: true },
    type: { type: String, enum: ['region', 'processing', 'consumption', 'attribute', 'commercial', 'category', 'product', 'brand'], required: true },
    sourceRef: { type: Schema.Types.Mixed, default: null },
    market: { type: Schema.Types.Mixed, required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// One seed per (normalized term, market country+language). Guards accidental dupes.
schema.index({ normalizedTerm: 1, 'market.country': 1, 'market.language': 1 }, { unique: true });

export const SearchSeed = mongoose.model<ISearchSeedDoc>('SearchSeed', schema);
