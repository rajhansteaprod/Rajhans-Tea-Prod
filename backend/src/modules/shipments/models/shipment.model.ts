import { Schema, model, Document } from 'mongoose';

export interface IShipment extends Document {
  orderId: string;
  orderNumber: string;
  shipmentId: number;
  status: string;
  statusCode: number;
  awbCode: string | null;
  courierCompanyId: number | null;
  courierName: string | null;
  estimatedDelivery: Date | null;
  trackingActivities: Array<{
    date: string;
    status: string;
    activity: string;
    location: string;
  }>;
  onboardingCompletedNow: number;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
    },
    shipmentId: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    awbCode: {
      type: String,
      default: null,
    },
    courierCompanyId: {
      type: Number,
      default: null,
    },
    courierName: {
      type: String,
      default: null,
    },
    estimatedDelivery: {
      type: Date,
      default: null,
    },
    trackingActivities: [
      {
        date: String,
        status: String,
        activity: String,
        location: String,
      },
    ],
    onboardingCompletedNow: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'shipments',
  }
);

export const Shipment = model<IShipment>('Shipment', ShipmentSchema);
