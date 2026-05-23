import { Request, Response } from 'express';
import { OrderService } from './services/order.service';
import { InventoryService } from './services/inventory.service';
import { WarehouseService } from './services/warehouse.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';
import { config } from '../../config';
import { OrderStatus } from './models/order.model';
import {logger} from '../../utils/logger';
import { shipmentLogger } from '../../utils/shipment-logger';

const orderService = new OrderService();
const inventoryService = new InventoryService();
const warehouseService = new WarehouseService();

// ─── Customer: Orders ────────────────────────────────────────────────────────

export const getUserOrders = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { page, limit, status } = req.query as Record<string, string | undefined>;
  const result = await orderService.getUserOrders(userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    status,
  });
  // Ensure variantId is included in each item
  const ordersWithVariant = result.orders.map(order => ({
    ...order.toObject(),
    items: order.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      fulfillmentStatus: item.fulfillmentStatus,
    })),
  }));
  sendPaginated(res, ordersWithVariant, result.meta, 'Orders');
};

export const getOrderDetail = async (req: Request, res: Response) => {
  logger.info("Getting order detail for orderId:" + req.params['orderId']);
  const userId = req.user!.userId;
  const orderId = req.params['orderId'] as string;
  const order = await orderService.getOrderForUser(orderId, userId);
  // Ensure variantId is included in each item
  const orderWithVariant = {
    ...order.toObject(),
    items: order.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      fulfillmentStatus: item.fulfillmentStatus,
    })),
  };
  sendSuccess(res, orderWithVariant);
};

export const getOrderTracking = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = req.params['orderId'] as string;
  // Verify ownership
  await orderService.getOrderForUser(orderId, userId);
  const tracking = await orderService.getTracking(orderId);
  sendSuccess(res, tracking);
};

export const getShippingRates = async (req: Request, res: Response) => {
  const { pincode, weight } = req.query as { pincode: string; weight?: string };
  // Use default warehouse pincode as pickup
  try {
    const warehouse = await warehouseService.getDefault();
    const rates = await orderService.getShippingRates(
      warehouse.address.pincode,
      pincode,
      weight ? parseFloat(weight) : 0.5,
    );
    sendSuccess(res, rates);
  } catch {
    // If no warehouse or shiprocket not configured, return empty
    sendSuccess(res, []);
  }
};

// ─── Shiprocket Webhook ──────────────────────────────────────────────────────

export const handleShiprocketWebhook = async (req: Request, res: Response) => {
  shipmentLogger.info('🔔 Shiprocket webhook received');

  const token = req.headers['x-api-key'] as string;
  if (
    config.shipping.shiprocket.webhookToken &&
    token !== config.shipping.shiprocket.webhookToken
  ) {
    shipmentLogger.error({ token }, '❌ Invalid webhook token');
    throw new BadRequestError('Invalid webhook token');
  }
  shipmentLogger.debug('✓ Webhook token verified');

  const payload = req.body;
  const orderNumber = payload.order_id as string;
  const currentStatus = payload.current_status as string;

  shipmentLogger.debug({ orderNumber, currentStatus, awb: payload.awb }, '📦 Webhook payload');

  if (orderNumber && currentStatus) {
    // Map Shiprocket status to our status
    const statusMap: Record<string, OrderStatus> = {
      'PICKED UP': 'in_transit',
      'IN TRANSIT': 'in_transit',
      'OUT FOR DELIVERY': 'out_for_delivery',
      DELIVERED: 'delivered',
    };

    const newStatus = statusMap[currentStatus.toUpperCase()];
    if (newStatus) {
      const { OrderRepository } = await import('./repositories/order.repository');
      const { ShipmentRepository } = await import('./repositories/shipment.repository');
      const orderRepo = new OrderRepository();
      const shipmentRepo = new ShipmentRepository();

      const order = await orderRepo.findByOrderNumber(orderNumber);
      if (order) {
        shipmentLogger.debug({ orderId: order._id, orderNumber }, '✓ Order found');

        try {
          shipmentLogger.debug({ orderId: order._id, newStatus }, '📝 Updating order status');
          await orderService.updateStatus(
            order._id.toString(),
            newStatus,
            `Shiprocket: ${currentStatus}`,
            null,
          );
          shipmentLogger.info({ orderId: order._id, status: newStatus }, '✅ Order status updated');
        } catch (err) {
          shipmentLogger.warn({ orderId: order._id, error: err }, '⚠ Status update failed (invalid transition)');
        }

        // Update tracking info
        if (payload.awb) {
          shipmentLogger.debug({ orderId: order._id, awb: payload.awb }, '📍 Updating tracking info');
          await orderRepo.updateShiprocketInfo(order._id.toString(), {
            awbCode: payload.awb,
            courierName: payload.courier_name,
            trackingUrl: payload.tracking_url || null,
            estimatedDelivery: payload.etd ? new Date(payload.etd) : null,
          });
          shipmentLogger.info({ orderId: order._id, awb: payload.awb }, '✅ Tracking info updated');
        }

        // Add tracking event to Shipment document
        try {
          const shipment = await shipmentRepo.findByOrderId(order._id.toString());
          if (shipment) {
            shipmentLogger.debug({ shipmentId: shipment._id, orderNumber }, '📋 Found shipment document');

            const shipmentStatusMap: Record<string, any> = {
              'PICKED UP': 'picked_up',
              'IN TRANSIT': 'in_transit',
              'OUT FOR DELIVERY': 'out_for_delivery',
              'DELIVERED': 'delivered',
            };
            const shipmentStatus = shipmentStatusMap[currentStatus.toUpperCase()];
            if (shipmentStatus) {
              shipmentLogger.debug({
                shipmentId: shipment._id,
                newStatus: shipmentStatus,
                location: payload.location,
              }, '➕ Adding tracking event');

              await shipmentRepo.addEvent(shipment._id.toString(), {
                status: shipmentStatus,
                timestamp: new Date(),
                location: payload.location || null,
                note: `${currentStatus}${payload.remark ? ': ' + payload.remark : ''}`,
              });

              shipmentLogger.info({
                shipmentId: shipment._id,
                status: shipmentStatus,
                location: payload.location,
              }, '✅ Tracking event added to shipment');
            }
          } else {
            shipmentLogger.warn({ orderId: order._id }, '⚠ No shipment document found');
          }
        } catch (err) {
          shipmentLogger.error({
            orderId: order._id,
            error: err instanceof Error ? err.message : String(err),
          }, '❌ Failed to add tracking event');
        }
      } else {
        shipmentLogger.warn({ orderNumber }, '⚠ Order not found');
      }
    } else {
      shipmentLogger.warn({ currentStatus }, '⚠ Unknown status mapping');
    }
  } else {
    shipmentLogger.warn({ payload }, '⚠ Missing orderNumber or currentStatus in payload');
  }

  shipmentLogger.info({ orderNumber }, '✅ Webhook processed successfully');
  res.status(200).json({ status: 'ok' });
};

// ─── Admin: Orders ───────────────────────────────────────────────────────────

export const adminListOrders = async (req: Request, res: Response) => {
  const { page, limit, status, search } = req.query as Record<string, string | undefined>;
  const result = await orderService.adminListOrders({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    status,
    search,
  });
  // Ensure variantId is included in each item
  const ordersWithVariant = result.orders.map(order => ({
    ...order.toObject(),
    items: order.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      fulfillmentStatus: item.fulfillmentStatus,
    })),
  }));
  sendPaginated(res, ordersWithVariant, result.meta, 'Orders');
};

export const adminGetOrderDetail = async (req: Request, res: Response) => {
  const order = await orderService.adminGetOrder(req.params['orderId'] as string);
  // Ensure variantId is included in each item
  const orderWithVariant = {
    ...order.toObject(),
    items: order.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      fulfillmentStatus: item.fulfillmentStatus,
    })),
  };
  sendSuccess(res, orderWithVariant);
};

export const adminGetOrderStats = async (_req: Request, res: Response) => {
  const stats = await orderService.getOrderStats();
  sendSuccess(res, stats);
};

export const adminGetOrderTracking = async (req: Request, res: Response) => {
  const orderId = req.params['orderId'] as string;
  const tracking = await orderService.getTracking(orderId);
  sendSuccess(res, tracking);
};

export const adminUpdateOrderStatus = async (req: Request, res: Response) => {
  const orderId = req.params['orderId'] as string;
  const { status, note } = req.body as { status: OrderStatus; note?: string };
  const order = await orderService.updateStatus(orderId, status, note || null, req.user!.userId);
  sendSuccess(res, order, 'Order status updated');
};

export const adminCancelOrder = async (req: Request, res: Response) => {
  const orderId = req.params['orderId'] as string;
  const { reason } = req.body as { reason: string };
  await orderService.cancelOrder(orderId, reason, req.user!.userId);
  sendSuccess(res, { cancelled: true }, 'Order cancelled');
};

export const adminShipOrder = async (req: Request, res: Response) => {
  const orderId = req.params['orderId'] as string;
  const order = await orderService.shipOrder(orderId);
  sendSuccess(res, order, 'Order shipped');
};

// ─── Admin: Inventory ────────────────────────────────────────────────────────

export const adminGetInventoryStats = async (_req: Request, res: Response) => {
  const stats = await inventoryService.getInventoryStats();
  sendSuccess(res, stats);
};

export const adminGetLowStockProducts = async (_req: Request, res: Response) => {
  const products = await inventoryService.getLowStockProducts();
  sendSuccess(res, products);
};

export const adminAdjustStock = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { qty, note } = req.body as { qty: number; note: string };
  const result = await inventoryService.adjustStock(productId, qty, note, req.user!.userId);
  sendSuccess(res, result, 'Stock adjusted');
};

export const adminGetStockMovements = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await inventoryService.getMovementHistory(productId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.movements, result.meta, 'Stock movements');
};

export const adminGetAllTrackedProducts = async (req: Request, res: Response) => {
  const { search, sort } = req.query as Record<string, string | undefined>;
  const products = await inventoryService.getAllTrackedProducts({ search, sort });
  sendSuccess(res, products);
};

export const adminGetAllMovements = async (req: Request, res: Response) => {
  const { page, limit, type } = req.query as Record<string, string | undefined>;
  const result = await inventoryService.getAllMovements({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    type,
  });
  sendPaginated(res, result.movements, result.meta, 'Stock movements');
};

export const adminSetStock = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { stock, note } = req.body as { stock: number; note: string };
  const result = await inventoryService.setStock(productId, stock, note, req.user!.userId);
  sendSuccess(res, result, 'Stock set');
};

export const adminResolveAlert = async (req: Request, res: Response) => {
  const alertId = req.params['alertId'] as string;
  await inventoryService.resolveAlert(alertId);
  sendSuccess(res, { resolved: true }, 'Alert resolved');
};

export const adminGetAlerts = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await inventoryService.getUnresolvedAlerts({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.alerts, result.meta, 'Alerts');
};

// ─── Admin: Warehouses ───────────────────────────────────────────────────────

export const adminListWarehouses = async (_req: Request, res: Response) => {
  const warehouses = await warehouseService.getAll();
  sendSuccess(res, warehouses);
};

export const adminCreateWarehouse = async (req: Request, res: Response) => {
  const warehouse = await warehouseService.create(req.body);
  sendCreated(res, warehouse, 'Warehouse created');
};

export const adminUpdateWarehouse = async (req: Request, res: Response) => {
  const warehouse = await warehouseService.update(req.params['id'] as string, req.body);
  sendSuccess(res, warehouse, 'Warehouse updated');
};

export const adminDeleteWarehouse = async (req: Request, res: Response) => {
  await warehouseService.delete(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Customer: Shipment Tracking ─────────────────────────────────────────────

export const getShipmentTracking = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = req.params['orderId'] as string;

  shipmentLogger.info({ userId, orderId }, '▶ Fetching shipment tracking for customer');

  // Verify ownership
  const order = await orderService.getOrderForUser(orderId, userId);
  shipmentLogger.debug({ orderId, orderNumber: order.orderNumber }, '✓ Order ownership verified');

  // Get shipment with tracking events
  const { ShipmentRepository } = await import('./repositories/shipment.repository');
  const shipmentRepo = new ShipmentRepository();

  shipmentLogger.debug({ orderId }, '🔍 Searching for shipment document');
  const shipment = await shipmentRepo.findByOrderId(orderId);

  if (!shipment) {
    shipmentLogger.info({ orderId }, '⚠ Shipment document not found');
    return sendSuccess(res, {
      orderNumber: order.orderNumber,
      status: order.status,
      shipment: null,
      message: 'Shipment not yet created for this order',
    });
  }

  shipmentLogger.debug({
    shipmentId: shipment._id,
    orderId,
    awbCode: shipment.awbCode,
    eventsCount: shipment.events.length,
  }, '✓ Shipment document found');

  const response = {
    orderNumber: order.orderNumber,
    status: order.status,
    shipment: {
      _id: shipment._id,
      awbCode: shipment.awbCode,
      courierName: shipment.courierName,
      trackingUrl: shipment.trackingUrl,
      status: shipment.status,
      pickupScheduledDate: shipment.pickupScheduledDate,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate,
      events: shipment.events,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    },
  };

  shipmentLogger.info({
    shipmentId: shipment._id,
    eventsCount: shipment.events.length,
  }, '✅ Shipment tracking returned to customer');

  sendSuccess(res, response);
};
