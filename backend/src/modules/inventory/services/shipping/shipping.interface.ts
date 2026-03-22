import { IOrderDoc } from '../../models/order.model';

export interface ShipmentResult {
  providerOrderId: number;
  shipmentId: number;
}

export interface AWBResult {
  awbCode: string;
  courierName: string;
  courierId: number;
}

export interface TrackingResult {
  currentStatus: string;
  trackingUrl: string | null;
  estimatedDelivery: Date | null;
  activities: { date: string; status: string; location: string }[];
}

export interface ShippingRate {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDays: number;
  cod: boolean;
}

export interface PickupResult {
  pickupScheduledDate: string;
}

export interface ShippingProvider {
  readonly name: string;

  createOrder(order: IOrderDoc, pickupLocation: string): Promise<ShipmentResult>;
  generateAWB(shipmentId: number, courierId?: number): Promise<AWBResult>;
  trackShipment(shipmentId: number): Promise<TrackingResult>;
  cancelOrder(providerOrderId: number): Promise<void>;
  getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
  ): Promise<ShippingRate[]>;
  generateLabel(shipmentId: number): Promise<string>;
  schedulePickup(shipmentId: number): Promise<PickupResult>;
}
