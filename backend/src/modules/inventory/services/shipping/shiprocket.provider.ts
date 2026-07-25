import { config } from '../../../../config';
import { logger } from '../../../../utils/logger';
import { shipmentLogger } from '../../../../utils/shipment-logger';
import { IOrderDoc } from '../../models/order.model';
import { ShiprocketToken } from '../../../shipments/models/shiprocket-token.model';
import {
  ShippingProvider,
  ShipmentResult,
  ShippingRate,
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
    logger.info('Shiprocket token expired or not found, re-authenticating with credentials email and password as'+ config.shipping.shiprocket.email+" "+config.shipping.shiprocket.password );
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.shipping.shiprocket.email,
        password: config.shipping.shiprocket.password,
      }),
    });

    const data = (await res.json()) as Record<string, any>;
    if(!data.token){
      throw new Error(`Shiprocket authentication failed: ${data.message || 'No token received'}`);
    }
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
    shipmentLogger.info({}, `📡 Shiprocket API request: ${method} ${path} Body: ${JSON.stringify(body, null, 2)} Token:${token}`);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: Record<string, any> = {};
    try {
      data = (await res.json()) as Record<string, any>;
    } catch {
      data = {};
    }
    shipmentLogger.info({ status: res.status, data }, 'Response recieved by shiprocket');

    // Check HTTP status
    if (!res.ok) {
      shipmentLogger.error({
        status: res.status,
        path,
        requestBody: body,
        fullResponse: data,
        responseKeys: Object.keys(data),
        errors: data.errors,
        message: data.message,
        statusCode: data.status_code,
        allKeys: Object.keys(data).map(k => `${k}: ${JSON.stringify(data[k])}`),
        token: token ? '***cached***' : 'none',
      }, '❌ Shiprocket API error (HTTP) - DETAILED');
      logger.error({ status: res.status, path, body: data }, 'Shiprocket API error');
      throw new Error(data.message || `Shiprocket API error: ${res.status}`);
    }

    // Check Shiprocket's business logic status code
    // Success codes: 1 (orders), 200 (other endpoints)
    // Error codes: 350+ (wallet, validation, etc)
    const successCodes = [1, 200];
    if (data.status_code && !successCodes.includes(data.status_code)) {
      shipmentLogger.error({
        status: res.status,
        shiprocketStatusCode: data.status_code,
        path,
        requestBody: body,
        fullResponse: data,
        message: data.message,
        awbError: data.response?.data?.awb_assign_error,
      }, '❌ Shiprocket business error');
      throw new Error(data.message || `Shiprocket error: ${data.status_code}`);
    }

    return data;
  }

  // ─── ShippingProvider implementation ──────────────────────────────────────

  async createOrder(order: IOrderDoc, pickupLocation: string): Promise<ShipmentResult> {
    const addr = order.shippingAddress;
    const user = order.userId as any;

    // Sanitize names: only allow alphabets and spaces
    const sanitizeName = (name: string) => name.replace(/[^a-zA-Z\s]/g, '').trim();
    const nameParts = addr.name.split(' ').filter(Boolean);
    const firstName = sanitizeName(nameParts[0] || '');
    const lastName = sanitizeName(nameParts.slice(1).join(' ') || '');

    // Use warehouse as default pickup location (most common active warehouse)
    const activePickupLocation = pickupLocation || 'warehouse';

    const data = await this.request('POST', '/orders/create/adhoc', {

      // channel id not required for adhoc orders
      // channel_id: config.shipping.shiprocket.channelId,
      order_id: order.orderNumber,
      order_date: new Date(order.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      pickup_location: activePickupLocation,
      billing_customer_name: firstName || 'Customer',
      billing_last_name: lastName || '-',
      billing_address: addr.address,
      billing_city: addr.city,
      billing_pincode: addr.pinCode,
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
      // Cart-level discount (coupon/offer) applies to the whole order, not per
      // product — so the amount the customer actually paid lives in order.total
      // (items − coupon + shipping, tax included), NOT order.subtotal (pre-tax,
      // pre-coupon). Send order.total so Shiprocket reflects the paid amount.
      sub_total: order.total,
      length: 23,
      breadth:8,
      height: 26,
      weight: 0.5,
    });

    // Check if response contains error about pickup location
    if (data.message?.includes('Wrong Pickup location') || data.message?.includes('pickup location')) {
      const availableLocations = data.data?.data || [];
      shipmentLogger.error({
        orderId: order._id,
        orderNumber: order.orderNumber,
        usedLocation: activePickupLocation,
        availableLocations: availableLocations.map((loc: any) => ({
          id: loc.id,
          pickup_location: loc.pickup_location,
          address: loc.address,
          city: loc.city,
          status: loc.status,
        })),
        errorMessage: data.message,
      }, '❌ Shiprocket pickup location error - Available locations listed above');
      throw new Error(`Invalid pickup location "${activePickupLocation}". Available locations: ${availableLocations.map((l: any) => `${l.pickup_location} (${l.address})`).join(', ')}`);
    }

    shipmentLogger.debug({
      orderId: order._id,
      orderNumber: order.orderNumber,
      responseKeys: Object.keys(data),
      order_id: data.order_id,
      shipment_id: data.shipment_id,
      response: JSON.stringify(data),
    }, '📦 Shiprocket createOrder response details');

    return {
      providerOrderId: data.order_id,
      shipmentId: data.shipment_id,
    };
  }


  async trackShipment(shipmentId: number): Promise<any> {
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

  async trackByOrderId(orderIdOrNumber: string): Promise<any> {
    const channelId = config.shipping.shiprocket.channelId;
    // Can accept either order ID (numeric shiprocket ID) or order number (RJT_DQ_436916)
    const path = `/courier/track?order_id=${orderIdOrNumber}&channel_id=${channelId}`;
    let data: any = {};

    try {
      shipmentLogger.debug({
        orderIdOrNumber,
        path,
      }, '📡 Requesting tracking from Shiprocket API');

      data = await this.request('GET', path);
    } catch (error) {
      shipmentLogger.error({
        orderIdOrNumber,
        path,
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Failed to fetch tracking from Shiprocket');
      throw error;
    }

    // /courier/track returns a bare array ([{ tracking_data }]), not { data: [...] }
    const records = Array.isArray(data) ? data : data?.data;

    if (!records || records.length === 0) {
      shipmentLogger.warn({
        orderIdOrNumber,
        responseStatus: data?.status_code,
        message: data?.message,
        dataField: data?.data,
      }, '⚠️ No tracking data found for order');
      return null;
    }

    const trackingData = records[0]?.tracking_data;
    if (!trackingData || !trackingData.shipment_track || trackingData.shipment_track.length === 0) {
      shipmentLogger.warn({
        orderIdOrNumber,
        record: records[0],
      }, '⚠️ No tracking data found for order');
      return null;
    }

    const tracking = trackingData.shipment_track[0]; // First shipment for this order
    const all = trackingData.shipment_track_activities;
    shipmentLogger.info({
      orderIdOrNumber,
      status: tracking?.current_status,
      awb: tracking?.awb_code,
      courier: tracking?.courier_name,
    }, '✅ Tracking data retrieved from Shiprocket');

    shipmentLogger.debug({
      fullTrackingData: all,
      allActivities: all.length||0
    }, '🔍 Full Shiprocket tracking response');

    return {
      currentStatus: tracking?.current_status || 'unknown',
      trackingUrl: trackingData?.track_url || null,
      estimatedDelivery: trackingData?.etd ? new Date(trackingData.etd) : null,
      awbCode: tracking?.awb_code || null,
      courierName: tracking?.courier_name || null,
      activities: (all || []).map((a: any) => ({
        date: a.date,
        status: a.activity,
        location: a.location || 'N/A',
        remark: a.remark || '',
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

}
