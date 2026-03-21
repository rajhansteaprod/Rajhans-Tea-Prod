import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface IAdminReply {
  body: string;
  repliedBy: Types.ObjectId;
  repliedAt: Date;
}

export interface IReviewDoc extends Document {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
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
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
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
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ reportCount: -1 });

export const Review = mongoose.model<IReviewDoc>('Review', reviewSchema);
