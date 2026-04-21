import {
  AuthenticateResponse,
  CreateShipmentRequest,
  CreateShipmentResponse,
  AssignCourierRequest,
  AssignCourierResponse,
  SchedulePickupRequest,
  SchedulePickupResponse,
  TrackShipmentRequest,
  TrackingData,
  CancelShipmentRequest,
  CancelShipmentResponse,
} from "./types";

export interface IShippingBase {
  authenticate(): Promise<AuthenticateResponse>;
  createShipment(shipmentData: CreateShipmentRequest, token: string): Promise<CreateShipmentResponse>;
  assignCourier(request: AssignCourierRequest, token: string): Promise<AssignCourierResponse>;
  schedulePickup(request: SchedulePickupRequest, token: string): Promise<SchedulePickupResponse>;
  trackShipment(request: TrackShipmentRequest, token: string): Promise<TrackingData>;
  cancelShipment(request: CancelShipmentRequest, token: string): Promise<CancelShipmentResponse>;
}