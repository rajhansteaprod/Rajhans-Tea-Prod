import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProductViewDoc extends Document {
  productId: Types.ObjectId;
  userId: Types.ObjectId | null;
  sessionId: string;
  createdAt: Date;
}

const productViewSchema = new Schema<IProductViewDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, required: true },
  },
  { timestamps: true },
);

productViewSchema.index({ productId: 1, createdAt: -1 });
productViewSchema.index({ userId: 1, createdAt: -1 });
productViewSchema.index({ sessionId: 1, createdAt: -1 });
productViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ProductView = mongoose.model<IProductViewDoc>('ProductView', productViewSchema);
