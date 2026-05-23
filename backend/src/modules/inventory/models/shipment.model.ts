import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IShipmentEvent {
  status: string;
  timestamp: Date;
  location?: string;
  note?: string;
}

export type ShipmentStatus =
  | 'pending'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed';

export interface IShipmentDoc extends Document {
  orderId: Types.ObjectId;
  sessionId: string;

  // Shiprocket
  shiprocketOrderId: number | null;
  shiprocketShipmentId: number | null;
  awbCode: string | null;
  courierName: string | null;
  courierId: number | null;
  trackingUrl: string | null;

  // Documents
  label: string | null;
  invoiceUrl: string | null;

  // Scheduling
  pickupScheduledDate: Date | null;
  estimatedDeliveryDate: Date | null;

  // Status
  status: ShipmentStatus;
  lastStatusUpdate: Date | null;
  lastStatusEvent: string | null;

  // Dimensions
  weight: number;
  length: number;
  width: number;
  height: number;

  // Events
  events: IShipmentEvent[];

  createdAt: Date;
  updatedAt: Date;
}

const shipmentEventSchema = new Schema<IShipmentEvent>(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date() },
    location: { type: String, default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const shipmentSchema = new Schema<IShipmentDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    sessionId: { type: String, required: true },

    shiprocketOrderId: { type: Number, default: null },
    shiprocketShipmentId: { type: Number, default: null },
    awbCode: { type: String, default: null, sparse: true },
    courierName: { type: String, default: null },
    courierId: { type: Number, default: null },
    trackingUrl: { type: String, default: null },

    label: { type: String, default: null },
    invoiceUrl: { type: String, default: null },

    pickupScheduledDate: { type: Date, default: null },
    estimatedDeliveryDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed'],
      default: 'pending',
    },
    lastStatusUpdate: { type: Date, default: null },
    lastStatusEvent: { type: String, default: null },

    weight: { type: Number, default: 0.5 },
    length: { type: Number, default: 10 },
    width: { type: Number, default: 10 },
    height: { type: Number, default: 10 },

    events: [shipmentEventSchema],
  },
  { timestamps: true },
);

// Indexes
shipmentSchema.index({ orderId: 1 });
shipmentSchema.index({ sessionId: 1 });
shipmentSchema.index({ awbCode: 1 }, { sparse: true });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ 'shiprocketShipmentId': 1 }, { sparse: true });

export const Shipment = mongoose.model<IShipmentDoc>('Shipment', shipmentSchema);
