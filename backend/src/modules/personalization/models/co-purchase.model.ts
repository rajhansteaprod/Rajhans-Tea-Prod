import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICoPurchaseDoc extends Document {
  productA: Types.ObjectId;
  productB: Types.ObjectId;
  count: number;
  lastUpdated: Date;
}

const coPurchaseSchema = new Schema<ICoPurchaseDoc>({
  productA: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productB: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  count: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: () => new Date() },
});

coPurchaseSchema.index({ productA: 1, count: -1 });
coPurchaseSchema.index({ productA: 1, productB: 1 }, { unique: true });

export const CoPurchase = mongoose.model<ICoPurchaseDoc>('CoPurchase', coPurchaseSchema);
