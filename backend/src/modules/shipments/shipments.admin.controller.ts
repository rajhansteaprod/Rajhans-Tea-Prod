import { Request, Response } from 'express';
import { shiprocketService } from './shiprocket.service';
import { sendSuccess, sendCreated } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

/**
 * Create Shiprocket shipment from order
 * POST /admin/shipments/create
 */
export const createShipment = async (req: Request, res: Response) => {
  const { orderId, pickupLocationId, courierId } = req.body;

  if (!orderId || !pickupLocationId) {
    throw new BadRequestError('orderId and pickupLocationId are required');
  }

  const result = await shiprocketService.createShipment({
    orderId,
    pickupLocationId,
    courierId,
  });

  sendCreated(res, result, 'Shipment created successfully');
};

/**
 * Get shipment tracking
 * GET /admin/shipments/:orderId/track
 */
export const trackShipment = async (req: Request, res: Response) => {
  const orderId = (req.params.orderId as string) || '';

  const tracking = await shiprocketService.trackShipment(orderId);
  sendSuccess(res, tracking);
};

/**
 * Generate AWB label
 * GET /admin/shipments/:orderId/label
 */
export const generateLabel = async (req: Request, res: Response) => {
  const orderId = (req.params.orderId as string) || '';

  const labelUrl = await shiprocketService.generateLabel(orderId);
  sendSuccess(res, { labelUrl });
};

/**
 * Schedule pickup
 * POST /admin/shipments/:orderId/pickup
 */
export const schedulePickup = async (req: Request, res: Response) => {
  const orderId = (req.params.orderId as string) || '';

  const result = await shiprocketService.schedulePickup(orderId);
  sendSuccess(res, result);
};

/**
 * Cancel shipment
 * POST /admin/shipments/:orderId/cancel
 */
export const cancelShipment = async (req: Request, res: Response) => {
  const orderId = (req.params.orderId as string) || '';

  await shiprocketService.cancelShipment(orderId);
  sendSuccess(res, { message: 'Shipment cancelled successfully' });
};

/**
 * Get shipping rates
 * GET /admin/shipments/rates?pickup=400001&delivery=560001&weight=0.5
 */
export const getShippingRates = async (req: Request, res: Response) => {
  const { pickup, delivery, weight } = req.query;

  if (!pickup || !delivery) {
    throw new BadRequestError('pickup and delivery pincodes are required');
  }

  const rates = await shiprocketService.getShippingRates(
    pickup as string,
    delivery as string,
    weight ? parseFloat(weight as string) : 0.5,
  );

  sendSuccess(res, { rates });
};

/**
 * Validate pincode
 * GET /admin/shipments/validate-pincode/:pincode
 */
export const validatePincode = async (req: Request, res: Response) => {
  const pincode = (req.params.pincode as string) || '';

  const isValid = await shiprocketService.validatePincode(pincode);
  sendSuccess(res, { valid: isValid, pincode });
};

/**
 * Create bulk shipments for multiple orders
 * POST /admin/shipments/bulk
 */
export const createBulkShipments = async (req: Request, res: Response) => {
  const { orderIds, pickupLocationId, courierId } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0 || !pickupLocationId) {
    throw new BadRequestError('orderIds (array), pickupLocationId are required');
  }

  const results = {
    successCount: 0,
    failedCount: 0,
    failed: [] as { orderId: string; error: string }[],
  };

  for (const orderId of orderIds) {
    try {
      await shiprocketService.createShipment({
        orderId,
        pickupLocationId,
        courierId,
      });
      results.successCount++;
    } catch (error: any) {
      results.failedCount++;
      results.failed.push({
        orderId,
        error: error.message || 'Unknown error',
      });
    }
  }

  sendSuccess(res, results, 'Bulk shipment creation completed');
};
