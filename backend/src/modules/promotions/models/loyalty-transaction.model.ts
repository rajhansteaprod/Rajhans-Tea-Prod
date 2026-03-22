import mongoose, { Document, Schema, Types } from 'mongoose';

export type LoyaltyTxnType = 'earn' | 'redeem' | 'expire' | 'admin_adjust';
export type LoyaltyTxnSource = 'purchase' | 'referral' | 'admin' | 'redemption' | 'expiry';

export interface ILoyaltyTransactionDoc extends Document {
  userId: Types.ObjectId;
  type: LoyaltyTxnType;
  points: number;
  balanceAfter: number;
  source: LoyaltyTxnSource;
  referenceId: string | null;
  description: string;
  expiresAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
}

const loyaltyTransactionSchema = new Schema<ILoyaltyTransactionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['earn', 'redeem', 'expire', 'admin_adjust'], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    source: {
      type: String,
      enum: ['purchase', 'referral', 'admin', 'redemption', 'expiry'],
      required: true,
    },
    referenceId: { type: String, default: null },
    description: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

loyaltyTransactionSchema.index({ userId: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ type: 1, expiresAt: 1 });
loyaltyTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });

export const LoyaltyTransaction = mongoose.model<ILoyaltyTransactionDoc>(
  'LoyaltyTransaction',
  loyaltyTransactionSchema,
);
