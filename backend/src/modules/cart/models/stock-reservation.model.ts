import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IStockReservationDoc extends Document {
  productId: Types.ObjectId;
  variantId: Types.ObjectId | null; // null → reservation against product-level stock
  qty: number;
  sessionId: string;
  expiresAt: Date;
}

const stockReservationSchema = new Schema<IStockReservationDoc>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
  qty: { type: Number, required: true, min: 1 },
  sessionId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
stockReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
stockReservationSchema.index({ sessionId: 1 });
// One reservation per session + product + variant (upserted atomically)
stockReservationSchema.index({ sessionId: 1, productId: 1, variantId: 1 }, { unique: true });
stockReservationSchema.index({ productId: 1, variantId: 1, expiresAt: 1 });

export const StockReservation = mongoose.model<IStockReservationDoc>(
  'StockReservation',
  stockReservationSchema,
);
