import { PromoCode, IPromoCode } from '../models/promo.model';
import { BadRequestError } from '../../../utils/api-error';

export interface PromoValidationResult {
  valid: boolean;
  code?: IPromoCode;
  error?: string;
}

export interface DiscountCalculation {
  discountAmount: number;
  finalAmount: number;
}

export class PromoCodeService {
  // Validate promo code and check if it can be used
  async validatePromoCode(code: string): Promise<PromoValidationResult> {
    if (!code || code.trim().length === 0) {
      return { valid: false, error: 'Promo code is required' };
    }

    const promo = await PromoCode.findOne({ code: code.toUpperCase() });

    if (!promo) {
      return { valid: false, error: 'Promo code not found' };
    }

    if (!promo.isActive) {
      return { valid: false, error: 'Promo code is inactive' };
    }

    if (new Date() > promo.expiresAt) {
      return { valid: false, error: 'Promo code has expired' };
    }

    if (promo.usedCount >= promo.maxUses) {
      return { valid: false, error: 'Promo code has reached max usage limit' };
    }

    return { valid: true, code: promo };
  }

  // Calculate discount amount based on promo code
  calculateDiscount(promo: IPromoCode, orderAmount: number): DiscountCalculation {
    // Check minimum order amount
    if (orderAmount < promo.minOrderAmount) {
      throw new BadRequestError(
        `Minimum order amount of ₹${promo.minOrderAmount} required for this promo code`,
      );
    }

    let discountAmount = 0;

    if (promo.discountType === 'percentage') {
      discountAmount = Math.floor((orderAmount * promo.discountValue) / 100);
      // Apply max discount cap if set
      if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
        discountAmount = promo.maxDiscount;
      }
    } else if (promo.discountType === 'fixed') {
      discountAmount = Math.min(promo.discountValue, orderAmount);
    }

    return {
      discountAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
    };
  }

  // Increment usage count after successful payment
  async incrementUsage(promoCodeId: string): Promise<void> {
    await PromoCode.findByIdAndUpdate(promoCodeId, { $inc: { usedCount: 1 } });
  }
}
