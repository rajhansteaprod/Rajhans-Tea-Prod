import { Request, Response } from 'express';
import { OrderService } from './services/order.service';
import { InventoryService } from './services/inventory.service';
import { WarehouseService } from './services/warehouse.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';
import { config } from '../../config';
import { OrderStatus } from './models/order.model';

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
  sendPaginated(res, result.orders, result.meta, 'Orders');
};

export const getOrderDetail = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = req.params['orderId'] as string;
  const order = await orderService.getOrderForUser(orderId, userId);
  sendSuccess(res, order);
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
  const token = req.headers['x-api-key'] as string;
  if (
    config.shipping.shiprocket.webhookToken &&
    token !== config.shipping.shiprocket.webhookToken
  ) {
    throw new BadRequestError('Invalid webhook token');
  }

  const payload = req.body;
  const orderNumber = payload.order_id as string;
  const currentStatus = payload.current_status as string;

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
      const repo = new OrderRepository();
      const order = await repo.findByOrderNumber(orderNumber);
      if (order) {
        try {
          await orderService.updateStatus(
            order._id.toString(),
            newStatus,
            `Shiprocket: ${currentStatus}`,
            null,
          );
        } catch {
          // Invalid transition — ignore (idempotent)
        }

        // Update tracking info
        if (payload.awb) {
          await repo.updateShiprocketInfo(order._id.toString(), {
            awbCode: payload.awb,
            courierName: payload.courier_name,
            trackingUrl: payload.tracking_url || null,
            estimatedDelivery: payload.etd ? new Date(payload.etd) : null,
          });
        }
      }
    }
  }

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
  sendPaginated(res, result.orders, result.meta, 'Orders');
};

export const adminGetOrderDetail = async (req: Request, res: Response) => {
  const order = await orderService.adminGetOrder(req.params['orderId'] as string);
  sendSuccess(res, order);
};

export const adminGetOrderStats = async (_req: Request, res: Response) => {
  const stats = await orderService.getOrderStats();
  sendSuccess(res, stats);
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
