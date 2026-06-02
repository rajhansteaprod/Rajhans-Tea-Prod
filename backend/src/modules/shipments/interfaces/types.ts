export interface AuthenticateRequest {
  email: string;
  password: string;
}

export interface AuthenticateResponse {
  token: string;
  expiresAt: Date;
}

export interface OrderItem {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: string;
  tax?: string;
  hsn?: number;
}

export interface CreateShipmentRequest {
  orderId: string;
  orderNumber: string;
  order_date: string;
  pickup_location: string;
  comment?: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: number;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: number;
  shipping_is_billing: boolean;
  shipping_customer_name?: string;
  shipping_last_name?: string;
  shipping_address?: string;
  shipping_address_2?: string;
  shipping_city?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  shipping_state?: string;
  shipping_email?: string;
  shipping_phone?: string;
  order_items: OrderItem[];
  payment_method: string;
  shipping_charges: number;
  giftwrap_charges: number;
  transaction_charges: number;
  total_discount: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface CreateShipmentResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  onboarding_completed_now: number;
  awb_code: string | null;
  courier_company_id: number | null;
  courier_name: string | null;
}

export interface AssignCourierRequest {
  shipmentId: number;
  courierId?: number;
  status?: string;
}

export interface AssignCourierResponse {
  awb_assign_status: number;
  response: {
    data: {
      courier_company_id: number;
      awb_code: string;
      courier_name: string;
      shipment_id: number;
      pickup_scheduled_date: string;
    };
  };
}

export interface SchedulePickupRequest {
  shipmentId: number;
  pickupDate?: string;
  pickupSlot?: string;
}

export interface SchedulePickupResponse {
  status_code: number;
  message: string;
  data?: any;
}

export interface TrackShipmentRequest {
  shipmentId: number;
  orderId?: string;
}

export interface TrackingData {
  awb: string;
  courier_name: string;
  current_status: string;
  current_timestamp: string;
  scans: Array<{
    date: string;
    status: string;
    activity: string;
    location: string;
  }>;
}

export interface CancelShipmentRequest {
  shipmentId: number;
}

export interface CancelShipmentResponse {
  status_code: number;
  message: string;
}