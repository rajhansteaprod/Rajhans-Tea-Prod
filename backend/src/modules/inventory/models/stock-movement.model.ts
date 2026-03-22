import mongoose, { Document, Schema, Types } from 'mongoose';

export type StockMovementType =
  | 'purchase_deduction'
  | 'manual_adjustment'
  | 'return_restock'
  | 'initial_stock'
  | 'damage_writeoff';

export interface IStockMovementDoc extends Document {
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  type: StockMovementType;
  qty: number;
  previousStock: number;
  newStock: number;
  referenceId: string | null;
  referenceType: string | null;
  note: string | null;
  performedBy: Types.ObjectId | null;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovementDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    type: {
      type: String,
      enum: [
        'purchase_deduction',
        'manual_adjustment',
        'return_restock',
        'initial_stock',
        'damage_writeoff',
      ],
      required: true,
    },
    qty: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    referenceId: { type: String, default: null },
    referenceType: { type: String, default: null },
    note: { type: String, default: null },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ warehouseId: 1 });
stockMovementSchema.index({ referenceId: 1 });

export const StockMovement = mongoose.model<IStockMovementDoc>(
  'StockMovement',
  stockMovementSchema,
);
