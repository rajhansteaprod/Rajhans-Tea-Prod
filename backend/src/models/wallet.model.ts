import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWalletDoc extends Document {
  userId: Types.ObjectId;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWalletDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

walletSchema.index({ userId: 1 }, { unique: true });

export const Wallet = mongoose.model<IWalletDoc>('Wallet', walletSchema);
