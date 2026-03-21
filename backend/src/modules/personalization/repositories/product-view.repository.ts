import { Types } from 'mongoose';
import { ProductView } from '../models/product-view.model';
import { getRedisClient } from '../../../loaders/redis.loader';

export class ProductViewRepository {
  async logView(productId: string, userId: string | null, sessionId: string): Promise<void> {
    await ProductView.create({
      productId: new Types.ObjectId(productId),
      userId: userId ? new Types.ObjectId(userId) : null,
      sessionId,
    });
    // Increment real-time view counter in Redis
    try {
      await getRedisClient().zincrby('product:views:daily', 1, productId);
    } catch { /* silent */ }
  }

  async getRecentlyViewed(userId: string | null, sessionId: string, limit = 12): Promise<string[]> {
    const filter = userId
      ? { userId: new Types.ObjectId(userId) }
      : { sessionId };

    const views = await ProductView.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$productId', lastViewed: { $first: '$createdAt' } } },
      { $sort: { lastViewed: -1 } },
      { $limit: limit },
    ]).exec();

    return views.map((v) => v._id.toString());
  }

  async getTrendingProductIds(days = 7, limit = 12): Promise<string[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await ProductView.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$productId', viewCount: { $sum: 1 } } },
      { $sort: { viewCount: -1 } },
      { $limit: limit },
    ]).exec();
    return result.map((r) => r._id.toString());
  }

  async getAlsoViewedProductIds(productId: string, limit = 8): Promise<string[]> {
    const pid = new Types.ObjectId(productId);
    // Find sessions that viewed this product, then find other products those sessions viewed
    const result = await ProductView.aggregate([
      { $match: { productId: pid } },
      { $group: { _id: '$sessionId' } },
      { $limit: 500 }, // sample sessions
      {
        $lookup: {
          from: 'productviews',
          localField: '_id',
          foreignField: 'sessionId',
          as: 'views',
        },
      },
      { $unwind: '$views' },
      { $match: { 'views.productId': { $ne: pid } } },
      { $group: { _id: '$views.productId', score: { $sum: 1 } } },
      { $sort: { score: -1 } },
      { $limit: limit },
    ]).exec();
    return result.map((r) => r._id.toString());
  }

  async getTrendingFromRedis(limit = 12): Promise<string[]> {
    try {
      const results = await getRedisClient().zrevrange('product:views:daily', 0, limit - 1);
      return results;
    } catch {
      return [];
    }
  }
}
