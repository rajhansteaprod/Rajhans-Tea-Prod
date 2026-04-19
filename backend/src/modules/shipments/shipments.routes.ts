import { Router } from 'express';
import * as controller from './shipments.controller';
import * as adminCtrl from './shipments.admin.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/shipments/estimate-delivery
 * Estimate delivery time based on pincode and cart items
 */
router.post('/estimate-delivery', controller.estimateDelivery);

/**
 * POST /api/v1/shipments/validate-pincode
 * Validate if a pincode is serviceable
 */
router.post('/validate-pincode', controller.validatePincode);

// ─── ADMIN ROUTES ───────────────────────────────────────────────────────────

/**
 * Create shipment from order
 * POST /api/v1/admin/shipments/create
 */
router.post('/admin/shipments/create', authenticate, adminCtrl.createShipment);

/**
 * Create bulk shipments for multiple orders
 * POST /api/v1/admin/shipments/bulk
 */
router.post('/admin/shipments/bulk', authenticate, adminCtrl.createBulkShipments);

/**
 * Get shipment tracking
 * GET /api/v1/admin/shipments/:orderId/track
 */
router.get('/admin/shipments/:orderId/track', authenticate, adminCtrl.trackShipment);

/**
 * Generate AWB label
 * GET /api/v1/admin/shipments/:orderId/label
 */
router.get('/admin/shipments/:orderId/label', authenticate, adminCtrl.generateLabel);

/**
 * Schedule pickup
 * POST /api/v1/admin/shipments/:orderId/pickup
 */
router.post('/admin/shipments/:orderId/pickup', authenticate, adminCtrl.schedulePickup);

/**
 * Cancel shipment
 * POST /api/v1/admin/shipments/:orderId/cancel
 */
router.post('/admin/shipments/:orderId/cancel', authenticate, adminCtrl.cancelShipment);

/**
 * Get shipping rates
 * GET /api/v1/admin/shipments/rates?pickup=400001&delivery=560001&weight=0.5
 */
router.get('/admin/shipments/rates', authenticate, adminCtrl.getShippingRates);

/**
 * Validate pincode serviceability
 * GET /api/v1/admin/shipments/validate/:pincode
 */
router.get('/admin/shipments/validate/:pincode', authenticate, adminCtrl.validatePincode);

export default router;
