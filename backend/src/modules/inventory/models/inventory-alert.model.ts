import mongoose, { Document, Schema, Types } from 'mongoose';

export type AlertType = 'low_stock' | 'out_of_stock';

export interface IInventoryAlertDoc extends Document {
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  type: AlertType;
  currentStock: number;
  threshold: number;
  isResolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
}

const inventoryAlertSchema = new Schema<IInventoryAlertDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    type: { type: String, enum: ['low_stock', 'out_of_stock'], required: true },
    currentStock: { type: Number, required: true },
    threshold: { type: Number, default: 5 },
    isResolved: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

inventoryAlertSchema.index({ productId: 1, isResolved: 1 });
inventoryAlertSchema.index({ isResolved: 1, createdAt: -1 });

export const InventoryAlert = mongoose.model<IInventoryAlertDoc>('InventoryAlert', inventoryAlertSchema);
