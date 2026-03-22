import { MerchandisingRuleRepository } from '../repositories/merchandising-rule.repository';
import { BannerRepository } from '../repositories/banner.repository';
import { ProductViewRepository } from '../repositories/product-view.repository';
import { Product } from '../../catalog/models/product.model';
import { Order } from '../../inventory/models/order.model';
import { NotFoundError } from '../../../utils/api-error';
import { slugify } from '../../../utils/slugify';

export class MerchandisingService {
  private ruleRepo = new MerchandisingRuleRepository();
  private bannerRepo = new BannerRepository();
  private viewRepo = new ProductViewRepository();

  // ─── Rules CRUD ───────────────────────────────────────────────────────────

  async createRule(data: any) {
    if (!data.slug) data.slug = slugify(data.name);
    return this.ruleRepo.create(data);
  }

  async updateRule(id: string, data: any) {
    const rule = await this.ruleRepo.findById(id);
    if (!rule) throw new NotFoundError('Rule not found');
    return this.ruleRepo.update(id, data);
  }

  async deleteRule(id: string) {
    await this.ruleRepo.delete(id);
  }

  async listRules(query: { page?: number; limit?: number } = {}) {
    return this.ruleRepo.findAll(query);
  }

  // ─── Rule Evaluation ──────────────────────────────────────────────────────

  async evaluateRule(ruleId: string): Promise<string[]> {
    const rule = await this.ruleRepo.findById(ruleId);
    if (!rule || rule.type !== 'automated' || !rule.strategy) return [];

    const config = rule.strategyConfig || {};
    const limit = config.limit || 12;
    const lookbackDays = config.lookbackDays || 7;
    let productIds: string[] = [];

    switch (rule.strategy) {
      case 'top_selling': {
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const filter: Record<string, unknown> = {
          status: { $nin: ['cancelled', 'returned'] },
          createdAt: { $gte: since },
        };
        const result = await Order.aggregate([
          { $match: filter },
          { $unwind: '$items' },
          { $group: { _id: '$items.productId', totalQty: { $sum: '$items.qty' } } },
          { $sort: { totalQty: -1 } },
          { $limit: limit },
        ]).exec();
        productIds = result.map((r) => r._id);
        break;
      }
      case 'new_arrivals': {
        const products = await Product.find({ status: 'active' })
          .sort({ createdAt: -1 })
          .limit(limit)
          .select('_id')
          .exec();
        productIds = products.map((p) => p._id.toString());
        break;
      }
      case 'low_stock': {
        const minStock = config.minStock || 5;
        const products = await Product.find({
          status: 'active',
          trackInventory: true,
          stock: { $gt: 0, $lte: minStock },
        })
          .sort({ stock: 1 })
          .limit(limit)
          .select('_id')
          .exec();
        productIds = products.map((p) => p._id.toString());
        break;
      }
      case 'most_viewed': {
        productIds = await this.viewRepo.getTrendingProductIds(lookbackDays, limit);
        break;
      }
      case 'category_top': {
        if (!config.categoryId) break;
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const result = await Order.aggregate([
          { $match: { status: { $nin: ['cancelled', 'returned'] }, createdAt: { $gte: since } } },
          { $unwind: '$items' },
          { $group: { _id: '$items.productId', totalQty: { $sum: '$items.qty' } } },
          { $sort: { totalQty: -1 } },
          { $limit: limit * 3 }, // over-fetch, filter by category below
        ]).exec();

        const ids = result.map((r) => r._id);
        const products = await Product.find({
          _id: { $in: ids },
          category: config.categoryId,
          status: 'active',
        })
          .select('_id')
          .limit(limit)
          .exec();
        productIds = products.map((p) => p._id.toString());
        break;
      }
    }

    await this.ruleRepo.updateCachedProducts(ruleId, productIds);
    return productIds;
  }

  async evaluateAllRules(): Promise<number> {
    const rules = await this.ruleRepo.findAllAutomatedActive();
    let evaluated = 0;
    for (const rule of rules) {
      await this.evaluateRule(rule._id.toString());
      evaluated++;
    }
    return evaluated;
  }

  // ─── Banners CRUD ─────────────────────────────────────────────────────────

  async listBanners() {
    return this.bannerRepo.findAll();
  }
  async getActiveBanners() {
    return this.bannerRepo.findActive();
  }
  async createBanner(data: any) {
    return this.bannerRepo.create(data);
  }
  async updateBanner(id: string, data: any) {
    const banner = await this.bannerRepo.findById(id);
    if (!banner) throw new NotFoundError('Banner not found');
    return this.bannerRepo.update(id, data);
  }
  async deleteBanner(id: string) {
    await this.bannerRepo.delete(id);
  }
}
