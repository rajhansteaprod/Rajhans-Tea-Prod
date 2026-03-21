import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWishlistDoc extends Document {
  sessionId: string;
  userId: Types.ObjectId | null;
  productIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlistDoc>(
  {
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true },
);

wishlistSchema.index({ sessionId: 1 }, { unique: true });
wishlistSchema.index({ userId: 1 }, { sparse: true });

export const Wishlist = mongoose.model<IWishlistDoc>('Wishlist', wishlistSchema);
