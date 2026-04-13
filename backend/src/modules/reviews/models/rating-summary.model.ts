import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRatingSummaryDoc extends Document {
  productId: Types.ObjectId;
  averageRating: number;
  totalReviews: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  ratingOneLiner?: string; // Admin-editable: "Cleanser Effectiveness, Face Wash Effectiveness, Product Results"
  updatedAt: Date;
}

const ratingSummarySchema = new Schema<IRatingSummaryDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    distribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
    ratingOneLiner: { type: String, trim: true, maxlength: 300, default: undefined },
  },
  { timestamps: true },
);

ratingSummarySchema.index({ productId: 1 }, { unique: true });

export const RatingSummary = mongoose.model<IRatingSummaryDoc>(
  'RatingSummary',
  ratingSummarySchema,
);
