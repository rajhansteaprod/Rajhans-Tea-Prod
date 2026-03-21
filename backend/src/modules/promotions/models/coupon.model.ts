import mongoose, { Document, Schema, Types } from 'mongoose';

export type CouponDiscountType = 'percentage' | 'fixed';
export type CouponScope = 'all' | 'products' | 'categories';

export interface ICouponDoc extends Document {
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  scope: CouponScope;
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  stackable: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICouponDoc>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountCap: { type: Number, default: null },
    usageLimitTotal: { type: Number, default: null },
    usageLimitPerUser: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    scope: { type: String, enum: ['all', 'products', 'categories'], default: 'all' },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    stackable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

export const Coupon = mongoose.model<ICouponDoc>('Coupon', couponSchema);
