import mongoose from 'mongoose';
import { PriceRule, IPriceRuleDoc } from '../models/price-rule.model';
import { TaxRule, ITaxRuleDoc } from '../models/tax-rule.model';

export class PricingRepository {
  // ─── Price Rules ────────────────────────────────────────────────────────────

  async findAllRules(): Promise<IPriceRuleDoc[]> {
    return PriceRule.find().sort({ priority: -1, createdAt: -1 }).lean<IPriceRuleDoc[]>();
  }

  async findRuleById(id: string): Promise<IPriceRuleDoc | null> {
    return PriceRule.findById(id).lean<IPriceRuleDoc>();
  }

  /**
   * Find all active rules that apply to a product, ordered by priority desc.
   * Considers: global rules, category rules, collection rules, product-specific rules.
   */
  async findActiveRulesForProduct(opts: {
    productId: string;
    categoryId?: string;
    collectionIds?: string[];
  }): Promise<IPriceRuleDoc[]> {
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const or: any[] = [{ scope: 'global' }];

    or.push({ scope: 'product', productId: new mongoose.Types.ObjectId(opts.productId) });

    if (opts.categoryId) {
      or.push({ scope: 'category', categoryId: new mongoose.Types.ObjectId(opts.categoryId) });
    }

    if (opts.collectionIds?.length) {
      or.push({
        scope: 'collection',
        collectionId: {
          $in: opts.collectionIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      });
    }

    return PriceRule.find({
      isActive: true,
      $or: or,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ priority: -1 })
      .lean<IPriceRuleDoc[]>();
  }

  async createRule(data: Partial<IPriceRuleDoc>): Promise<IPriceRuleDoc> {
    const rule = new PriceRule(data);
    return rule.save();
  }

  async updateRule(id: string, data: Partial<IPriceRuleDoc>): Promise<IPriceRuleDoc | null> {
    return PriceRule.findByIdAndUpdate(id, { $set: data }, { new: true }).lean<IPriceRuleDoc>();
  }

  async deleteRule(id: string): Promise<void> {
    await PriceRule.findByIdAndDelete(id);
  }

  // ─── Tax Rules ──────────────────────────────────────────────────────────────

  async findAllTaxRules(): Promise<ITaxRuleDoc[]> {
    return TaxRule.find().sort({ createdAt: -1 }).lean<ITaxRuleDoc[]>();
  }

  async findTaxRuleById(id: string): Promise<ITaxRuleDoc | null> {
    return TaxRule.findById(id).lean<ITaxRuleDoc>();
  }

  /**
   * Find the most specific active tax rule for a category.
   * Falls back to global rule (categoryId = null) if no category-specific rule found.
   */
  async findTaxRuleForCategory(categoryId?: string): Promise<ITaxRuleDoc | null> {
    if (categoryId) {
      const specific = await TaxRule.findOne({
        categoryId: new mongoose.Types.ObjectId(categoryId),
        isActive: true,
      }).lean<ITaxRuleDoc>();
      if (specific) return specific;
    }
    // Fall back to global
    return TaxRule.findOne({ categoryId: null, isActive: true }).lean<ITaxRuleDoc>();
  }

  async createTaxRule(data: Partial<ITaxRuleDoc>): Promise<ITaxRuleDoc> {
    const rule = new TaxRule(data);
    return rule.save();
  }

  async updateTaxRule(id: string, data: Partial<ITaxRuleDoc>): Promise<ITaxRuleDoc | null> {
    return TaxRule.findByIdAndUpdate(id, { $set: data }, { new: true }).lean<ITaxRuleDoc>();
  }

  async deleteTaxRule(id: string): Promise<void> {
    await TaxRule.findByIdAndDelete(id);
  }
}
