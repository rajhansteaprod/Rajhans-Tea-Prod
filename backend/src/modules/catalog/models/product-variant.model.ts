import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProductVariantDoc extends Document {
  productId: Types.ObjectId;
  name: string;           // e.g. "50g", "100g", "250ml"
  sku?: string;           // SKU code (optional)
  price: number;
  discountPercentage: number; // Discount percentage applied to price
  discountedPrice?: number; // Price after discount applied
  cost?: number;          // Cost price (admin only)
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
    sku: { type: String, lowercase: true, sparse: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
    discountedPrice: { type: Number, min: 0 },
    cost: { type: Number, min: 0 },
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

export const ProductVariant = mongoose.model<IProductVariantDoc>(
  'ProductVariant',
  productVariantSchema,
);
