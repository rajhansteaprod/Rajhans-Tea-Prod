import mongoose, { Document, Schema, Types } from 'mongoose';

export type RuleType = 'manual' | 'automated';
export type RuleSection = 'trending' | 'recommended' | 'featured_collections' | 'new_arrivals' | 'banner';
export type RuleStrategy = 'top_selling' | 'new_arrivals' | 'low_stock' | 'most_viewed' | 'category_top';

export interface IMerchandisingRuleDoc extends Document {
  name: string;
  slug: string;
  type: RuleType;
  section: RuleSection;
  pinnedProducts: Types.ObjectId[];
  strategy: RuleStrategy | null;
  strategyConfig: {
    categoryId?: Types.ObjectId;
    lookbackDays?: number;
    limit?: number;
    minStock?: number;
  };
  priority: number;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  cachedProductIds: Types.ObjectId[];
  cachedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const merchandisingRuleSchema = new Schema<IMerchandisingRuleDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['manual', 'automated'], required: true },
    section: { type: String, enum: ['trending', 'recommended', 'featured_collections', 'new_arrivals', 'banner'], required: true },
    pinnedProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    strategy: { type: String, enum: ['top_selling', 'new_arrivals', 'low_stock', 'most_viewed', 'category_top'], default: null },
    strategyConfig: {
      categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
      lookbackDays: { type: Number, default: 7 },
      limit: { type: Number, default: 12 },
      minStock: { type: Number, default: 5 },
    },
    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    cachedProductIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    cachedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

merchandisingRuleSchema.index({ section: 1, isActive: 1, priority: -1 });
merchandisingRuleSchema.index({ slug: 1 }, { unique: true });

export const MerchandisingRule = mongoose.model<IMerchandisingRuleDoc>('MerchandisingRule', merchandisingRuleSchema);
