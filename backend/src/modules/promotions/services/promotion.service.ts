import { DiscountService } from '../../discounts/services/discount.service';
import { LoyaltyService } from './loyalty.service';
import { CheckoutSummary } from '../../cart/services/checkout.service';

export interface PromotionOptions {
  couponCode?: string;
  redeemPoints?: number;
  userId?: string | null;
  sessionId?: string;
}

export interface AdjustedSummary extends CheckoutSummary {
  couponCode: string | null;
  couponDiscount: number;
  couponId: string | null;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
  adjustedTotal: number;
}

/**
 * Orchestrator — applies order-level discounts AFTER PricingEngine per-item calculation.
 * PricingEngine is NOT touched. This is a separate layer on top.
 */
export class PromotionService {
  private discountService = new DiscountService();
  private loyaltyService = new LoyaltyService();

  async applyOrderDiscounts(
    summary: CheckoutSummary,
    options: PromotionOptions = {},
  ): Promise<AdjustedSummary> {
    let couponDiscount = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;

    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscount = 0;

    // 1. Apply discount (if provided)
    if (options.couponCode) {
      const validation = await this.discountService.validatePromoCode(
        options.couponCode,
        summary.total,
      );

      if (validation.valid) {
        couponDiscount = validation.discountAmount || 0;
        couponId = validation.discountId || null;
        couponCode = options.couponCode.toUpperCase();
      }
    }

    // 2. Apply loyalty points (if user provided points to redeem)
    if (options.redeemPoints && options.redeemPoints > 0 && options.userId) {
      const orderAfterCoupon = summary.total - couponDiscount;
      const redemption = await this.loyaltyService.calculateRedemption(
        options.userId,
        options.redeemPoints,
        orderAfterCoupon,
      );

      if (redemption.valid) {
        loyaltyPointsRedeemed = redemption.points;
        loyaltyDiscount = redemption.discount;
      }
    }

    const adjustedTotal = Math.max(
      0,
      +(summary.total - couponDiscount - loyaltyDiscount).toFixed(2),
    );

    return {
      ...summary,
      couponCode,
      couponDiscount,
      couponId,
      loyaltyPointsRedeemed,
      loyaltyDiscount,
      adjustedTotal,
    };
  }

  /**
   * Validate discount only (for UI preview, no side effects).
   */
  async validateCoupon(code: string, summary: CheckoutSummary) {
    const validation = await this.discountService.validatePromoCode(code, summary.total);
    return {
      valid: validation.valid,
      couponId: validation.discountId || '',
      code: code.toUpperCase(),
      discountAmount: validation.discountAmount || 0,
      message: validation.message || '',
    };
  }
}
