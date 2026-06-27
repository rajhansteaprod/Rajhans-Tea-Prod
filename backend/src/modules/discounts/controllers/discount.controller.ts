import { Request, Response } from 'express';
import { DiscountService } from '../services/discount.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../../utils/api-response';
import { BadRequestError } from '../../../utils/api-error';

const discountService = new DiscountService();

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code, cartTotal } = req.body;
    if (!code || !cartTotal) {
      throw new BadRequestError('Code and cart total required');
    }
    const result = await discountService.validatePromoCode(code, cartTotal);
    sendSuccess(res, {
      valid: result.valid,
      discountAmount: result.discountAmount || 0,
      message: result.message,
    });
  } catch (error) {
    console.error('Promo validation error:', error);
    sendSuccess(res, { valid: false, message: 'Error validating code' });
  }
};

export const getApplicableOffers = async (req: Request, res: Response) => {
  try {
    const { cartTotal } = req.query;
    if (!cartTotal) {
      return sendSuccess(res, []);
    }
    const totalAmount = parseFloat(cartTotal as string);
    const offers = await (discountService as any).repo.findActiveOffers(totalAmount);
    return sendSuccess(
      res,
      offers.map((offer: any) => ({
        _id: offer._id,
        code: offer.code,
        title: offer.title,
        type: offer.type,
        description: offer.description,
        valueType: offer.valueType,
        value: offer.value,
        maxCap: offer.maxCap,
        minOrderAmount: offer.minOrderAmount,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        isActive: offer.isActive,
      })),
    );
  } catch (error) {
    console.error('Offers error:', error);
    return sendSuccess(res, []);
  }
};

export const getDiscountForCart = async (req: Request, res: Response) => {
  try {
    const { cartTotal, promoCode } = req.body;
    if (!cartTotal) {
      throw new BadRequestError('Cart total required');
    }
    const applied = await discountService.applyDiscount(cartTotal, promoCode);
    sendSuccess(res, applied);
  } catch (error) {
    console.error('Discount error:', error);
    throw error;
  }
};

export const adminCreatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code, value, valueType, validFrom, validUntil } = req.body;

    // Validation
    if (!code || !code.trim()) throw new BadRequestError('Promo code is required');
    if (value === undefined || value === null) throw new BadRequestError('Discount value is required');
    if (!valueType) throw new BadRequestError('Discount type (percentage/fixed) is required');
    if (!validFrom) throw new BadRequestError('Valid from date is required');
    if (!validUntil) throw new BadRequestError('Valid until date is required');

    const promoCode = await discountService.createPromoCode(req.body, req.user!.userId);
    sendCreated(res, promoCode, 'Promo code created');
  } catch (error) {
    console.error('Create promo error:', error);
    throw error;
  }
};

export const adminCreateOffer = async (req: Request, res: Response) => {
  try {
    const { title, value, valueType, validFrom, validUntil } = req.body;

    // Validation
    if (!title || !title.trim()) throw new BadRequestError('Offer title is required');
    if (value === undefined || value === null) throw new BadRequestError('Discount value is required');
    if (!valueType) throw new BadRequestError('Discount type (percentage/fixed) is required');
    if (!validFrom) throw new BadRequestError('Valid from date is required');
    if (!validUntil) throw new BadRequestError('Valid until date is required');

    const offer = await discountService.createOffer(req.body, req.user!.userId);
    sendCreated(res, offer, 'Offer created');
  } catch (error) {
    console.error('Create offer error:', error);
    throw error;
  }
};

export const adminListDiscounts = async (req: Request, res: Response) => {
  try {
    const { page, limit, type, isActive } = req.query;
    const result = await discountService.getAll({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      type: typeof type === 'string' ? (type as 'promo_code' | 'offer') : undefined,
      isActive: isActive ? (isActive as string) === 'true' : undefined,
    });
    sendPaginated(
      res,
      result.discounts,
      {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.pages,
      },
      'Discounts',
    );
  } catch (error) {
    console.error('List discounts error:', error);
    throw error;
  }
};

export const adminGetDiscount = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : (req.params.id as string[])[0];
    const discount = await discountService.getById(id);
    sendSuccess(res, discount);
  } catch (error) {
    console.error('Get discount error:', error);
    throw error;
  }
};

export const adminUpdateDiscount = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : (req.params.id as string[])[0];
    const updated = await discountService.update(id, req.body);
    sendSuccess(res, updated, 'Discount updated');
  } catch (error) {
    console.error('Update discount error:', error);
    throw error;
  }
};

export const adminDeleteDiscount = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : (req.params.id as string[])[0];
    await discountService.delete(id);
    sendNoContent(res);
  } catch (error) {
    console.error('Delete discount error:', error);
    throw error;
  }
};
