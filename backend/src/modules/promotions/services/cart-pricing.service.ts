import { PromotionService, PromotionOptions, AdjustedSummary } from './promotion.service';
import { CheckoutService, CheckoutSummary } from '../../cart/services/checkout.service';

/**
 * Clean, extensible cart pricing function: validates/applies promo code, returns adjusted cart summary.
 * Future: Add offers, tax, and other order-level logic here.
 */
export class CartPricingService {
  private checkoutService = new CheckoutService();
  private promotionService = new PromotionService();

  /**
   * Calculate cart summary with promo code and future offers support.
   * @param sessionId Session or user session
   * @param items Optional cart items (for guest/preview)
   * @param options Promotion options (couponCode, userId, etc)
   */
  async calculateCartWithPromotions(
    sessionId: string,
    items?: any[],
    options: PromotionOptions = {}
  ): Promise<AdjustedSummary> {
    // 1. Build base cart summary (per-item pricing, tax, etc)
    const summary: CheckoutSummary = await this.checkoutService.getSummary(sessionId, items);

    // 2. Apply promo code, loyalty, and future offers
    const adjusted: AdjustedSummary = await this.promotionService.applyOrderDiscounts(summary, options);

    // 3. (Future) Add more offer/tax logic here

    return adjusted;
  }
}
