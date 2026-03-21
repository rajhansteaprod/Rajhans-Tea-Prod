import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReferralStatus = 'pending' | 'completed' | 'expired';

export interface IReferralDoc extends Document {
  referrerUserId: Types.ObjectId;
  referralCode: string;
  refereeUserId: Types.ObjectId;
  status: ReferralStatus;
  referrerReward: {
    type: 'loyalty_points' | 'wallet_credit';
    amount: number;
    credited: boolean;
  };
  refereeReward: {
    type: 'coupon';
    couponId: Types.ObjectId | null;
    used: boolean;
  };
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferralDoc>(
  {
    referrerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referralCode: { type: String, required: true },
    refereeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'completed', 'expired'], default: 'pending' },
    referrerReward: {
      type: { type: String, enum: ['loyalty_points', 'wallet_credit'], default: 'loyalty_points' },
      amount: { type: Number, default: 0 },
      credited: { type: Boolean, default: false },
    },
    refereeReward: {
      type: { type: String, default: 'coupon' },
      couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', default: null },
      used: { type: Boolean, default: false },
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

referralSchema.index({ referralCode: 1 });
referralSchema.index({ referrerUserId: 1 });
referralSchema.index({ refereeUserId: 1 }, { unique: true });

export const Referral = mongoose.model<IReferralDoc>('Referral', referralSchema);
