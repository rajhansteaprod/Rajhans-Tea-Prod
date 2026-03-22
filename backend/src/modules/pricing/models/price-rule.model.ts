import mongoose, { Document, Schema } from 'mongoose';

// ─── Quantity Tier ────────────────────────────────────────────────────────────
export interface IQuantityTier {
  minQty: number;
  maxQty: number | null; // null = unlimited
  discountPercent: number;
}

// ─── Rule Types ───────────────────────────────────────────────────────────────
// quantity_tier  → tiered discount based on qty (1-2: 0%, 3-5: 10%, 6+: 20%)
// percentage     → flat % off regardless of qty
// fixed_price    → override final price to a fixed amount (sale price)
export type PriceRuleType = 'quantity_tier' | 'percentage' | 'fixed_price';

// ─── Scope — which entities this rule applies to ──────────────────────────────
export type PriceRuleScope = 'product' | 'category' | 'collection' | 'global';

// ─── Document Interface ───────────────────────────────────────────────────────
export interface IPriceRuleDoc extends Document {
  name: string;
  type: PriceRuleType;
  scope: PriceRuleScope;

  // Scope references (only one will be set depending on scope)
  productId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  collectionId?: mongoose.Types.ObjectId;

  // For quantity_tier type
  tiers?: IQuantityTier[];

  // For percentage type (0-100)
  discountPercent?: number;

  // For fixed_price type (sale price override)
  fixedPrice?: number;

  // Rule metadata
  priority: number; // higher number = higher priority, wins over lower
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const QuantityTierSchema = new Schema<IQuantityTier>(
  {
    minQty: { type: Number, required: true, min: 1 },
    maxQty: { type: Number, default: null },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const PriceRuleSchema = new Schema<IPriceRuleDoc>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['quantity_tier', 'percentage', 'fixed_price'],
      required: true,
    },
    scope: {
      type: String,
      enum: ['product', 'category', 'collection', 'global'],
      required: true,
    },

    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', default: null },

    tiers: { type: [QuantityTierSchema], default: undefined },
    discountPercent: { type: Number, min: 0, max: 100, default: null },
    fixedPrice: { type: Number, min: 0, default: null },

    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Indexes
PriceRuleSchema.index({ scope: 1, isActive: 1, priority: -1 });
PriceRuleSchema.index({ productId: 1, isActive: 1 });
PriceRuleSchema.index({ categoryId: 1, isActive: 1 });
PriceRuleSchema.index({ collectionId: 1, isActive: 1 });

export const PriceRule = mongoose.model<IPriceRuleDoc>('PriceRule', PriceRuleSchema);
