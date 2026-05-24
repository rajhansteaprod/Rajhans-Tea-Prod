import { IOrderDoc } from '../../models/order.model';

export interface ShipmentResult {
  providerOrderId: number;
  shipmentId: number;
}

export interface ShippingRate {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDays: number;
  cod: boolean;
}

export interface ShippingProvider {
  readonly name: string;

  createOrder(order: IOrderDoc, pickupLocation: string): Promise<ShipmentResult>;
  trackShipment(shipmentId: number): Promise<any>;
  cancelOrder(providerOrderId: number): Promise<void>;
  getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
  ): Promise<ShippingRate[]>;
}
