import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './inventory.controller';
import {
  adjustStockSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  orderIdSchema,
  shippingRateSchema,
} from './inventory.validator';

const router = Router();

// ===========================================================================
// CUSTOMER — Orders (authenticated)
// ===========================================================================

router.get('/orders/user', authenticate, ctrl.getUserOrders);
router.get('/orders/user/:orderId', authenticate, validate(orderIdSchema), ctrl.getOrderDetail);
router.get(
  '/orders/user/:orderId/tracking',
  authenticate,
  validate(orderIdSchema),
  ctrl.getOrderTracking,
);
router.get(
  '/orders/user/:orderId/shipment',
  authenticate,
  validate(orderIdSchema),
  ctrl.getShipmentTracking,
);
router.get('/shipping/rates', validate(shippingRateSchema), ctrl.getShippingRates);

// ===========================================================================
// SHIPROCKET WEBHOOK
// ===========================================================================

router.post('/webhooks/shiprocket', ctrl.handleShiprocketWebhook);

// ===========================================================================
// ADMIN — Orders, Inventory, Warehouses
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Orders
adminRouter.get('/orders', ctrl.adminListOrders);
adminRouter.get('/orders/stats', ctrl.adminGetOrderStats);
adminRouter.get('/orders/:orderId', validate(orderIdSchema), ctrl.adminGetOrderDetail);
adminRouter.get(
  '/orders/:orderId/tracking',
  validate(orderIdSchema),
  ctrl.adminGetOrderTracking,
);
adminRouter.patch(
  '/orders/:orderId/status',
  validate(updateOrderStatusSchema),
  ctrl.adminUpdateOrderStatus,
);
adminRouter.post('/orders/:orderId/cancel', validate(cancelOrderSchema), ctrl.adminCancelOrder);
adminRouter.post('/orders/:orderId/ship', validate(orderIdSchema), ctrl.adminShipOrder);

// Inventory
adminRouter.get('/inventory/stats', ctrl.adminGetInventoryStats);
adminRouter.get('/inventory/products', ctrl.adminGetAllTrackedProducts);
adminRouter.get('/inventory/low-stock', ctrl.adminGetLowStockProducts);
adminRouter.get('/inventory/movements', ctrl.adminGetAllMovements);
adminRouter.get('/inventory/alerts', ctrl.adminGetAlerts);
adminRouter.post('/inventory/alerts/:alertId/resolve', ctrl.adminResolveAlert);
adminRouter.post(
  '/inventory/:productId/adjust',
  validate(adjustStockSchema),
  ctrl.adminAdjustStock,
);
adminRouter.post('/inventory/:productId/set-stock', ctrl.adminSetStock);
adminRouter.get('/inventory/:productId/movements', ctrl.adminGetStockMovements);

// Warehouses
adminRouter.get('/warehouses', ctrl.adminListWarehouses);
adminRouter.post('/warehouses', validate(createWarehouseSchema), ctrl.adminCreateWarehouse);
adminRouter.put('/warehouses/:id', validate(updateWarehouseSchema), ctrl.adminUpdateWarehouse);
adminRouter.delete('/warehouses/:id', ctrl.adminDeleteWarehouse);

router.use('/admin', adminRouter);

export default router;
