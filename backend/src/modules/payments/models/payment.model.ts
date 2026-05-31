import mongoose, { Document, Schema, Types } from 'mongoose';

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export interface ICheckoutItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ICheckoutSnapshot {
  items: ICheckoutItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
}

export interface IShippingAddress {
  name: string;
  phone: string;
  address: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
}

export interface IRefund {
  razorpayRefundId: string;
  amount: number;
  reason: string;
  createdAt: Date;
}

export interface IPaymentDoc extends Document {
  sessionId: string;
  userId: Types.ObjectId | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  checkoutSnapshot: ICheckoutSnapshot;
  shippingAddress: IShippingAddress;
  walletDeductPaise: number;
  loyaltyPointsUsed: number;
  loyaltyDiscountPaise: number;
  promoCode?: string;
  promoCodeId?: Types.ObjectId;
  promoDiscountPaise: number;
  refundedAmount: number;
  refunds: IRefund[];
  idempotencyKey: string;
  invoiceId: Types.ObjectId | null;
  priceSnapshotId: Types.ObjectId | null;
  // Pessimistic locking for concurrent verification
  lockedAt: Date | null;
  lockedUntil: Date | null;
  verificationAttempts: number;
  lastVerificationError: string | null;
  // Compensation tracking
  walletDebitAttempts: number;
  walletDebitFailed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const checkoutItemSchema = new Schema<ICheckoutItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
  },
  { _id: false },
);

const refundSchema = new Schema<IRefund>(
  {
    razorpayRefundId: { type: String, required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const paymentSchema = new Schema<IPaymentDoc>(
  {
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
    },
    checkoutSnapshot: {
      items: [checkoutItemSchema],
      subtotal: { type: Number, required: true },
      totalDiscount: { type: Number, default: 0 },
      totalTax: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      landmark: { type: String, default: null },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
    },
    walletDeductPaise: { type: Number, default: 0 },
    loyaltyPointsUsed: { type: Number, default: 0 },
    loyaltyDiscountPaise: { type: Number, default: 0 },
    promoCode: { type: String, default: null },
    promoCodeId: { type: Schema.Types.ObjectId, ref: 'PromoCode', default: null },
    promoDiscountPaise: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    refunds: [refundSchema],
    idempotencyKey: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    priceSnapshotId: { type: Schema.Types.ObjectId, ref: 'PriceSnapshot', default: null },
    // Pessimistic locking (prevents concurrent verification)
    lockedAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    verificationAttempts: { type: Number, default: 0 },
    lastVerificationError: { type: String, default: null },
    // Compensation tracking
    walletDebitAttempts: { type: Number, default: 0 },
    walletDebitFailed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

paymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
paymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ sessionId: 1, status: 1 });
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ priceSnapshotId: 1 });

export const Payment = mongoose.model<IPaymentDoc>('Payment', paymentSchema);
