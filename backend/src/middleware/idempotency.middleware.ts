import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../loaders/redis.loader';

const IDEM_TTL = 86400; // 24 hours
const IDEM_PREFIX = 'idem:';

/**
 * Request idempotency middleware.
 * Checks X-Idempotency-Key header on POST/PUT/PATCH requests.
 *
 * If key exists in Redis → return cached response (no side effects).
 * If key doesn't exist → proceed, cache response.
 *
 * Usage:
 *   router.post('/orders', idempotency(), controller.create);
 *   router.post('/payments/orders', idempotency(3600), controller.createOrder); // 1hr TTL
 *
 * Client sends:
 *   POST /api/v1/cart/items
 *   X-Idempotency-Key: <uuid>
 */
export function idempotency(ttlSeconds = IDEM_TTL) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only apply to mutation methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

    const key = req.headers['x-idempotency-key'] as string;
    if (!key) return next(); // No key = no idempotency check (opt-in)

    const cacheKey = `${IDEM_PREFIX}${key}`;

    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(parsed.statusCode || 200).json(parsed.body);
      }

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        // Cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const toCache = JSON.stringify({ statusCode: res.statusCode, body });
          redis.set(cacheKey, toCache, 'EX', ttlSeconds).catch(() => {/* silent */});
        }
        return originalJson(body);
      } as any;

      next();
    } catch {
      // Redis down → skip idempotency, serve normally
      next();
    }
  };
}
