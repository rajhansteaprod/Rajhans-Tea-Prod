import mongoose, { Document, Schema, Types } from 'mongoose';

export type WalletTxnType = 'credit' | 'debit';
export type WalletTxnSource = 'refund' | 'cashback' | 'admin_credit' | 'purchase' | 'admin_debit';

export interface IWalletTransactionDoc extends Document {
  walletId: Types.ObjectId;
  userId: Types.ObjectId;
  type: WalletTxnType;
  amount: number;
  balanceAfter: number;
  source: WalletTxnSource;
  referenceId: string | null;
  description: string;
  idempotencyKey: string;
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransactionDoc>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    balanceAfter: { type: Number, required: true },
    source: {
      type: String,
      enum: ['refund', 'cashback', 'admin_credit', 'purchase', 'admin_debit'],
      required: true,
    },
    referenceId: { type: String, default: null },
    description: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });

export const WalletTransaction = mongoose.model<IWalletTransactionDoc>(
  'WalletTransaction',
  walletTransactionSchema,
);
