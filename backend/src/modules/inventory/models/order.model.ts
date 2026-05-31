import mongoose, { Document, Schema, Types } from 'mongoose';

export type OrderStatus =
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'return_requested'
  | 'returned';

export type OrderItemFulfillmentStatus =
  | 'pending'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export interface IOrderItem {
  productId: string;
  variantId?: string;
  name: string;
  image?: string;
  variant?: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  fulfillmentStatus: OrderItemFulfillmentStatus;
}

export interface IStatusHistoryEntry {
  status: OrderStatus;
  timestamp: Date;
  note: string | null;
  updatedBy: Types.ObjectId | null;
}

export interface IShiprocketInfo {
  orderId: string | null;
  shipmentId: number | null;
  awbCode: string | null;
  courierName: string | null;
  courierId: number | null;
  trackingUrl: string | null;
  label: string | null;
  estimatedDelivery: Date | null;
  pickupScheduledDate: Date | null;
}

export interface IOrderDoc extends Document {
  orderNumber: string;
  userId: Types.ObjectId;
  paymentId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  statusHistory: IStatusHistoryEntry[];
  shippingAddress: {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  warehouseId: Types.ObjectId;
  shiprocket: IShiprocketInfo;
  cancellationReason: string | null;
  returnReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: String, required: true },
    variantId: { type: String, default: null },
    name: { type: String, required: true },
    image: { type: String, default: null },
    variant: { type: String, default: null },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    fulfillmentStatus: {
      type: String,
      enum: ['pending', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'pending',
    },
  },
  { _id: false },
);

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date() },
    note: { type: String, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrderDoc>(
  {
    orderNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        'confirmed',
        'processing',
        'shipped',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'return_requested',
        'returned',
      ],
      default: 'confirmed',
    },
    statusHistory: [statusHistorySchema],
    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    shiprocket: {
      orderId: { type: String, default: null },
      shipmentId: { type: Number, default: null },
      awbCode: { type: String, default: null },
      courierName: { type: String, default: null },
      courierId: { type: Number, default: null },
      trackingUrl: { type: String, default: null },
      label: { type: String, default: null },
      estimatedDelivery: { type: Date, default: null },
      pickupScheduledDate: { type: Date, default: null },
    },
    cancellationReason: { type: String, default: null },
    returnReason: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ paymentId: 1 }, { unique: true });
orderSchema.index({ status: 1 });
orderSchema.index({ 'shiprocket.awbCode': 1 }, { sparse: true });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model<IOrderDoc>('Order', orderSchema);
