import { Product } from '../../catalog/models/product.model';
import { ProductViewRepository } from '../repositories/product-view.repository';
import { CoPurchaseRepository } from '../repositories/co-purchase.repository';
import { ProductDTO } from '../../catalog/dto';
import { getRedisClient } from '../../../loaders/redis.loader';

export class RecommendationService {
  private viewRepo = new ProductViewRepository();
  private coPurchaseRepo = new CoPurchaseRepository();

  // ─── Frequently Bought Together ───────────────────────────────────────────

  async getFrequentlyBoughtTogether(productId: string, limit = 6) {
    const cached = await this.getCache(`reco:fbt:${productId}`);
    if (cached) return cached;

    const ids = await this.coPurchaseRepo.getFrequentlyBoughtTogether(productId, limit);
    const products = await this.hydrateProducts(ids);
    await this.setCache(`reco:fbt:${productId}`, products, 3600);
    return products;
  }

  // ─── Customers Also Viewed ────────────────────────────────────────────────

  async getCustomersAlsoViewed(productId: string, limit = 8) {
    const cached = await this.getCache(`reco:alsoViewed:${productId}`);
    if (cached) return cached;

    const ids = await this.viewRepo.getAlsoViewedProductIds(productId, limit);
    const products = await this.hydrateProducts(ids);
    await this.setCache(`reco:alsoViewed:${productId}`, products, 1800);
    return products;
  }

  // ─── Similar Products ─────────────────────────────────────────────────────

  async getSimilarProducts(productId: string, limit = 8) {
    const cached = await this.getCache(`reco:similar:${productId}`);
    if (cached) return cached;

    const source = await Product.findById(productId).exec();
    if (!source) return [];

    const products = await Product.find({
      _id: { $ne: productId },
      category: source.category,
      status: 'active',
    })
      .populate('category', 'name slug')
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    const views = products.map((p) => ProductDTO.toView(p));
    await this.setCache(`reco:similar:${productId}`, views, 3600);
    return views;
  }

  // ─── Recently Viewed ──────────────────────────────────────────────────────

  async getRecentlyViewed(userId: string | null, sessionId: string, limit = 12) {
    const ids = await this.viewRepo.getRecentlyViewed(userId, sessionId, limit);
    return this.hydrateProducts(ids);
  }

  // ─── Trending Now ─────────────────────────────────────────────────────────

  async getTrendingNow(limit = 12) {
    const cached = await this.getCache('reco:trending');
    if (cached) return cached;

    // Try Redis sorted set first
    let ids = await this.viewRepo.getTrendingFromRedis(limit);
    if (ids.length === 0) {
      ids = await this.viewRepo.getTrendingProductIds(7, limit);
    }

    // Fallback: featured products
    if (ids.length === 0) {
      const featured = await Product.find({ status: 'active', isFeatured: true })
        .populate('category', 'name slug')
        .limit(limit)
        .exec();
      const views = featured.map((p) => ProductDTO.toView(p));
      await this.setCache('reco:trending', views, 900);
      return views;
    }

    const products = await this.hydrateProducts(ids);
    await this.setCache('reco:trending', products, 900);
    return products;
  }

  // ─── Based on Your Orders ─────────────────────────────────────────────────

  async getBasedOnOrders(userId: string, limit = 12) {
    const cached = await this.getCache(`reco:forYou:${userId}`);
    if (cached) return cached;

    const { Order } = await import('../../inventory/models/order.model');
    const orders = await Order.find({
      userId,
      status: { $nin: ['cancelled', 'returned'] },
    })
      .select('items')
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    const purchasedIds = new Set<string>();
    for (const order of orders) {
      for (const item of order.items) purchasedIds.add(item.productId);
    }

    if (purchasedIds.size === 0) return this.getTrendingNow(limit);

    const allRecos = new Set<string>();
    for (const pid of purchasedIds) {
      const fbt = await this.coPurchaseRepo.getFrequentlyBoughtTogether(pid, 4);
      fbt.forEach((id) => { if (!purchasedIds.has(id)) allRecos.add(id); });
    }

    const ids = Array.from(allRecos).slice(0, limit);
    const products = ids.length > 0 ? await this.hydrateProducts(ids) : await this.getTrendingNow(limit);
    await this.setCache(`reco:forYou:${userId}`, products, 1800);
    return products;
  }

  // ─── Upsell ───────────────────────────────────────────────────────────────

  async getUpsellProducts(productId: string, limit = 4) {
    const source = await Product.findById(productId).exec();
    if (!source) return [];

    const products = await Product.find({
      _id: { $ne: productId },
      category: source.category,
      status: 'active',
      basePrice: { $gt: source.basePrice, $lt: source.basePrice * 2 },
    })
      .populate('category', 'name slug')
      .sort({ isFeatured: -1, basePrice: 1 })
      .limit(limit)
      .exec();

    return products.map((p) => ProductDTO.toView(p));
  }

  // ─── Cross-sell for Cart ──────────────────────────────────────────────────

  async getCrossSellForCart(productIds: string[], limit = 6) {
    const ids = await this.coPurchaseRepo.getCrossSellProducts(productIds, limit);
    return this.hydrateProducts(ids);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async hydrateProducts(ids: string[]) {
    if (ids.length === 0) return [];
    const products = await Product.find({ _id: { $in: ids }, status: 'active' })
      .populate('category', 'name slug')
      .exec();

    // Maintain order from ids
    const map = new Map(products.map((p) => [p._id.toString(), p]));
    return ids.map((id) => map.get(id)).filter(Boolean).map((p) => ProductDTO.toView(p!));
  }

  private async getCache(key: string): Promise<any | null> {
    try {
      const data = await getRedisClient().get(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  private async setCache(key: string, data: unknown, ttl: number): Promise<void> {
    try {
      await getRedisClient().set(key, JSON.stringify(data), 'EX', ttl);
    } catch { /* silent */ }
  }
}
