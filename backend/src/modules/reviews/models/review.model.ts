import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface IAdminReply {
  body: string;
  repliedBy: Types.ObjectId;
  repliedAt: Date;
}

export interface IReviewDoc extends Document {
  /** Optional: absent for anonymous, order-token based customer reviews */
  userId?: Types.ObjectId;
  productId: Types.ObjectId;
  /** Set for anonymous order-token reviews so each order reviews a product once */
  orderId?: Types.ObjectId;
  /** Human-readable order reference, kept for admin traceability */
  orderNumber?: string;
  /** Display name for admin-entered / anonymous reviews (no real user account behind them) */
  reviewerName?: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  rejectionReason: string | null;
  helpfulVotes: number;
  reportCount: number;
  adminReply: IAdminReply | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReviewDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    orderNumber: { type: String, default: null, trim: true },
    reviewerName: { type: String, trim: true, maxlength: 100 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    // title/body are optional at the model level so admin-entered reviews
    // (name + rating only) can exist; the customer submission API still
    // requires both via submitReviewSchema (zod).
    title: { type: String, default: '', trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 5000 },
    images: [{ type: String }],
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String, default: null },
    helpfulVotes: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    adminReply: {
      type: {
        body: { type: String },
        repliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        repliedAt: { type: Date },
      },
      default: null,
    },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
// One review per real user per product — only applies to docs that actually
// carry a userId (authenticated + admin-entered reviews). Anonymous order-token
// reviews have no userId, so this partial index skips them.
reviewSchema.index(
  { userId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);
// One review per product per order for anonymous order-token reviews.
reviewSchema.index(
  { orderId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } },
);
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ reportCount: -1 });

export const Review = mongoose.model<IReviewDoc>('Review', reviewSchema);
