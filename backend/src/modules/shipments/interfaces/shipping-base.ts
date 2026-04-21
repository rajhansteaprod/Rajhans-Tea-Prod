import { AuthenticateResponse, CreateShipmentRequest, CreateShipmentResponse } from "./types";

export interface IShippingBase {
  authenticate(): Promise<AuthenticateResponse>;
  createShipment(shipmentData: CreateShipmentRequest, token: string): Promise<CreateShipmentResponse>;
}