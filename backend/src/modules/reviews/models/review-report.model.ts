import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'other';

export interface IReviewReportDoc extends Document {
  userId: Types.ObjectId;
  reviewId: Types.ObjectId;
  reason: ReportReason;
  details: string | null;
  createdAt: Date;
}

const reviewReportSchema = new Schema<IReviewReportDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true },
    reason: { type: String, enum: ['spam', 'inappropriate', 'fake', 'other'], required: true },
    details: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

reviewReportSchema.index({ userId: 1, reviewId: 1 }, { unique: true });

export const ReviewReport = mongoose.model<IReviewReportDoc>('ReviewReport', reviewReportSchema);
