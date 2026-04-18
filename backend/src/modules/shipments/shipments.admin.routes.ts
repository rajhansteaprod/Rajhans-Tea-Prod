import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './shipments.admin.controller';

const router = Router();

// All admin shipment routes require authentication
router.use(authenticate);

/**
 * Create shipment from order
 * POST /api/v1/admin/shipments/create
 */
router.post('/create', ctrl.createShipment);

/**
 * Get shipment tracking
 * GET /api/v1/admin/shipments/:orderId/track
 */
router.get('/:orderId/track', ctrl.trackShipment);

/**
 * Generate AWB label
 * GET /api/v1/admin/shipments/:orderId/label
 */
router.get('/:orderId/label', ctrl.generateLabel);

/**
 * Schedule pickup
 * POST /api/v1/admin/shipments/:orderId/pickup
 */
router.post('/:orderId/pickup', ctrl.schedulePickup);

/**
 * Cancel shipment
 * POST /api/v1/admin/shipments/:orderId/cancel
 */
router.post('/:orderId/cancel', ctrl.cancelShipment);

/**
 * Get shipping rates for checkout
 * GET /api/v1/shipments/rates?pickup=400001&delivery=560001&weight=0.5
 */
router.get('/rates', ctrl.getShippingRates);

/**
 * Validate pincode serviceability
 * GET /api/v1/shipments/validate/:pincode
 */
router.get('/validate/:pincode', ctrl.validatePincode);

export default router;
