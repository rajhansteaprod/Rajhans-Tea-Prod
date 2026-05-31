import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICartItem {
  productId: Types.ObjectId;
  slug: string; // Denormalized for quick access without populate
  variantId?: Types.ObjectId;
  qty: number;
  addedAt: Date;
}

export interface ICartDoc extends Document {
  guestSessionId?: string;
  userId?: Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    slug: { type: String, required: true }, // Denormalized for quick access
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: false },
    qty: { type: Number, required: true, min: 1, default: 1 },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const cartSchema = new Schema<ICartDoc>(
  {
    guestSessionId: { type: String, sparse: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

// Indexes for fast lookups
cartSchema.index({ guestSessionId: 1 }, { sparse: true });
cartSchema.index({ userId: 1 }, { sparse: true });
// TTL index: auto-delete guest carts older than 7 days
cartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800, partialFilterExpression: { guestSessionId: { $exists: true } } });

export const Cart = mongoose.model<ICartDoc>('Cart', cartSchema);
