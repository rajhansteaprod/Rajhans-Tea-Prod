import { LoyaltyRepository } from '../repositories/loyalty.repository';

export class LoyaltyService {
  private repo = new LoyaltyRepository();

  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: any) {
    return this.repo.updateSettings(data);
  }

  async getAccount(userId: string) {
    return this.repo.findOrCreateAccount(userId);
  }

  async getBalance(userId: string): Promise<number> {
    return this.repo.getBalance(userId);
  }

  async getHistory(userId: string, query: { page?: number; limit?: number } = {}) {
    return this.repo.getHistory(userId, query);
  }

  /**
   * Earn points after purchase.
   * Called by BullMQ worker after payment capture.
   */
  async earnFromPurchase(userId: string, orderTotal: number, paymentId: string): Promise<number> {
    const settings = await this.getSettings();
    if (!settings.isActive) return 0;

    const points = Math.floor(orderTotal / 100) * settings.earnRate;
    if (points <= 0) return 0;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + settings.expiryDays);

    await this.repo.earnPoints(
      userId,
      points,
      'purchase',
      paymentId,
      `Earned ${points} points for order ₹${orderTotal}`,
      expiresAt,
      `loyalty-earn-${paymentId}`,
    );

    return points;
  }

  /**
   * Calculate redemption value and validate.
   */
  async calculateRedemption(
    userId: string,
    pointsToRedeem: number,
    orderTotal: number,
  ): Promise<{ valid: boolean; points: number; discount: number; message: string }> {
    const settings = await this.getSettings();
    if (!settings.isActive) {
      return { valid: false, points: 0, discount: 0, message: 'Loyalty program is inactive' };
    }

    const balance = await this.getBalance(userId);
    if (pointsToRedeem > balance) {
      return { valid: false, points: 0, discount: 0, message: 'Insufficient points' };
    }

    if (pointsToRedeem < settings.minRedeemPoints) {
      return { valid: false, points: 0, discount: 0, message: `Minimum ${settings.minRedeemPoints} points required` };
    }

    const maxDiscount = (orderTotal * settings.maxRedeemPercent) / 100;
    let discount = (pointsToRedeem / 100) * settings.redeemRate;
    let actualPoints = pointsToRedeem;

    if (discount > maxDiscount) {
      discount = maxDiscount;
      actualPoints = Math.ceil((discount / settings.redeemRate) * 100);
    }

    discount = +discount.toFixed(2);

    return {
      valid: true,
      points: actualPoints,
      discount,
      message: `Redeem ${actualPoints} points for ₹${discount} off`,
    };
  }

  /**
   * Actually deduct points. Called during payment creation.
   */
  async redeemPoints(userId: string, points: number, paymentId: string): Promise<void> {
    await this.repo.redeemPoints(
      userId,
      points,
      paymentId,
      `Redeemed ${points} points`,
      `loyalty-redeem-${paymentId}`,
    );
  }

  /**
   * Revert redemption if payment fails.
   */
  async revertRedemption(userId: string, points: number, paymentId: string): Promise<void> {
    await this.repo.revertRedeem(userId, points, `loyalty-revert-${paymentId}`);
  }
}
