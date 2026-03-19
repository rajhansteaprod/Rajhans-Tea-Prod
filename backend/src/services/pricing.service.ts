import { PricingRepository } from '../repositories/pricing.repository';
import { IPriceRuleDoc } from '../models/price-rule.model';
import { NotFoundError } from '../utils/api-error';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PriceInput {
  productId: string;
  basePrice: number;
  categoryId?: string;
  collectionIds?: string[];
  qty?: number; // defaults to 1
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

  /**
   * Core pricing calculation — fully decoupled from Product model.
   * Takes raw inputs (productId, basePrice, categoryId, collectionIds, qty)
   * and returns a complete price breakdown.
   */
  async calculate(input: PriceInput): Promise<PriceBreakdown> {
    const qty = Math.max(1, input.qty ?? 1);

    // 1. Fetch all applicable active rules ordered by priority
    const rules = await this.repo.findActiveRulesForProduct({
      productId: input.productId,
      categoryId: input.categoryId,
      collectionIds: input.collectionIds,
    });

    // 2. Pick the winning rule (highest priority first)
    const { discountPercent, appliedRule, finalBasePrice } = this.resolveRule(
      rules,
      input.basePrice,
      qty,
    );

    // 3. Compute discount
    const discountAmount = parseFloat(((input.basePrice * discountPercent) / 100).toFixed(2));
    const priceAfterDiscount = parseFloat((input.basePrice - discountAmount).toFixed(2));

    // 4. Fetch tax rule
    const taxRule = await this.repo.findTaxRuleForCategory(input.categoryId);
    const taxRate = taxRule?.rate ?? 0;
    const isInclusive = taxRule?.isInclusive ?? true;

    // 5. Compute tax
    let taxAmount: number;
    let finalPrice: number;

    if (isInclusive) {
      // Tax is already inside the price — extract it for display
      taxAmount = parseFloat(
        (priceAfterDiscount - priceAfterDiscount / (1 + taxRate / 100)).toFixed(2),
      );
      finalPrice = priceAfterDiscount;
    } else {
      // Tax is added on top
      taxAmount = parseFloat(((priceAfterDiscount * taxRate) / 100).toFixed(2));
      finalPrice = parseFloat((priceAfterDiscount + taxAmount).toFixed(2));
    }

    // Use fixedPrice override if rule type is fixed_price
    if (finalBasePrice !== null) {
      finalPrice = finalBasePrice;
    }

    const unitPrice = parseFloat(finalPrice.toFixed(2));
    const totalPrice = parseFloat((unitPrice * qty).toFixed(2));

    return {
      basePrice: input.basePrice,
      qty,
      appliedRule,
      discountPercent,
      discountAmount,
      priceAfterDiscount,
      taxRate,
      taxAmount,
      isInclusive,
      finalPrice: unitPrice,
      unitPrice,
      totalPrice,
      isOnSale: discountPercent > 0 || finalBasePrice !== null,
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
