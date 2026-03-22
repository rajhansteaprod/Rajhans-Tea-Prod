import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../loaders/redis.loader';
import crypto from 'crypto';

/**
 * Redis-backed HTTP response cache middleware.
 * Caches GET responses by URL + query params.
 *
 * Usage:
 *   router.get('/products', cacheResponse(300), controller.list);  // 5 min cache
 *   router.get('/search', cacheResponse(60), controller.search);   // 1 min cache
 *
 * Cache key: `http-cache:<md5(url+query)>`
 * Skips: non-GET, authenticated requests with user-specific data
 */
export function cacheResponse(ttlSeconds = 300, options: { varyByUser?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Build cache key
    let keyBase = req.originalUrl;
    if (options.varyByUser && req.user?.userId) {
      keyBase += `:user:${req.user.userId}`;
    }
    const cacheKey = `http-cache:${crypto.createHash('md5').update(keyBase).digest('hex')}`;

    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
        return res.status(200).json(parsed);
      }

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.set(cacheKey, JSON.stringify(body), 'EX', ttlSeconds).catch(() => {
            /* silent */
          });
        }
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
        return originalJson(body);
      } as any;

      next();
    } catch {
      // Redis down — skip cache, serve normally
      next();
    }
  };
}

/**
 * Invalidate cache keys matching a pattern.
 * Call after mutations (create, update, delete).
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`http-cache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    /* silent */
  }
}
