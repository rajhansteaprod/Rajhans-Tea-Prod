import { OrderRepository } from '../repositories/order.repository';
import { WarehouseRepository } from '../repositories/warehouse.repository';
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

export class OrderService {
  private orderRepo = new OrderRepository();
  private warehouseRepo = new WarehouseRepository();
  private inventoryService = new InventoryService();

  // ─── Create order from captured payment ───────────────────────────────────

  async createFromPayment(paymentId: string): Promise<IOrderDoc> {
    // Idempotency — already created?
    const existing = await this.orderRepo.findByPaymentId(paymentId);
    if (existing) return existing;

    const payment = await Payment.findById(paymentId).exec();
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'captured') throw new BadRequestError('Payment not captured');
    if (!payment.userId) throw new BadRequestError('Payment has no userId');

    const warehouse = await this.warehouseRepo.findDefault();
    if (!warehouse)
      throw new BadRequestError(
        'No default warehouse configured. Create one in Admin → Warehouses.',
      );

    const orderNumber = await this.orderRepo.generateOrderNumber();
    const snapshot = payment.checkoutSnapshot;

    // Enrich items with product images
    const itemsWithImages = await Promise.all(
      snapshot.items.map(async (item) => {
        const enrichedItem: any = {
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          fulfillmentStatus: 'pending',
        };

        try {
          console.log(`[Order] Fetching product images for: ${item.productId}`);
          const product = await Product.findById(item.productId).select('images').lean<any>().exec();
          console.log(`[Order] Product found:`, product);

          if (product?.images && product.images.length > 0) {
            enrichedItem.image = product.images[0];
            console.log(`[Order] Image added:`, enrichedItem.image);
          } else {
            console.log(`[Order] No images found for product:`, item.productId);
          }
        } catch (err) {
          console.log(`[Order] Error fetching product:`, err);
        }

        return enrichedItem;
      }),
    );

    const order = await this.orderRepo.create({
      orderNumber,
      userId: payment.userId,
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
      warehouseId: warehouse._id,
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

    // Deduct stock
    await this.inventoryService.deductStock(order._id.toString());

    return order;
  }

  // ─── Ship order via shipping provider ─────────────────────────────────────

  async shipOrder(orderId: string): Promise<IOrderDoc> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== 'confirmed' && order.status !== 'In Progress') {
      throw new BadRequestError('Order cannot be shipped in current status');
    }

    const warehouse = await this.warehouseRepo.findById(order.warehouseId.toString());
    if (!warehouse) throw new BadRequestError('Warehouse not found');
    if (!warehouse.shiprocketPickupLocationId) {
      throw new BadRequestError('Warehouse not configured with Shiprocket pickup location');
    }

    const provider = getShippingProvider();
    const pickupLocation = warehouse.shiprocketPickupLocationId;

    // Create shipping order in Shiprocket
    const shipment = await provider.createOrder(order, pickupLocation);
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
    if (newStatus === 'cancelled') {
      await this.inventoryService.restockFromReturn(
        orderId,
        order.items.map((i) => ({ productId: i.productId, qty: i.qty })),
      );
    }

    if (newStatus === 'returned') {
      await this.inventoryService.restockFromReturn(
        orderId,
        order.items.map((i) => ({ productId: i.productId, qty: i.qty })),
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

  // ─── Tracking ─────────────────────────────────────────────────────────────

  async getTracking(orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    let statusHistory = [...order.statusHistory];

    try {
      const provider = getShippingProvider();
      if (!order.shiprocket.orderId) {
        shipmentLogger.warn({
          orderId,
        }, '⚠️ Shiprocket orderId not found - order not created in Shiprocket yet');
        return {
          orderNumber: order.orderNumber,
          status: order.status,
          statusHistory,
        };
      }

      const tracking = await provider.trackByOrderId("order.shiprocket.orderId");

      if (tracking && tracking.currentStatus && tracking.currentStatus !== 'unknown') {
        // Add latest tracking as new status history entry if status changed
        const latestStatusEntry = statusHistory[statusHistory.length - 1];
        if (latestStatusEntry?.status !== tracking.currentStatus) {
          statusHistory.push({
            status: tracking.currentStatus,
            timestamp: new Date(),
            note: `Shiprocket: ${tracking.currentStatus}`,
            updatedBy: null,
          });
        }

        shipmentLogger.debug({
          orderId,
          orderNumber: order.orderNumber,
          trackingStatus: tracking.currentStatus,
        }, '✅ Tracking fetched and merged into history');
      }
    } catch (error) {
      shipmentLogger.warn({
        orderId,
        orderNumber: order.orderNumber,
        error: error instanceof Error ? error.message : String(error),
      }, '⚠️ Failed to fetch tracking');
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusHistory,
    };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getOrderForUser(orderId: string, userId: string) {
    const order = await this.orderRepo.findById(orderId);
    console.log("CHECK HEREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE"+order);
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId._id.toString() !== userId) throw new ForbiddenError('Access denied');
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
