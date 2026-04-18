import { Router } from 'express';
import * as controller from './shipments.controller';

const router = Router();

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

export default router;
