import mongoose, { Document, Schema } from 'mongoose';

export interface ILoyaltySettingsDoc extends Document {
  earnRate: number;
  redeemRate: number;
  expiryDays: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
  isActive: boolean;
}

const loyaltySettingsSchema = new Schema<ILoyaltySettingsDoc>(
  {
    earnRate: { type: Number, default: 1 }, // points per ₹100 spent
    redeemRate: { type: Number, default: 10 }, // ₹ per 100 points
    expiryDays: { type: Number, default: 180 }, // 6 months
    minRedeemPoints: { type: Number, default: 100 },
    maxRedeemPercent: { type: Number, default: 50 }, // max 50% of order
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const LoyaltySettings = mongoose.model<ILoyaltySettingsDoc>(
  'LoyaltySettings',
  loyaltySettingsSchema,
);
