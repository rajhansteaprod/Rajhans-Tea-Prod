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
  street: string;
  city: string;
  state: string;
  pincode: string;
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
  refundedAmount: number;
  refunds: IRefund[];
  idempotencyKey: string;
  invoiceId: Types.ObjectId | null;
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
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    walletDeductPaise: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    refunds: [refundSchema],
    idempotencyKey: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
paymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ sessionId: 1, status: 1 });
paymentSchema.index({ userId: 1, createdAt: -1 });

export const Payment = mongoose.model<IPaymentDoc>('Payment', paymentSchema);
