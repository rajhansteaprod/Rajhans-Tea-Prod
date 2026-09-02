import mongoose, { Document, Schema } from 'mongoose';

/**
 * VariantOption — a reusable option "dictionary" defined once by the admin
 * (e.g. key "Weight" with values ["100g", "250g", "500g", "1kg"]). Products
 * pick a key + one of its values per variant, and these keys/values drive the
 * catalog facet filters. This is a global taxonomy, not per-product.
 */
export interface IVariantOptionDoc extends Document {
  key: string;        // e.g. "Weight" (unique, case-insensitive)
  values: string[];   // e.g. ["100g", "250g", "500g", "1kg"]
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const variantOptionSchema = new Schema<IVariantOptionDoc>(
  {
    key: { type: String, required: true, trim: true, unique: true },
    values: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

variantOptionSchema.index({ isActive: 1, sortOrder: 1 });

export const VariantOption = mongoose.model<IVariantOptionDoc>(
  'VariantOption',
  variantOptionSchema,
);
