import crypto from 'crypto';
import { getRedisClient } from '../../../loaders/redis.loader';
import { logger } from '../../../utils/logger';

const SEARCH_TTL = 300;       // 5 minutes
const AUTOCOMPLETE_TTL = 600; // 10 minutes
const POPULAR_TTL = 3600;     // 1 hour

export class SearchCacheService {
  private hashKey(params: Record<string, unknown>): string {
    const str = JSON.stringify(params);
    return crypto.createHash('md5').update(str).digest('hex');
  }

  async getSearchResult(params: Record<string, unknown>): Promise<string | null> {
    try {
      const key = `search:${this.hashKey(params)}`;
      return await getRedisClient().get(key);
    } catch {
      return null;
    }
  }

  async setSearchResult(params: Record<string, unknown>, data: unknown): Promise<void> {
    try {
      const key = `search:${this.hashKey(params)}`;
      await getRedisClient().set(key, JSON.stringify(data), 'EX', SEARCH_TTL);
    } catch (err) {
      logger.warn({ err }, 'Failed to cache search result');
    }
  }

  async getAutocomplete(query: string): Promise<string | null> {
    try {
      return await getRedisClient().get(`autocomplete:${query.toLowerCase().trim()}`);
    } catch {
      return null;
    }
  }

  async setAutocomplete(query: string, data: unknown): Promise<void> {
    try {
      await getRedisClient().set(
        `autocomplete:${query.toLowerCase().trim()}`,
        JSON.stringify(data),
        'EX',
        AUTOCOMPLETE_TTL,
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to cache autocomplete');
    }
  }

  async getPopular(): Promise<string | null> {
    try {
      return await getRedisClient().get('search:popular');
    } catch {
      return null;
    }
  }

  async setPopular(data: unknown): Promise<void> {
    try {
      await getRedisClient().set('search:popular', JSON.stringify(data), 'EX', POPULAR_TTL);
    } catch (err) {
      logger.warn({ err }, 'Failed to cache popular searches');
    }
  }
}
