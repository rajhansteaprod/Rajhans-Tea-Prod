import mongoose, { Document, Schema } from 'mongoose';

// GST slabs used in India
export type GSTSlab = 0 | 5 | 12 | 18 | 28;

export interface ITaxRuleDoc extends Document {
  name: string; // e.g. "Tea & Beverages GST"
  categoryId?: mongoose.Types.ObjectId; // null = global default
  rate: number; // percentage: 0, 5, 12, 18, 28
  isInclusive: boolean; // true = price already includes tax (MRP), false = tax added on top
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRuleSchema = new Schema<ITaxRuleDoc>(
  {
    name: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    rate: { type: Number, required: true, min: 0, max: 100, default: 18 },
    isInclusive: { type: Boolean, default: true }, // Indian ecommerce: MRP is tax-inclusive
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

TaxRuleSchema.index({ categoryId: 1, isActive: 1 });

export const TaxRule = mongoose.model<ITaxRuleDoc>('TaxRule', TaxRuleSchema);
