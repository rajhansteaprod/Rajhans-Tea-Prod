import { Request, Response } from 'express';
import { ShiprocketService, EstimateDeliveryRequest } from './shipments.service';
import { sendSuccess } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

const shiprocketService = new ShiprocketService();

/**
 * Estimate delivery time for a given pincode
 * POST /api/v1/shipments/estimate-delivery
 *
 * Request body:
 * {
 *   pincode: string (6 digits),
 *   cartItems: Array of { productId, name, qty, basePrice }
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: { estimatedDays: number, serviceType?: string, remark?: string }
 * }
 */
export const estimateDelivery = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pincode, cartItems } = req.body as EstimateDeliveryRequest;

    if (!pincode || pincode.length !== 6 || !/^\d+$/.test(pincode)) {
      throw new BadRequestError('Invalid pincode. Please provide a 6-digit pincode.');
    }

    if (!cartItems || cartItems.length === 0) {
      throw new BadRequestError('Cart items are required to estimate delivery.');
    }

    const estimate = await shiprocketService.estimateDelivery({ pincode, cartItems });
    sendSuccess(res, estimate, 'Delivery time estimated');
  } catch (error) {
    const message = error instanceof BadRequestError ? error.message : 'Failed to estimate delivery time';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
};

/**
 * Validate if pincode is serviceable
 * POST /api/v1/shipments/validate-pincode
 */
export const validatePincode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pincode } = req.body as { pincode: string };

    if (!pincode || pincode.length !== 6) {
      throw new BadRequestError('Invalid pincode format');
    }

    const isValid = await shiprocketService.validatePincode(pincode);
    if (!isValid) {
      throw new BadRequestError('Pincode is not serviceable');
    }

    sendSuccess(res, { valid: true }, 'Pincode is serviceable');
  } catch (error) {
    const message = error instanceof BadRequestError ? error.message : 'Failed to validate pincode';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
};
