import mongoose, { Document, Schema, Types } from 'mongoose';

export type ProductStatus = 'draft' | 'active' | 'archived';

export interface IProductDoc extends Document {
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: Types.ObjectId;
  collections: Types.ObjectId[];
  basePrice: number;
  images: string[];
  attributes: Map<string, string>;
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProductDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    shortDescription: { type: String, trim: true, maxlength: 300 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    collections: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
    basePrice: { type: Number, required: true, min: 0 },
    images: [{ type: String }],
    attributes: { type: Map, of: String, default: {} },
    tags: [{ type: String, trim: true, lowercase: true }],
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    isFeatured: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },
    trackInventory: { type: Boolean, default: false },
  },
  { timestamps: true },
);

productSchema.index({ slug: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ collections: 1, status: 1 });
productSchema.index({ isFeatured: 1, status: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

export const Product = mongoose.model<IProductDoc>('Product', productSchema);
