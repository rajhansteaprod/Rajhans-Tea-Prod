import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProductVariantDoc extends Document {
  productId: Types.ObjectId;
  name: string;           // e.g. "50g", "100g", "250ml"
  optionKey?: string;     // dictionary option key, e.g. "Weight"
  optionValue?: string;   // chosen value from the dictionary, e.g. "250g"
  sku?: string;           // SKU code (optional)
  price: number;
  discountedPrice?: number; // Price after discount applied (if different from price)
  cost?: number;          // Cost price (admin only)
  costPerCupText?: string; // Free-text cost-per-cup line, e.g. "400 cups - Rs.1.32 a cup"
  stock: number;
  trackInventory: boolean;
  images?: string[];      // Variant-specific images
  attributes?: Map<string, string>;
  position: number;       // Sort order
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productVariantSchema = new Schema<IProductVariantDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    optionKey: { type: String, trim: true },
    optionValue: { type: String, trim: true },
    sku: { type: String, lowercase: true, sparse: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, min: 0 },
    cost: { type: Number, min: 0 },
    costPerCupText: { type: String, trim: true, maxlength: 120 },
    stock: { type: Number, default: 0, min: 0 },
    trackInventory: { type: Boolean, default: true },
    images: [{ type: String }],
    attributes: { type: Map, of: String },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productVariantSchema.index({ productId: 1, isActive: 1 });
productVariantSchema.index({ productId: 1, position: 1 });
productVariantSchema.index({ sku: 1 }, { sparse: true });
// Supports catalog facet filtering by option value (e.g. all products with a 250g variant)
productVariantSchema.index({ optionValue: 1, isActive: 1 });

export const ProductVariant = mongoose.model<IProductVariantDoc>(
  'ProductVariant',
  productVariantSchema,
);
