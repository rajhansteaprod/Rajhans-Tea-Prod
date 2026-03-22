import { CouponRepository } from '../repositories/coupon.repository';
import { NotFoundError } from '../../../utils/api-error';
import { CheckoutSummary } from '../../cart/services/checkout.service';

export interface CouponValidationResult {
  valid: boolean;
  couponId: string;
  code: string;
  discountAmount: number;
  message: string;
}

export class CouponService {
  private repo = new CouponRepository();

  async validate(
    code: string,
    summary: CheckoutSummary,
    userId: string | null,
  ): Promise<CouponValidationResult> {
    const coupon = await this.repo.findByCode(code);
    if (!coupon) return { valid: false, couponId: '', code, discountAmount: 0, message: 'Invalid coupon code' };
    if (!coupon.isActive) return { valid: false, couponId: '', code, discountAmount: 0, message: 'Coupon is inactive' };

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return { valid: false, couponId: '', code, discountAmount: 0, message: 'Coupon has expired' };
    }

    if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) {
      return { valid: false, couponId: '', code, discountAmount: 0, message: 'Coupon usage limit reached' };
    }

    if (userId) {
      const userUsage = await this.repo.getUserUsageCount(coupon._id.toString(), userId);
      if (userUsage >= coupon.usageLimitPerUser) {
        return { valid: false, couponId: '', code, discountAmount: 0, message: 'You have already used this coupon' };
      }
    }

    if (summary.total < coupon.minOrderAmount) {
      return {
        valid: false, couponId: '', code, discountAmount: 0,
        message: `Minimum order amount is ₹${coupon.minOrderAmount}`,
      };
    }

    // Scope check
    if (coupon.scope === 'products' && coupon.productIds.length > 0) {
      const cartProductIds = summary.items.map((i) => i.productId);
      const hasMatch = coupon.productIds.some((pid) => cartProductIds.includes(pid.toString()));
      if (!hasMatch) {
        return { valid: false, couponId: '', code, discountAmount: 0, message: 'Coupon not applicable to items in cart' };
      }
    }

    if (coupon.scope === 'categories' && coupon.categoryIds.length > 0) {
      // Simplified — would need category info from items. For now allow if scope is categories.
    }

    // Calculate discount
    let discountAmount: number;
    if (coupon.discountType === 'percentage') {
      discountAmount = (summary.total * coupon.discountValue) / 100;
      if (coupon.maxDiscountCap !== null) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountCap);
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, summary.total);
    }

    discountAmount = +discountAmount.toFixed(2);

    return {
      valid: true,
      couponId: coupon._id.toString(),
      code: coupon.code,
      discountAmount,
      message: `Coupon applied! You save ₹${discountAmount}`,
    };
  }

  async recordUsage(couponId: string, userId: string | null, sessionId: string, paymentId: string, discountApplied: number): Promise<void> {
    await this.repo.incrementUsedCount(couponId);
    await this.repo.recordUsage({
      couponId: couponId as any,
      userId: userId as any,
      sessionId,
      paymentId: paymentId as any,
      discountApplied,
    });
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  async create(data: any, adminUserId: string) {
    return this.repo.create({ ...data, createdBy: adminUserId as any });
  }

  async update(id: string, data: any) {
    const coupon = await this.repo.findById(id);
    if (!coupon) throw new NotFoundError('Coupon not found');
    return this.repo.update(id, data);
  }

  async getAll(query: { page?: number; limit?: number; isActive?: boolean } = {}) {
    return this.repo.findAll(query);
  }

  async delete(id: string) {
    const coupon = await this.repo.findById(id);
    if (!coupon) throw new NotFoundError('Coupon not found');
    await this.repo.delete(id);
  }
}
