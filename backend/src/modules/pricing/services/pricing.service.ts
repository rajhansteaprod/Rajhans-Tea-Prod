import { PricingRepository } from '../repositories/pricing.repository';
import { IPriceRuleDoc } from '../models/price-rule.model';
import { NotFoundError } from '../../../utils/api-error';
import { PromoCodeService } from '../../promo/services/promo.service';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PriceInput {
  productId: string;
  basePrice: number;
  categoryId?: string;
  collectionIds?: string[];
  qty?: number; // defaults to 1
  promoCode?: string; // optional promo code to apply
}

export interface PriceBreakdown {
  basePrice: number; // original product price
  qty: number; // quantity used for calculation
  appliedRule: string | null; // name of the rule that was applied
  discountPercent: number; // 0-100
  discountAmount: number; // absolute ₹ saved
  priceAfterDiscount: number; // basePrice - discountAmount
  taxRate: number; // % e.g. 18
  taxAmount: number; // ₹ amount of tax
  isInclusive: boolean; // is tax already included in price?
  finalPrice: number; // what the customer pays (rounded to 2dp)
  unitPrice: number; // finalPrice per unit
  totalPrice: number; // finalPrice * qty
  isOnSale: boolean; // true if any discount applied
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PricingService {
  private repo = new PricingRepository();
  private promoCodeService = new PromoCodeService();

  /**
   * Core pricing calculation — clean orchestration layer.
   * Steps:
   * 1. Calculate base price (rules)
   * 2. Apply promo code discount
   * 3. Apply offers (future)
   * 4. Apply tax
   * 5. Return complete breakdown
   */
  async calculate(input: PriceInput): Promise<PriceBreakdown> {
    const qty = Math.max(1, input.qty ?? 1);

    // Step 1: Calculate base price from rules
    const basePriceResult = await this.calculateBasePrice(input, qty);

    // Step 2: Apply promo code if provided
    const promoResult = input.promoCode
      ? await this.validateAndApplyPromoCode(input.promoCode, basePriceResult)
      : null;

    // Step 3: Apply offers (future enhancement)
    // const offersResult = await this.applyOffers(basePriceResult, promoResult);

    // Step 4: Apply tax
    const finalResult = await this.applyTax(input.categoryId, basePriceResult, promoResult, qty);

    return finalResult;
  }

  /**
   * Calculate base price using product rules (quantity tiers, percentage discounts, fixed prices).
   */
  private async calculateBasePrice(
    input: PriceInput,
    qty: number,
  ): Promise<{
    basePrice: number;
    appliedRule: string | null;
    discountPercent: number;
    discountAmount: number;
    priceAfterDiscount: number;
    finalBasePrice: number | null;
  }> {
    const rules = await this.repo.findActiveRulesForProduct({
      productId: input.productId,
      categoryId: input.categoryId,
      collectionIds: input.collectionIds,
    });

    const { discountPercent, appliedRule, finalBasePrice } = this.resolveRule(rules, input.basePrice, qty);

    const discountAmount = parseFloat(((input.basePrice * discountPercent) / 100).toFixed(2));
    const priceAfterDiscount = parseFloat((input.basePrice - discountAmount).toFixed(2));

    return {
      basePrice: input.basePrice,
      appliedRule,
      discountPercent,
      discountAmount,
      priceAfterDiscount,
      finalBasePrice,
    };
  }

  /**
   * Validate and apply promo code discount.
   * Throws error if promo code is invalid, returns discount if valid.
   */
  private async validateAndApplyPromoCode(
    promoCode: string,
    basePriceResult: Awaited<ReturnType<typeof this.calculateBasePrice>>,
  ): Promise<{ promoCode: string; promoDiscount: number } | null> {
    if (!promoCode || !promoCode.trim()) {
      return null;
    }

    // Validate promo code
    const validation = await this.promoCodeService.validatePromoCode(promoCode.trim());
    if (!validation.valid) {
      throw new Error(`Invalid promo code: ${validation.error}`);
    }

    // Calculate discount amount
    const discountCalc = this.promoCodeService.calculateDiscount(
      validation.code!,
      basePriceResult.priceAfterDiscount,
    );

    return {
      promoCode: promoCode.toUpperCase(),
      promoDiscount: discountCalc.discountAmount,
    };
  }

  /**
   * Apply tax to final price.
   * TODO: Can be extended with multiple tax rules in future.
   */
  private async applyTax(
    categoryId: string | undefined,
    basePriceResult: Awaited<ReturnType<typeof this.calculateBasePrice>>,
    promoResult: Awaited<ReturnType<typeof this.validateAndApplyPromoCode>>,
    qty: number,
  ): Promise<PriceBreakdown> {
    let priceBeforeTax = basePriceResult.priceAfterDiscount;

    // Apply promo discount if available
    if (promoResult) {
      priceBeforeTax = parseFloat((priceBeforeTax - promoResult.promoDiscount).toFixed(2));
    }

    // Override with fixed price if rule specifies it
    if (basePriceResult.finalBasePrice !== null) {
      priceBeforeTax = basePriceResult.finalBasePrice;
    }

    // Fetch and apply tax rule
    const taxRule = await this.repo.findTaxRuleForCategory(categoryId);
    const taxRate = taxRule?.rate ?? 0;
    const isInclusive = taxRule?.isInclusive ?? true;

    let taxAmount: number;
    let finalPrice: number;

    if (isInclusive) {
      taxAmount = parseFloat(
        (priceBeforeTax - priceBeforeTax / (1 + taxRate / 100)).toFixed(2),
      );
      finalPrice = priceBeforeTax;
    } else {
      taxAmount = parseFloat(((priceBeforeTax * taxRate) / 100).toFixed(2));
      finalPrice = parseFloat((priceBeforeTax + taxAmount).toFixed(2));
    }

    const unitPrice = parseFloat(finalPrice.toFixed(2));
    const totalPrice = parseFloat((unitPrice * qty).toFixed(2));

    return {
      basePrice: basePriceResult.basePrice,
      qty,
      appliedRule: basePriceResult.appliedRule,
      discountPercent: basePriceResult.discountPercent,
      discountAmount: basePriceResult.discountAmount + (promoResult?.promoDiscount ?? 0),
      priceAfterDiscount: priceBeforeTax,
      taxRate,
      taxAmount,
      isInclusive,
      finalPrice: unitPrice,
      unitPrice,
      totalPrice,
      isOnSale: basePriceResult.discountPercent > 0 || basePriceResult.finalBasePrice !== null || !!promoResult,
    };
  }

  /**
   * Resolve which rule wins and compute the effective discount.
   * Rules are already sorted by priority desc from the repository.
   */
  private resolveRule(
    rules: IPriceRuleDoc[],
    _basePrice: number,
    qty: number,
  ): { discountPercent: number; appliedRule: string | null; finalBasePrice: number | null } {
    for (const rule of rules) {
      if (rule.type === 'quantity_tier' && rule.tiers?.length) {
        const tier = this.matchTier(rule.tiers, qty);
        if (tier !== null) {
          return { discountPercent: tier, appliedRule: rule.name, finalBasePrice: null };
        }
      }

      if (rule.type === 'percentage' && rule.discountPercent != null) {
        return {
          discountPercent: rule.discountPercent,
          appliedRule: rule.name,
          finalBasePrice: null,
        };
      }

      if (rule.type === 'fixed_price' && rule.fixedPrice != null) {
        return {
          discountPercent: 0,
          appliedRule: rule.name,
          finalBasePrice: rule.fixedPrice,
        };
      }
    }

    return { discountPercent: 0, appliedRule: null, finalBasePrice: null };
  }

  /**
   * Match the correct tier for a given quantity.
   * Tiers example: [{ minQty:1, maxQty:2, discountPercent:0 },
   *                 { minQty:3, maxQty:5, discountPercent:10 },
   *                 { minQty:6, maxQty:null, discountPercent:20 }]
   */
  private matchTier(
    tiers: Array<{ minQty: number; maxQty: number | null; discountPercent: number }>,
    qty: number,
  ): number | null {
    for (const tier of tiers) {
      const withinMin = qty >= tier.minQty;
      const withinMax = tier.maxQty === null || qty <= tier.maxQty;
      if (withinMin && withinMax) {
        return tier.discountPercent;
      }
    }
    return null;
  }

  // ─── Admin CRUD: Price Rules ─────────────────────────────────────────────────

  async listRules() {
    return this.repo.findAllRules();
  }

  async getRuleById(id: string) {
    const rule = await this.repo.findRuleById(id);
    if (!rule) throw new NotFoundError('Price rule not found');
    return rule;
  }

  async createRule(data: Partial<IPriceRuleDoc>) {
    return this.repo.createRule(data);
  }

  async updateRule(id: string, data: Partial<IPriceRuleDoc>) {
    const rule = await this.repo.updateRule(id, data);
    if (!rule) throw new NotFoundError('Price rule not found');
    return rule;
  }

  async deleteRule(id: string) {
    await this.getRuleById(id);
    await this.repo.deleteRule(id);
  }

  // ─── Admin CRUD: Tax Rules ───────────────────────────────────────────────────

  async listTaxRules() {
    return this.repo.findAllTaxRules();
  }

  async getTaxRuleById(id: string) {
    const rule = await this.repo.findTaxRuleById(id);
    if (!rule) throw new NotFoundError('Tax rule not found');
    return rule;
  }

  async createTaxRule(data: Parameters<PricingRepository['createTaxRule']>[0]) {
    return this.repo.createTaxRule(data);
  }

  async updateTaxRule(id: string, data: Parameters<PricingRepository['updateTaxRule']>[1]) {
    const rule = await this.repo.updateTaxRule(id, data);
    if (!rule) throw new NotFoundError('Tax rule not found');
    return rule;
  }

  async deleteTaxRule(id: string) {
    await this.getTaxRuleById(id);
    await this.repo.deleteTaxRule(id);
  }
}
