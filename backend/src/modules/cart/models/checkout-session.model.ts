import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICheckoutSessionDoc extends Document {
  sessionId: string;
  userId: Types.ObjectId | null;
  startedAt: Date;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

const checkoutSessionSchema = new Schema<ICheckoutSessionDoc>(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: () => new Date() },
    status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
  },
  { timestamps: true },
);

checkoutSessionSchema.index({ sessionId: 1 });
checkoutSessionSchema.index({ userId: 1 }, { sparse: true });
checkoutSessionSchema.index({ startedAt: 1 });
checkoutSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

export const CheckoutSession = mongoose.model<ICheckoutSessionDoc>('CheckoutSession', checkoutSessionSchema);
