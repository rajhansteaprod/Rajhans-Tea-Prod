import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICouponUsageDoc extends Document {
  couponId: Types.ObjectId;
  userId: Types.ObjectId | null;
  sessionId: string;
  paymentId: Types.ObjectId;
  discountApplied: number;
  createdAt: Date;
}

const couponUsageSchema = new Schema<ICouponUsageDoc>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    discountApplied: { type: Number, required: true },
  },
  { timestamps: true },
);

couponUsageSchema.index({ couponId: 1, userId: 1 });
couponUsageSchema.index({ paymentId: 1 });

export const CouponUsage = mongoose.model<ICouponUsageDoc>('CouponUsage', couponUsageSchema);
