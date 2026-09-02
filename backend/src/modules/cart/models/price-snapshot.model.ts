import mongoose, { Document, Schema, Types } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriceSnapshotStatus = 'active' | 'used' | 'expired';

export interface IPriceSnapshotItem {
  productId: string;
  variantId: string | null;
  variantName: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: number; // finalPrice per unit (after discount + tax)
  totalPrice: number; // unitPrice * qty
  appliedRule: string | null;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
}

export interface IPriceSnapshotDoc extends Document {
  sessionId: string;
  items: IPriceSnapshotItem[];
  subtotal: number; // sum of (priceAfterDiscount * qty)
  totalDiscount: number; // sum of rule discounts (excludes coupon)
  totalTax: number; // sum of (taxAmount * qty)
  itemsTotal: number; // sum of line totals (before coupon)
  couponCode: string | null;
  couponId: Types.ObjectId | null;
  couponType: 'promo_code' | 'offer' | null;
  couponDiscount: number; // order-level coupon discount, applied once
  shippingCost: number;
  total: number; // THE frozen amount — the only number charged
  currency: string;
  pricingVersion: number;
  status: PriceSnapshotStatus;
  expiresAt: Date; // TTL field — MongoDB auto-deletes at this time
  usedByPaymentId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const priceSnapshotItemSchema = new Schema<IPriceSnapshotItem>(
  {
    productId: { type: String, required: true },
    variantId: { type: String, default: null },
    variantName: { type: String, default: null },
    sku: { type: String, default: null },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    appliedRule: { type: String, default: null },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
  },
  { _id: false }, // no separate _id per item — matches invoice.model.ts pattern
);

const priceSnapshotSchema = new Schema<IPriceSnapshotDoc>(
  {
    sessionId: { type: String, required: true },
    items: [priceSnapshotItemSchema],
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    itemsTotal: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    couponId: { type: Schema.Types.ObjectId, ref: 'Discount', default: null },
    couponType: { type: String, enum: ['promo_code', 'offer', null], default: null },
    couponDiscount: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    pricingVersion: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['active', 'used', 'expired'],
      default: 'active',
    },
    expiresAt: { type: Date, required: true },
    usedByPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// TTL index — MongoDB auto-deletes document when expiresAt is reached
// expireAfterSeconds: 0 means "delete exactly at expiresAt" (same as StockReservation)
priceSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index — used by freezePrice() to find and invalidate previous active snapshot
priceSnapshotSchema.index({ sessionId: 1, status: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const PriceSnapshot = mongoose.model<IPriceSnapshotDoc>('PriceSnapshot', priceSnapshotSchema);
