import mongoose, { Document, Schema } from 'mongoose';

export interface IWarehouseAddress {
  street: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
}

export interface IWarehouseDoc extends Document {
  name: string;
  address: IWarehouseAddress;
  isDefault: boolean;
  isActive: boolean;
  shiprocketPickupLocationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouseDoc>(
  {
    name: { type: String, required: true, trim: true },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
    },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    shiprocketPickupLocationId: { type: String, default: null },
  },
  { timestamps: true },
);

warehouseSchema.index({ isDefault: 1 });
warehouseSchema.index({ isActive: 1 });

export const Warehouse = mongoose.model<IWarehouseDoc>('Warehouse', warehouseSchema);
