import mongoose, { Document, Schema } from 'mongoose';

export interface IReferralSettingsDoc extends Document {
  isActive: boolean;
  referrerRewardType: 'loyalty_points' | 'wallet_credit';
  referrerRewardAmount: number;
  refereeCouponValue: number;
  refereeCouponMinOrder: number;
  codePrefix: string;
}

const referralSettingsSchema = new Schema<IReferralSettingsDoc>(
  {
    isActive: { type: Boolean, default: true },
    referrerRewardType: {
      type: String,
      enum: ['loyalty_points', 'wallet_credit'],
      default: 'loyalty_points',
    },
    referrerRewardAmount: { type: Number, default: 500 },
    refereeCouponValue: { type: Number, default: 100 },
    refereeCouponMinOrder: { type: Number, default: 500 },
    codePrefix: { type: String, default: 'REF' },
  },
  { timestamps: true },
);

export const ReferralSettings = mongoose.model<IReferralSettingsDoc>(
  'ReferralSettings',
  referralSettingsSchema,
);
