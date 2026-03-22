import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ILoyaltyAccountDoc extends Document {
  userId: Types.ObjectId;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  totalExpired: number;
  createdAt: Date;
  updatedAt: Date;
}

const loyaltyAccountSchema = new Schema<ILoyaltyAccountDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalRedeemed: { type: Number, default: 0 },
    totalExpired: { type: Number, default: 0 },
  },
  { timestamps: true },
);

loyaltyAccountSchema.index({ userId: 1 }, { unique: true });

export const LoyaltyAccount = mongoose.model<ILoyaltyAccountDoc>(
  'LoyaltyAccount',
  loyaltyAccountSchema,
);
