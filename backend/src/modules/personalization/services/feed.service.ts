import { RecommendationService } from './recommendation.service';
import { MerchandisingRuleRepository } from '../repositories/merchandising-rule.repository';
import { BannerRepository } from '../repositories/banner.repository';
import { Product } from '../../catalog/models/product.model';
import { ProductDTO } from '../../catalog/dto';
import { RuleSection } from '../models/merchandising-rule.model';
import { getRedisClient } from '../../../loaders/redis.loader';

export class FeedService {
  private recoService = new RecommendationService();
  private ruleRepo = new MerchandisingRuleRepository();
  private bannerRepo = new BannerRepository();

  async getHomepageFeed(userId: string | null, sessionId: string) {
    const cacheKey = `feed:home:${userId || sessionId}`;
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* miss */ }

    const [banners, trending, recentlyViewed, recommended, newArrivals] = await Promise.all([
      this.bannerRepo.findActive(),
      this.getSectionProducts('trending', userId, sessionId),
      userId || sessionId ? this.recoService.getRecentlyViewed(userId, sessionId, 12) : Promise.resolve([]),
      userId ? this.recoService.getBasedOnOrders(userId, 12) : this.getSectionProducts('recommended', null, sessionId),
      this.getSectionProducts('new_arrivals', userId, sessionId),
    ]);

    const feed = {
      banners: banners.map((b) => ({
        _id: b._id, title: b.title, subtitle: b.subtitle, image: b.image, link: b.link,
      })),
      sections: [
        { key: 'trending', title: 'Trending Now', products: trending },
        ...(recentlyViewed.length > 0 ? [{ key: 'recently_viewed', title: 'Recently Viewed', products: recentlyViewed }] : []),
        { key: 'recommended', title: 'Recommended For You', products: recommended },
        { key: 'new_arrivals', title: 'New Arrivals', products: newArrivals },
      ],
    };

    try {
      await getRedisClient().set(cacheKey, JSON.stringify(feed), 'EX', 300);
    } catch { /* silent */ }

    return feed;
  }

  private async getSectionProducts(section: RuleSection, _userId: string | null, _sessionId: string) {
    // Check merchandising rules first
    const rules = await this.ruleRepo.getActiveForSection(section);

    for (const rule of rules) {
      if (rule.type === 'manual' && rule.pinnedProducts.length > 0) {
        const products = await Product.find({
          _id: { $in: rule.pinnedProducts },
          status: 'active',
        })
          .populate('category', 'name slug')
          .exec();
        return products.map((p) => ProductDTO.toView(p));
      }

      if (rule.type === 'automated' && rule.cachedProductIds.length > 0) {
        const products = await Product.find({
          _id: { $in: rule.cachedProductIds },
          status: 'active',
        })
          .populate('category', 'name slug')
          .exec();
        return products.map((p) => ProductDTO.toView(p));
      }
    }

    // Fallback defaults
    switch (section) {
      case 'trending':
        return this.recoService.getTrendingNow(12);
      case 'new_arrivals': {
        const products = await Product.find({ status: 'active' })
          .populate('category', 'name slug')
          .sort({ createdAt: -1 })
          .limit(12)
          .exec();
        return products.map((p) => ProductDTO.toView(p));
      }
      case 'recommended':
        return this.recoService.getTrendingNow(12);
      default:
        return [];
    }
  }
}
