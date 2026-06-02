import { SearchRepository, SearchParams } from '../repositories/search.repository';
import { SearchAnalyticsRepository } from '../repositories/search-analytics.repository';
import { SearchCacheService } from './search-cache.service';
import { ProductDTO } from '../../catalog/dto/product.dto';

export class SearchService {
  private searchRepo = new SearchRepository();
  private analyticsRepo = new SearchAnalyticsRepository();
  private cache = new SearchCacheService();

  async search(params: SearchParams, meta?: { userId?: string | null; sessionId?: string | null }) {
    // Check cache
    const cacheKey = { ...params };
    const cached = await this.cache.getSearchResult(cacheKey);
    if (cached) return JSON.parse(cached);

    // Run search
    const result = await this.searchRepo.search(params);

    // Transform products via DTO
    const response = {
      products: result.products.map((p) => ProductDTO.toPublic(p, p.variants as any)),
      meta: result.meta,
      facets: result.facets,
      query: params.q || '',
    };

    // Cache result
    await this.cache.setSearchResult(cacheKey, response);

    // Log analytics (fire-and-forget)
    this.analyticsRepo
      .log({
        query: params.q || '',
        resultCount: result.meta.total,
        filters: {
          categoryId: params.categoryId,
          collectionId: params.collectionId,
          priceMin: params.priceMin,
          priceMax: params.priceMax,
          inStock: params.inStock,
          tags: params.tags,
          sort: params.sort,
        },
        userId: meta?.userId,
        sessionId: meta?.sessionId,
      })
      .catch(() => {
        /* silent */
      });

    return response;
  }

  async autocomplete(query: string, limit = 8) {
    if (!query || query.trim().length === 0) return [];

    const cached = await this.cache.getAutocomplete(query);
    if (cached) return JSON.parse(cached);

    const suggestions = await this.searchRepo.autocomplete(query.trim(), limit);
    await this.cache.setAutocomplete(query, suggestions);

    return suggestions;
  }

  async getPopularSearches(limit = 10): Promise<string[]> {
    const cached = await this.cache.getPopular();
    if (cached) return JSON.parse(cached);

    const popular = await this.analyticsRepo.getPopularQueries(limit);
    const queries = popular.map((p) => p.query);
    await this.cache.setPopular(queries);

    return queries;
  }

  // ─── Admin Analytics ───────────────────────────────────────────────────────

  async getAnalyticsStats() {
    return this.analyticsRepo.getStats();
  }

  async getPopularQueries(limit = 20) {
    return this.analyticsRepo.getPopularQueries(limit);
  }

  async getZeroResultQueries(limit = 50) {
    return this.analyticsRepo.getZeroResultQueries(limit);
  }
}
