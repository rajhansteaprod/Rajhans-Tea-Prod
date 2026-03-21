import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReviewVoteDoc extends Document {
  userId: Types.ObjectId;
  reviewId: Types.ObjectId;
  createdAt: Date;
}

const reviewVoteSchema = new Schema<IReviewVoteDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true },
  },
  { timestamps: true },
);

reviewVoteSchema.index({ userId: 1, reviewId: 1 }, { unique: true });

export const ReviewVote = mongoose.model<IReviewVoteDoc>('ReviewVote', reviewVoteSchema);
