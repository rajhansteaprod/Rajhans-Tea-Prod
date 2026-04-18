import { getShippingProvider, ShippingProvider } from '../inventory/services/shipping/shipping.factory';
import { OrderRepository } from '../inventory/repositories/order.repository';
import { IOrderDoc } from '../inventory/models/order.model';
import { BadRequestError, NotFoundError } from '../../utils/api-error';

export interface CreateShipmentRequest {
  orderId: string;
  pickupLocationId: string;
  courierId?: number;
}

export interface ShipmentResponse {
  shipmentId: string;
  awbCode: string;
  courierName: string;
  trackingUrl: string | null;
  status: string;
  estimatedDelivery: string | null;
}

export interface TrackingUpdate {
  status: string;
  location: string;
  date: string;
  activity: string;
}

export class ShiprocketServiceImpl {
  private provider: ShippingProvider;
  private orderRepo = new OrderRepository();

  constructor() {
    this.provider = getShippingProvider('shiprocket');
  }

  /**
   * Create Shiprocket shipment from order
   * Called after payment is verified
   */
  async createShipment(req: CreateShipmentRequest): Promise<ShipmentResponse> {
    const order = await this.orderRepo.findById(req.orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!order.shippingAddress) {
      throw new BadRequestError('Shipping address not found on order');
    }

    // Create shipment on Shiprocket
    const shipmentResult = await this.provider.createOrder(order, req.pickupLocationId);

    // Generate AWB (courier assignment)
    let awbResult = null;
    try {
      awbResult = await this.provider.generateAWB(shipmentResult.shipmentId, req.courierId);
    } catch (error) {
      // AWB generation might fail if courier not available
      console.warn('AWB generation failed:', error);
    }

    // Update order with Shiprocket info
    await this.orderRepo.updateShiprocketInfo(req.orderId, {
      orderId: shipmentResult.providerOrderId,
      shipmentId: shipmentResult.shipmentId,
      awbCode: awbResult?.awbCode || null,
      courierName: awbResult?.courierName || null,
      courierId: awbResult?.courierId || null,
      status: 'created',
    });

    return {
      shipmentId: shipmentResult.shipmentId.toString(),
      awbCode: awbResult?.awbCode || 'pending',
      courierName: awbResult?.courierName || 'pending',
      trackingUrl: null,
      status: 'created',
      estimatedDelivery: null,
    };
  }

  /**
   * Get real-time tracking for shipment
   */
  async trackShipment(orderId: string): Promise<{
    status: string;
    trackingUrl: string | null;
    estimatedDelivery: string | null;
    activities: TrackingUpdate[];
  }> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!order.shiprocket?.shipmentId) {
      throw new BadRequestError('Shipment not created yet');
    }

    const tracking = await this.provider.trackShipment(order.shiprocket.shipmentId);

    // Update order tracking info
    await this.orderRepo.updateShiprocketInfo(orderId, {
      status: tracking.currentStatus,
      trackingUrl: tracking.trackingUrl,
      estimatedDelivery: tracking.estimatedDelivery?.toISOString() || null,
    });

    return {
      status: tracking.currentStatus,
      trackingUrl: tracking.trackingUrl,
      estimatedDelivery: tracking.estimatedDelivery?.toISOString() || null,
      activities: tracking.activities,
    };
  }

  /**
   * Generate AWB label PDF for printing
   */
  async generateLabel(orderId: string): Promise<string> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!order.shiprocket?.shipmentId) {
      throw new BadRequestError('Shipment not created yet');
    }

    const labelUrl = await this.provider.generateLabel(order.shiprocket.shipmentId);

    // Update order with label URL
    await this.orderRepo.updateShiprocketInfo(orderId, {
      label: labelUrl,
    });

    return labelUrl;
  }

  /**
   * Request pickup from warehouse
   */
  async schedulePickup(orderId: string): Promise<{ pickupScheduledDate: string }> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!order.shiprocket?.shipmentId) {
      throw new BadRequestError('Shipment not created yet');
    }

    const pickupResult = await this.provider.schedulePickup(order.shiprocket.shipmentId);

    // Update order with pickup date
    await this.orderRepo.updateShiprocketInfo(orderId, {
      pickupScheduledDate: pickupResult.pickupScheduledDate,
    });

    return pickupResult;
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!order.shiprocket?.orderId) {
      throw new BadRequestError('Shiprocket order not found');
    }

    await this.provider.cancelOrder(order.shiprocket.orderId);

    // Update order status
    await this.orderRepo.updateShiprocketInfo(orderId, {
      status: 'cancelled',
    });
  }

  /**
   * Get shipping rates & couriers for checkout
   */
  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number = 0.5,
  ): Promise<Array<{ courierId: number; courierName: string; rate: number; estimatedDays: number }>> {
    const rates = await this.provider.getShippingRates(pickupPincode, deliveryPincode, weight);
    return rates.map((r) => ({
      courierId: r.courierId,
      courierName: r.courierName,
      rate: r.rate,
      estimatedDays: r.estimatedDays,
    }));
  }

  /**
   * Validate pincode serviceability
   */
  async validatePincode(pincode: string): Promise<boolean> {
    try {
      // Try to get rates from any pincode to warehouse pincode
      // If it succeeds, pincode is serviceable
      const rates = await this.getShippingRates('400001', pincode, 0.5);
      return rates.length > 0;
    } catch {
      return false;
    }
  }
}

export const shiprocketService = new ShiprocketServiceImpl();
