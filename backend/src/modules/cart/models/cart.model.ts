import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICartItem {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  qty: number;
  addedAt: Date;
}

export interface ICartDoc extends Document {
  sessionId: string;
  userId: Types.ObjectId | null;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: false },
    qty: { type: Number, required: true, min: 1, default: 1 },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const cartSchema = new Schema<ICartDoc>(
  {
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

cartSchema.index({ sessionId: 1 }, { unique: true });
cartSchema.index({ userId: 1 }, { sparse: true });

export const Cart = mongoose.model<ICartDoc>('Cart', cartSchema);
