import { DiscountRepository } from '../repositories/discount.repository';
import { IDiscountDoc } from '../models/discount.model';
import { Types } from 'mongoose';

export interface ValidateDiscountResult {
  valid: boolean;
  discountId?: string;
  discountAmount?: number;
  message?: string;
}

export interface AppliedDiscount {
  type: 'promo_code' | 'offer' | null;
  discountId?: string;
  code?: string;
  title?: string;
  discountAmount: number;
  finalAmount: number;
  message: string;
}

export class DiscountService {
  private repo = new DiscountRepository();

  private validateDateAndStatus(discount: IDiscountDoc): string | null {
    if (!discount.isActive) return 'This discount is not active';
    const now = new Date();
    if (now < discount.validFrom) return 'This discount is not yet available';
    if (now > discount.validUntil) return 'This discount has expired';
    return null;
  }

  private validateUsageLimit(discount: IDiscountDoc): string | null {
    if (discount.usageLimit && discount.usedCount >= discount.usageLimit) {
      return 'This discount has reached its usage limit';
    }
    return null;
  }

  private validateMinOrder(discount: IDiscountDoc, orderTotal: number): string | null {
    if (orderTotal < discount.minOrderAmount) {
      return `Minimum order amount ₹${discount.minOrderAmount} required`;
    }
    return null;
  }

  private calculateDiscountAmount(discount: IDiscountDoc, orderTotal: number): number {
    let amount = 0;
    if (discount.valueType === 'percentage') {
      amount = (orderTotal * discount.value) / 100;
      if (discount.maxCap) {
        amount = Math.min(amount, discount.maxCap);
      }
    } else if (discount.valueType === 'fixed') {
      amount = Math.min(discount.value, orderTotal);
    }
    return Math.round(amount * 100) / 100;
  }

  async validatePromoCode(code: string, orderTotal: number): Promise<ValidateDiscountResult> {
    const discount = await this.repo.findByCode(code);
    if (!discount) return { valid: false, message: 'Invalid promo code' };

    const dateError = this.validateDateAndStatus(discount);
    if (dateError) return { valid: false, message: dateError };

    const usageError = this.validateUsageLimit(discount);
    if (usageError) return { valid: false, message: usageError };

    const minError = this.validateMinOrder(discount, orderTotal);
    if (minError) return { valid: false, message: minError };

    const discountAmount = this.calculateDiscountAmount(discount, orderTotal);
    return {
      valid: true,
      discountId: discount._id.toString(),
      discountAmount,
      message: `Promo code applied! Save ₹${discountAmount}`,
    };
  }

  async applyBestOffer(orderTotal: number): Promise<ValidateDiscountResult> {
    const offers = await this.repo.findActiveOffers(orderTotal);
    if (offers.length === 0) return { valid: false, message: 'No applicable offers' };

    const bestOffer = offers[0];
    const usageError = this.validateUsageLimit(bestOffer);
    if (usageError) {
      for (const offer of offers.slice(1)) {
        const nextError = this.validateUsageLimit(offer);
        if (!nextError) {
          const amount = this.calculateDiscountAmount(offer, orderTotal);
          return {
            valid: true,
            discountId: offer._id.toString(),
            discountAmount: amount,
            message: `Offer applied! Save ₹${amount}`,
          };
        }
      }
      return { valid: false, message: 'No applicable offers' };
    }

    const discountAmount = this.calculateDiscountAmount(bestOffer, orderTotal);
    return {
      valid: true,
      discountId: bestOffer._id.toString(),
      discountAmount,
      message: `Offer applied! Save ₹${discountAmount}`,
    };
  }

  async applyDiscount(orderTotal: number, promoCode?: string): Promise<AppliedDiscount> {
    if (promoCode && promoCode.trim()) {
      const validation = await this.validatePromoCode(promoCode, orderTotal);
      if (validation.valid) {
        const discountAmount = validation.discountAmount || 0;
        return {
          type: 'promo_code',
          discountId: validation.discountId,
          code: promoCode.toUpperCase(),
          discountAmount,
          finalAmount: orderTotal - discountAmount,
          message: `Promo code "${promoCode.toUpperCase()}" applied! Save ₹${discountAmount}`,
        };
      } else {
        return {
          type: null,
          discountAmount: 0,
          finalAmount: orderTotal,
          message: validation.message || 'Invalid promo code',
        };
      }
    }

    const offerValidation = await this.applyBestOffer(orderTotal);
    if (offerValidation.valid) {
      const discountAmount = offerValidation.discountAmount || 0;
      const offer = await this.repo.findById(offerValidation.discountId!);
      return {
        type: 'offer',
        discountId: offerValidation.discountId,
        title: offer?.title,
        discountAmount,
        finalAmount: orderTotal - discountAmount,
        message: `Special offer: ${offer?.title}! Save ₹${discountAmount}`,
      };
    }

    return {
      type: null,
      discountAmount: 0,
      finalAmount: orderTotal,
      message: 'No applicable discounts',
    };
  }

  async recordUsage(discountId: string): Promise<void> {
    await this.repo.incrementUsedCount(discountId);
  }

  async createPromoCode(
    data: {
      code: string;
      value: number;
      valueType: 'percentage' | 'fixed';
      maxCap?: number;
      minOrderAmount?: number;
      validFrom: Date;
      validUntil: Date;
      usageLimit?: number;
      description?: string;
    },
    adminUserId: string,
  ): Promise<IDiscountDoc> {
    if (!data.code) {
      throw new Error('Code is required');
    }
    return this.repo.create({
      ...data,
      code: data.code.toUpperCase(),
      type: 'promo_code',
      title: `Promo: ${data.code}`,
      isActive: true,
      usedCount: 0,
      createdBy: new Types.ObjectId(adminUserId),
    });
  }

  async createOffer(
    data: {
      title: string;
      value: number;
      valueType: 'percentage' | 'fixed';
      maxCap?: number;
      minOrderAmount?: number;
      validFrom: Date;
      validUntil: Date;
      description?: string;
    },
    adminUserId: string,
  ): Promise<IDiscountDoc> {
    return this.repo.create({
      ...data,
      type: 'offer',
      isActive: true,
      usedCount: 0,
      createdBy: new Types.ObjectId(adminUserId),
    });
  }

  async getAll(query: {
    page?: number;
    limit?: number;
    type?: 'promo_code' | 'offer';
    isActive?: boolean;
  } = {}): Promise<{ discounts: IDiscountDoc[]; total: number; page: number; limit: number; pages: number }> {
    const { discounts, total } = await this.repo.findAll(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    return {
      discounts,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getById(id: string): Promise<IDiscountDoc | null> {
    return this.repo.findById(id);
  }

  async update(id: string, data: Partial<IDiscountDoc>): Promise<IDiscountDoc | null> {
    return this.repo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
