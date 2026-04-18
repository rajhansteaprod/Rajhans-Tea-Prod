import { Schema, model, Document, Types } from 'mongoose';

export interface IPromoCode extends Document {
  _id: Types.ObjectId;
  code: string;
  discountType: 'percentage' | 'fixed'; // percentage (10%) or fixed (₹100)
  discountValue: number;
  minOrderAmount: number; // minimum order value to use
  maxDiscount?: number; // max discount cap (for % discounts)
  maxUses: number; // total times code can be used
  usedCount: number;
  expiresAt: Date;
  isActive: boolean;
  applicableCategories?: Types.ObjectId[]; // optional: only for these categories
  createdAt: Date;
  updatedAt: Date;
}

const promoSchema = new Schema<IPromoCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    maxUses: { type: Number, required: true, default: 999999 },
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  },
  { timestamps: true },
);

promoSchema.index({ code: 1 });
promoSchema.index({ expiresAt: 1 });

export const PromoCode = model<IPromoCode>('PromoCode', promoSchema);
