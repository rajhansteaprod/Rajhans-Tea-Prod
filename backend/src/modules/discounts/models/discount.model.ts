import mongoose, { Document, Schema, Types } from 'mongoose';

export type DiscountType = 'promo_code' | 'offer';
export type DiscountValueType = 'percentage' | 'fixed';

export interface IDiscountDoc extends Document {
  code?: string;
  title: string;
  type: DiscountType;
  description?: string;
  valueType: DiscountValueType;
  value: number;
  maxCap?: number;
  minOrderAmount: number;
  usageLimit?: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const discountSchema = new Schema<IDiscountDoc>(
  {
    code: { type: String, uppercase: true, trim: true, sparse: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['promo_code', 'offer'], required: true, index: true },
    description: { type: String, default: '' },
    valueType: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxCap: { type: Number, default: null },
    minOrderAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true, index: true },
    validUntil: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

discountSchema.index({ code: 1, type: 1 });
discountSchema.index({ type: 1, isActive: 1, validFrom: 1, validUntil: 1 });

export const Discount = mongoose.models.Discount || mongoose.model<IDiscountDoc>('Discount', discountSchema);
