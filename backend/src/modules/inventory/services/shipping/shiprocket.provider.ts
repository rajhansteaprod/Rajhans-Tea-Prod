import { config } from '../../../../config';
import { logger } from '../../../../utils/logger';
import { IOrderDoc } from '../../models/order.model';
import { ShiprocketToken } from '../../../shipments/models/shiprocket-token.model';
import {
  ShippingProvider,
  ShipmentResult,
  AWBResult,
  TrackingResult,
  ShippingRate,
  PickupResult,
} from './shipping.interface';

export class ShiprocketProvider implements ShippingProvider {
  readonly name = 'shiprocket';

  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly baseUrl = config.shipping.shiprocket.baseUrl;

  // ─── Auth (token cached in DB, refreshed when expired) ──────────────────────────

  private async getToken(): Promise<string> {
    // Check in-memory cache first
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    // Check database for valid token
    const dbToken = await ShiprocketToken.findOne({
      expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: -1 });

    if (dbToken) {
      this.token = dbToken.token;
      this.tokenExpiry = dbToken.expiresAt;
      logger.debug('Shiprocket token loaded from database');
      return this.token;
    }

    // Token expired or not found — re-authenticate
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.shipping.shiprocket.email,
        password: config.shipping.shiprocket.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, 'Shiprocket auth failed');
      throw new Error('Shiprocket authentication failed');
    }

    const data = (await res.json()) as Record<string, any>;
    this.token = data.token;
    // Shiprocket tokens last 10 days — refresh after 9
    this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

    // Save token to database
    await ShiprocketToken.create({
      token: this.token!,
      expiresAt: this.tokenExpiry!,
    });
    logger.info('Shiprocket token saved to database');

    return this.token!;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, any>> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      logger.error({ status: res.status, path, body: data }, 'Shiprocket API error');
      throw new Error(data.message || `Shiprocket API error: ${res.status}`);
    }
    return data;
  }

  // ─── ShippingProvider implementation ──────────────────────────────────────

  async createOrder(order: IOrderDoc, pickupLocation: string): Promise<ShipmentResult> {
    const addr = order.shippingAddress;
    const user = order.userId as any;
    const data = await this.request('POST', '/orders/create', {
      order_id: order.orderNumber,
      order_date: new Date(order.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      pickup_location: pickupLocation,
      billing_customer_name: addr.name.split(' ')[0],
      billing_last_name: addr.name.split(' ').slice(1).join(' ') || '',
      billing_address: addr.street,
      billing_city: addr.city,
      billing_pincode: addr.pincode,
      billing_state: addr.state,
      billing_country: 'India',
      billing_email: user?.email || 'noreply@rajhans-tea.com',
      billing_phone: addr.phone,
      shipping_is_billing: true,
      order_items: order.items.map((item) => ({
        name: item.name,
        sku: item.productId,
        units: item.qty,
        selling_price: item.unitPrice.toString(),
      })),
      payment_method: 'Prepaid',
      sub_total: order.subtotal,
      length: 20,
      breadth: 15,
      height: 10,
      weight: 0.5,
    });

    return {
      providerOrderId: data.order_id,
      shipmentId: data.shipment_id,
    };
  }

  async generateAWB(shipmentId: number, courierId?: number): Promise<AWBResult> {
    const body: Record<string, unknown> = { shipment_id: shipmentId };
    if (courierId) body.courier_id = courierId;

    const data = await this.request('POST', '/courier/assign/awb', body);
    const awbData = data.response?.data;

    return {
      awbCode: awbData?.awb_code || '',
      courierName: awbData?.courier_name || '',
      courierId: awbData?.courier_company_id || 0,
    };
  }

  async trackShipment(shipmentId: number): Promise<TrackingResult> {
    const data = await this.request('GET', `/courier/track/shipment/${shipmentId}`);
    const tracking = data.tracking_data;

    return {
      currentStatus: tracking?.shipment_status_id?.toString() || 'unknown',
      trackingUrl: tracking?.track_url || null,
      estimatedDelivery: tracking?.etd ? new Date(tracking.etd) : null,
      activities: (tracking?.shipment_track_activities || []).map((a: any) => ({
        date: a.date,
        status: a.activity,
        location: a.location || '',
      })),
    };
  }

  async cancelOrder(providerOrderId: number): Promise<void> {
    await this.request('POST', '/orders/cancel', { ids: [providerOrderId] });
  }

  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
  ): Promise<ShippingRate[]> {
    const data = await this.request(
      'GET',
      `/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=0`,
    );

    const couriers = data.data?.available_courier_companies || [];
    return couriers.map((c: any) => ({
      courierId: c.courier_company_id,
      courierName: c.courier_name,
      rate: c.rate,
      estimatedDays: c.estimated_delivery_days,
      cod: c.cod === 1,
    }));
  }

  async generateLabel(shipmentId: number): Promise<string> {
    const data = await this.request('POST', '/courier/generate/label', {
      shipment_id: [shipmentId],
    });
    return data.label_url || '';
  }

  async schedulePickup(shipmentId: number): Promise<PickupResult> {
    const data = await this.request('POST', '/courier/generate/pickup', {
      shipment_id: [shipmentId],
    });
    return {
      pickupScheduledDate: data.response?.pickup_scheduled_date || '',
    };
  }
}
