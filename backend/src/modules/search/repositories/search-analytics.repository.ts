import { SearchAnalytics } from '../models/search-analytics.model';
import { Types } from 'mongoose';

export class SearchAnalyticsRepository {
  async log(data: {
    query: string;
    resultCount: number;
    filters: Record<string, unknown>;
    userId?: string | null;
    sessionId?: string | null;
  }): Promise<void> {
    await SearchAnalytics.create({
      query: data.query,
      normalizedQuery: data.query.toLowerCase().trim(),
      resultCount: data.resultCount,
      filters: data.filters,
      userId: data.userId ? new Types.ObjectId(data.userId) : null,
      sessionId: data.sessionId || null,
    });
  }

  async getPopularQueries(limit = 20): Promise<{ query: string; count: number }[]> {
    return SearchAnalytics.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: '$normalizedQuery', count: { $sum: 1 }, query: { $first: '$query' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, query: 1, count: 1 } },
    ]).exec();
  }

  async getZeroResultQueries(limit = 50): Promise<{ query: string; count: number; lastSearched: Date }[]> {
    return SearchAnalytics.aggregate([
      { $match: { resultCount: 0, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: '$normalizedQuery', count: { $sum: 1 }, query: { $first: '$query' }, lastSearched: { $max: '$createdAt' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, query: 1, count: 1, lastSearched: 1 } },
    ]).exec();
  }

  async getStats(): Promise<{
    totalSearches: number;
    uniqueQueries: number;
    avgResults: number;
    zeroResultCount: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [stats] = await SearchAnalytics.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          uniqueQueries: { $addToSet: '$normalizedQuery' },
          avgResults: { $avg: '$resultCount' },
          zeroResultCount: { $sum: { $cond: [{ $eq: ['$resultCount', 0] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalSearches: 1,
          uniqueQueries: { $size: '$uniqueQueries' },
          avgResults: { $round: ['$avgResults', 1] },
          zeroResultCount: 1,
        },
      },
    ]).exec();

    return stats || { totalSearches: 0, uniqueQueries: 0, avgResults: 0, zeroResultCount: 0 };
  }
}
