import { Request, Response } from 'express';
import { PromoCodeService } from './services/promo.service';
import { sendSuccess } from '../../utils/api-response';

const promoService = new PromoCodeService();

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return sendSuccess(res, {
        valid: false,
        error: 'Promo code is required',
      });
    }

    const result = await promoService.validatePromoCode(code.trim());

    if (!result.valid) {
      return sendSuccess(res, {
        valid: false,
        error: result.error,
      });
    }

    // Return promo code details without exposing sensitive info
    const promoData = result.code!;
    return sendSuccess(res, {
      valid: true,
      code: {
        _id: promoData._id,
        code: promoData.code,
        discountType: promoData.discountType,
        discountValue: promoData.discountValue,
        minOrderAmount: promoData.minOrderAmount,
        maxDiscount: promoData.maxDiscount,
      },
    });
  } catch (error) {
    console.error('Promo validation error:', error);
    return sendSuccess(res, {
      valid: false,
      error: 'Failed to validate promo code',
    });
  }
};

export const calculateDiscount = async (req: Request, res: Response) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code || typeof code !== 'string' || !orderAmount || typeof orderAmount !== 'number') {
      return sendSuccess(res, {
        valid: false,
        error: 'Promo code and order amount are required',
      });
    }

    const validation = await promoService.validatePromoCode(code.trim());

    if (!validation.valid) {
      return sendSuccess(res, {
        valid: false,
        error: validation.error,
      });
    }

    const discount = promoService.calculateDiscount(validation.code!, orderAmount);

    return sendSuccess(res, {
      valid: true,
      discountAmount: discount.discountAmount,
      finalAmount: discount.finalAmount,
    });
  } catch (error: any) {
    console.error('Discount calculation error:', error);
    return sendSuccess(res, {
      valid: false,
      error: error.message || 'Failed to calculate discount',
    });
  }
};
