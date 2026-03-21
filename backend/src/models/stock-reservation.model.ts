import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IStockReservationDoc extends Document {
  productId: Types.ObjectId;
  qty: number;
  sessionId: string;
  expiresAt: Date;
}

const stockReservationSchema = new Schema<IStockReservationDoc>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qty: { type: Number, required: true, min: 1 },
  sessionId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
stockReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
stockReservationSchema.index({ sessionId: 1 });
stockReservationSchema.index({ productId: 1 });

export const StockReservation = mongoose.model<IStockReservationDoc>(
  'StockReservation',
  stockReservationSchema,
);
