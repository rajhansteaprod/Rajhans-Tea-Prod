import { OrderRepository } from '../repositories/order.repository';
import { InventoryService } from './inventory.service';
import { getShippingProvider } from './shipping/shipping.factory';
import { Payment } from '../../payments/models/payment.model';
import { Product } from '../../catalog/models/product.model';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../../utils/api-error';
import { shipmentLogger } from '../../../utils/shipment-logger';
import { OrderStatus, IOrderDoc } from '../models/order.model';
import { Types } from 'mongoose';

// Valid status transitions (state machine)
const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  confirmed: ['In Progress', 'cancelled'],
  "In Progress": ['shipped', 'cancelled'],
  shipped: ['in_transit'],
  in_transit: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['return_requested'],
  return_requested: ['returned'],
};

// Map Shiprocket tracking statuses to local order statuses
const SHIPROCKET_STATUS_MAP: Record<string, OrderStatus> = {
  'PICKED UP': 'shipped',
  'IN TRANSIT': 'in_transit',
  'OUT FOR DELIVERY': 'out_for_delivery',
  'DELIVERED': 'delivered',
  'CANCELLED': 'cancelled',
  'RETURN INITIATED': 'return_requested',
  'RETURNED': 'returned',
};

export class OrderService {
  private orderRepo = new OrderRepository();
  private inventoryService = new InventoryService();

  // ─── Create order from captured payment ───────────────────────────────────

  async createFromPayment(paymentId: string): Promise<IOrderDoc> {
    console.log(`[Order] ▶ Starting createFromPayment for paymentId: ${paymentId}`);

    // Idempotency — already created?
    const existing = await this.orderRepo.findByPaymentId(paymentId);
    if (existing) {
      console.log(`[Order] ✓ Order already exists for payment ${paymentId}, orderId: ${existing._id}`);
      return existing;
    }

    const payment = await Payment.findById(paymentId).exec();
    if (!payment) {
      console.log(`[Order] ❌ Payment not found for paymentId: ${paymentId}`);
      throw new NotFoundError('Payment not found');
    }
    console.log(`[Order] ✓ Payment found - userId: ${payment.userId}, status: ${payment.status}`);

    if (payment.status !== 'captured') {
      console.log(`[Order] ❌ Payment status not captured: ${payment.status}`);
      throw new BadRequestError('Payment not captured');
    }

    const orderNumber = await this.orderRepo.generateOrderNumber();
    console.log(`[Order] ✓ Generated orderNumber: ${orderNumber}`);
    const snapshot = payment.checkoutSnapshot;
    console.log(`[Order] ✓ Snapshot items count: ${snapshot.items.length}`);

    // Enrich items with product images
    const itemsWithImages = await Promise.all(
      snapshot.items.map(async (item) => {
        const enrichedItem: any = {
          productId: item.productId,
          variantId: item.variantId ?? null,
          variant: item.variantName ?? null,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          fulfillmentStatus: 'pending',
        };

        try {
          const product = await Product.findById(item.productId).select('images').lean<any>().exec();
          if (product?.images && product.images.length > 0) {
            enrichedItem.image = product.images[0];
          }
        } catch (err) {
          console.warn(`[Order] Failed to fetch image for product ${item.productId}:`, err);
        }

        return enrichedItem;
      }),
    );

    console.log(`[Order] ▶ Creating order in database - orderNumber: ${orderNumber}, userId: ${payment.userId}`);
    const order = await this.orderRepo.create({
      orderNumber,
      userId: payment.userId || undefined,
      sessionId: payment.sessionId,
      paymentId: payment._id,
      items: itemsWithImages,
      subtotal: snapshot.subtotal,
      totalDiscount: snapshot.totalDiscount,
      totalTax: snapshot.totalTax,
      shippingCost: 0,
      total: snapshot.total,
      status: 'confirmed',
      statusHistory: [
        {
          status: 'confirmed',
          timestamp: new Date(),
          note: 'Order created from payment',
          updatedBy: null,
        },
      ],
      shippingAddress: payment.shippingAddress,
      shiprocket: {
        orderId: null,
        shipmentId: null,
        awbCode: null,
        courierName: null,
        courierId: null,
        trackingUrl: null,
        label: null,
        estimatedDelivery: null,
        pickupScheduledDate: null,
      },
    });
    console.log(`[Order] ✅ Order created successfully - orderId: ${order._id}, orderNumber: ${order.orderNumber}`);

    // Deduct stock
    console.log(`[Order] ▶ Deducting stock for orderId: ${order._id}`);
    await this.inventoryService.deductStock(order._id.toString());
    console.log(`[Order] ✓ Stock deducted`);

    return order;
  }

  // ─── Ship order via shipping provider ─────────────────────────────────────

  async shipOrder(orderId: string): Promise<IOrderDoc> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== 'confirmed' && order.status !== 'In Progress') {
      throw new BadRequestError('Order cannot be shipped in current status');
    }

    // Idempotency: if already created in Shiprocket, skip API call
    if (order.shiprocket.orderId && order.shiprocket.shipmentId) {
      shipmentLogger.info({
        orderId,
        shiprocketOrderId: order.shiprocket.orderId,
        shiprocketShipmentId: order.shiprocket.shipmentId,
      }, '✓ Order already created in Shiprocket, skipping API call');

      // If status is still confirmed, update to In Progress
      if (order.status === 'confirmed') {
        return this.updateStatus(orderId, 'In Progress', 'Order already in Shiprocket', null);
      }
      return order;
    }

    const provider = getShippingProvider();
    // Use 'warehouse' as default pickup location for Rajhans Tea
    const pickupLocation = 'warehouse';

    // Create shipping order in Shiprocket
    const shipment = await provider.createOrder(order, pickupLocation);

    // Validate response data
    if (!shipment.providerOrderId || !shipment.shipmentId) {
      shipmentLogger.error({
        orderId,
        providerOrderId: shipment.providerOrderId,
        shipmentId: shipment.shipmentId,
      }, '❌ Shiprocket response missing required fields');
      throw new BadRequestError('Shiprocket API response invalid: missing orderId or shipmentId');
    }

    await this.orderRepo.updateShiprocketInfo(orderId, {
      orderId: String(shipment.providerOrderId),
      shipmentId: shipment.shipmentId,
    });

    shipmentLogger.info({
      orderId,
      shiprocketOrderId: shipment.providerOrderId,
      shiprocketShipmentId: shipment.shipmentId,
    }, '✅ Order created in Shiprocket. AWB, label, pickup to be done via GUI');

    // Update status to processing (order is now in Shiprocket pipeline)
    return this.updateStatus(orderId, 'In Progress', 'Order created in Shiprocket', null);
  }

  // ─── Update order status ──────────────────────────────────────────────────

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    note: string | null,
    adminUserId: string | null,
  ): Promise<IOrderDoc> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (!this.isValidTransition(order.status, newStatus)) {
      throw new BadRequestError(`Cannot transition from "${order.status}" to "${newStatus}"`);
    }

    const extra: Record<string, unknown> = {};
    if (newStatus === 'cancelled') {
      extra.cancellationReason = note || 'Cancelled by admin';
    }

    const updated = await this.orderRepo.updateStatus(
      orderId,
      newStatus,
      {
        status: newStatus,
        timestamp: new Date(),
        note,
        updatedBy: adminUserId ? new Types.ObjectId(adminUserId) : null,
      },
      extra,
    );

    // Side effects
    if (newStatus === 'cancelled' || newStatus === 'returned') {
      await this.inventoryService.restockFromReturn(
        orderId,
        order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
      );
    }

    return updated!;
  }

  // ─── Cancel order ─────────────────────────────────────────────────────────

  async cancelOrder(orderId: string, reason: string, adminUserId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (!['confirmed', 'In Progress'].includes(order.status)) {
      throw new BadRequestError('Order can only be cancelled in confirmed or In Progress status');
    }

    // Cancel shipping if already created
    if (order.shiprocket.orderId) {
      try {
        const provider = getShippingProvider();
        await provider.cancelOrder(parseInt(order.shiprocket.orderId, 10));
      } catch {
        // Log but don't block cancellation
      }
    }

    await this.updateStatus(orderId, 'cancelled', reason, adminUserId);
  }

  // ─── Sync order status from Shiprocket ──────────────────────────────────

  private async syncOrderStatusFromShiprocket(order: IOrderDoc): Promise<void> {
    if (!order.shiprocket.orderId && !order.orderNumber) {
      shipmentLogger.warn({
        orderId: order._id,
      }, '⚠️ Cannot sync - no Shiprocket order ID or order number');
      return;
    }

    try {
      const provider = getShippingProvider();
      const shiprocketId = order.shiprocket.orderId || order.orderNumber;

      shipmentLogger.debug({
        orderId: order._id,
        shiprocketId,
      }, '▶ Syncing order status from Shiprocket');

      const tracking = await provider.trackByOrderId(shiprocketId);
      if (!tracking || !tracking.currentStatus) {
        return;
      }

      // Map Shiprocket status to local status
      const shiprocketStatus = tracking.currentStatus.toUpperCase();
      const newStatus = SHIPROCKET_STATUS_MAP[shiprocketStatus] as OrderStatus | undefined;

      if (!newStatus) {
        shipmentLogger.warn({
          orderId: order._id,
          shiprocketStatus,
        }, '⚠️ Unknown Shiprocket status, skipping sync');
        return;
      }

      // Only update if status actually changed
      if (order.status === newStatus) {
        shipmentLogger.debug({
          orderId: order._id,
          status: newStatus,
        }, '✓ Status unchanged, skipping update');
        return;
      }

      // Validate transition
      if (!this.isValidTransition(order.status, newStatus)) {
        shipmentLogger.warn({
          orderId: order._id,
          currentStatus: order.status,
          targetStatus: newStatus,
        }, '⚠️ Invalid status transition, skipping sync');
        return;
      }

      // Update status
      await this.updateStatus(
        order._id.toString(),
        newStatus,
        `Synced from Shiprocket: ${shiprocketStatus}`,
        null,
      );

      shipmentLogger.info({
        orderId: order._id,
        previousStatus: order.status,
        newStatus,
        shiprocketStatus,
      }, '✅ Order status synced from Shiprocket');
    } catch (error) {
      shipmentLogger.warn({
        orderId: order._id,
        error: error instanceof Error ? error.message : String(error),
      }, '⚠️ Failed to sync order status from Shiprocket');
      // Don't throw - let tracking request continue even if sync fails
    }
  }

  // ─── Tracking ─────────────────────────────────────────────────────────────

  async getTracking(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    return this.buildTrackingResponse(order);
  }

  async getTrackingByOrderNumber(orderNumber: string) {
    const order = await this.orderRepo.findByOrderNumber(orderNumber);
    if (!order) throw new NotFoundError(`Order ${orderNumber} not found`);

    return this.buildTrackingResponse(order);
  }

  private async buildTrackingResponse(order: IOrderDoc) {
    shipmentLogger.info({
      orderId: order._id,
      orderNumber: order.orderNumber,
    }, '▶ Building tracking response');

    // Sync latest status from Shiprocket (idempotent - updates DB if status changed)
    await this.syncOrderStatusFromShiprocket(order);

    // Fetch fresh copy of order after potential sync
    const freshOrder = await this.orderRepo.findById(order._id.toString());
    if (!freshOrder) {
      throw new NotFoundError('Order not found after sync');
    }

    let statusHistory = [...freshOrder.statusHistory];
    let currentShiprocketStatus = null;
    let shiprocketData = null;

    try {
      const provider = getShippingProvider();

      // If Shiprocket order exists, fetch real-time tracking
      // Try by Shiprocket order ID first, then fall back to order number
      const shiprocketId = freshOrder.shiprocket.orderId || freshOrder.orderNumber;

      if (shiprocketId) {
        shipmentLogger.debug({
          orderId: freshOrder._id,
          shiprocketOrderId: freshOrder.shiprocket.orderId,
          orderNumber: freshOrder.orderNumber,
          trackingWith: freshOrder.shiprocket.orderId ? 'shiprocketOrderId' : 'orderNumber',
        }, '📡 Fetching real-time tracking from Shiprocket');

        const tracking = await provider.trackByOrderId(shiprocketId);

        if (tracking) {
          currentShiprocketStatus = tracking.currentStatus;
          shiprocketData = {
            awbCode: freshOrder.shiprocket.awbCode,
            courierName: freshOrder.shiprocket.courierName,
            trackingUrl: tracking.trackingUrl,
            estimatedDelivery: tracking.estimatedDelivery,
            activities: tracking.activities || [],
          };

          shipmentLogger.debug({
            orderId: freshOrder._id,
            currentStatus: tracking.currentStatus,
            activitiesCount: tracking.activities?.length || 0,
          }, '✅ Shiprocket tracking fetched successfully');
        }
      } else {
        shipmentLogger.warn({
          orderId: freshOrder._id,
        }, '⚠️ Shiprocket orderId not found - order not yet created in Shiprocket');
      }
    } catch (error) {
      shipmentLogger.warn({
        orderId: freshOrder._id,
        orderNumber: freshOrder.orderNumber,
        error: error instanceof Error ? error.message : String(error),
      }, '⚠️ Failed to fetch Shiprocket tracking');
    }

    return {
      orderNumber: freshOrder.orderNumber,
      status: freshOrder.status,
      statusHistory,
      shiprocket: shiprocketData,
      currentShiprocketStatus,
    };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getOrderForUser(orderId: string, userId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.userId || order.userId.toString() !== userId) throw new ForbiddenError('Access denied');
    return order;
  }

  async getUserOrders(
    userId: string,
    query: { page?: number; limit?: number; status?: string } = {},
  ) {
    return this.orderRepo.findByUserId(userId, query);
  }

  async adminListOrders(
    query: { page?: number; limit?: number; status?: string; search?: string } = {},
  ) {
    return this.orderRepo.findAllAdmin(query);
  }

  async adminGetOrder(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  async getOrderStats() {
    return this.orderRepo.getOrderStats();
  }

  async getShippingRates(pickupPincode: string, deliveryPincode: string, weight = 0.5) {
    const provider = getShippingProvider();
    return provider.getShippingRates(pickupPincode, deliveryPincode, weight);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
    return VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }
}
