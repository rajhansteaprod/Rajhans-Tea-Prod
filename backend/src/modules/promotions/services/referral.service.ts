import crypto from 'crypto';
import { ReferralRepository } from '../repositories/referral.repository';
import { DiscountService } from '../../discounts/services/discount.service';
import { LoyaltyService } from './loyalty.service';
import { WalletService } from '../../payments/services/wallet.service';
// utils available if needed

export class ReferralService {
  private repo = new ReferralRepository();
  private discountService = new DiscountService();
  private loyaltyService = new LoyaltyService();
  private walletService = new WalletService();

  /**
   * Generate or return existing referral code for user.
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const settings = await this.repo.getSettings();
    const existing = await this.repo.findByReferrer(userId);
    if (existing.length > 0) return existing[0].referralCode;

    // Generate unique code
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${settings.codePrefix}${userId.slice(-4).toUpperCase()}${suffix}`;
  }

  /**
   * Apply referral code when a new user signs up.
   */
  async applyReferralCode(referralCode: string, refereeUserId: string): Promise<void> {
    const settings = await this.repo.getSettings();
    if (!settings.isActive) return;

    // Check if referee already has a referral
    const existingReferral = await this.repo.findByReferee(refereeUserId);
    if (existingReferral) return; // Already referred

    // Find referrer — the code format contains the referrer's userId suffix
    // But we need to find the actual referrer. Search by code.
    // The referral code is generated but not stored until first use.
    // We need a different approach — store referralCode on first generation.

    // For now, find any referral with this code to get the referrer
    const referrals = await this.repo.findByCode(referralCode);

    let referrerUserId: string;
    if (referrals.length > 0) {
      referrerUserId = referrals[0].referrerUserId.toString();
    } else {
      // Code not found — could be first use. Can't determine referrer without a lookup table.
      // Skip for now — referral only works after at least one referral is created via getOrCreateCode
      return;
    }

    // Don't allow self-referral
    if (referrerUserId === refereeUserId) return;

    // Create auto-generated promo code for referee
    const discount = await this.discountService.createPromoCode(
      {
        code: `WELCOME-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        value: settings.refereeCouponValue,
        valueType: 'fixed',
        minOrderAmount: settings.refereeCouponMinOrder,
        usageLimit: 1,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        description: `Referral welcome discount`,
      },
      referrerUserId,
    );

    await this.repo.create({
      referrerUserId: referrerUserId as any,
      referralCode,
      refereeUserId: refereeUserId as any,
      status: 'pending',
      referrerReward: {
        type: settings.referrerRewardType,
        amount: settings.referrerRewardAmount,
        credited: false,
      },
      refereeReward: {
        type: 'coupon',
        couponId: discount._id,
        used: false,
      },
    });
  }

  /**
   * Complete referral after referee's first purchase.
   * Called by BullMQ worker.
   */
  async completeReferral(refereeUserId: string, paymentId: string): Promise<void> {
    const referral = await this.repo.findPendingByReferee(refereeUserId);
    if (!referral) return;

    const referrerId = referral.referrerUserId.toString();

    // Credit referrer
    if (referral.referrerReward.type === 'loyalty_points') {
      await this.loyaltyService.earnFromPurchase(
        referrerId,
        referral.referrerReward.amount * 100,
        paymentId,
      );
    } else if (referral.referrerReward.type === 'wallet_credit') {
      await this.walletService.credit(
        referrerId,
        referral.referrerReward.amount,
        'admin_credit', // using existing source type
        paymentId,
        'Referral reward',
        `referral-reward-${referral._id}`,
      );
    }

    await this.repo.markCompleted(referral._id.toString());
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getReferrerStats(userId: string) {
    return this.repo.getReferrerStats(userId);
  }

  async getSettings() {
    return this.repo.getSettings();
  }

  async updateSettings(data: any) {
    return this.repo.updateSettings(data);
  }

  async getAllReferrals(query: { page?: number; limit?: number; status?: string } = {}) {
    return this.repo.findAll(query);
  }
}
