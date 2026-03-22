import { getRedisClient } from '../../../loaders/redis.loader';

const METRICS_PREFIX = 'obs:';
const WINDOW_SECONDS = 3600; // 1 hour rolling window

/**
 * Lightweight metrics collector using Redis sorted sets.
 * Tracks API response times and error counts per endpoint.
 * No heavy dependency — just Redis ZADD/ZRANGEBYSCORE.
 */
export class MetricsCollector {
  /**
   * Record an API response. Called from middleware.
   */
  async recordRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      const now = Date.now();
      const endpoint = `${method} ${this.normalizePath(path)}`;

      // Store response time in sorted set (score = timestamp, member = duration:status)
      const key = `${METRICS_PREFIX}latency:${endpoint}`;
      await redis.zadd(key, now.toString(), `${now}:${durationMs}:${statusCode}`);
      await redis.expire(key, WINDOW_SECONDS);

      // Increment error count if 5xx
      if (statusCode >= 500) {
        const errKey = `${METRICS_PREFIX}errors:${endpoint}`;
        await redis.incr(errKey);
        await redis.expire(errKey, WINDOW_SECONDS);
      }

      // Increment total request count
      const countKey = `${METRICS_PREFIX}count:${endpoint}`;
      await redis.incr(countKey);
      await redis.expire(countKey, WINDOW_SECONDS);
    } catch {
      /* silent — metrics should never break the app */
    }
  }

  /**
   * Get latency percentiles for an endpoint (last 1 hour).
   */
  async getLatencyStats(
    endpoint: string,
  ): Promise<{ p50: number; p95: number; p99: number; avg: number; count: number }> {
    try {
      const redis = getRedisClient();
      const key = `${METRICS_PREFIX}latency:${endpoint}`;
      const windowStart = Date.now() - WINDOW_SECONDS * 1000;

      const entries = await redis.zrangebyscore(key, windowStart.toString(), '+inf');
      if (entries.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };

      const durations = entries.map((e) => parseInt(e.split(':')[1], 10)).sort((a, b) => a - b);
      const count = durations.length;

      return {
        p50: durations[Math.floor(count * 0.5)] || 0,
        p95: durations[Math.floor(count * 0.95)] || 0,
        p99: durations[Math.floor(count * 0.99)] || 0,
        avg: Math.round(durations.reduce((a, b) => a + b, 0) / count),
        count,
      };
    } catch {
      return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
    }
  }

  /**
   * Get overview of all endpoints: request count, error count, avg latency.
   */
  async getEndpointOverview(): Promise<
    {
      endpoint: string;
      requests: number;
      errors: number;
      avgLatencyMs: number;
    }[]
  > {
    try {
      const redis = getRedisClient();
      const countKeys = await redis.keys(`${METRICS_PREFIX}count:*`);
      const results: {
        endpoint: string;
        requests: number;
        errors: number;
        avgLatencyMs: number;
      }[] = [];

      for (const countKey of countKeys) {
        const endpoint = countKey.replace(`${METRICS_PREFIX}count:`, '');
        const requests = parseInt((await redis.get(countKey)) || '0', 10);
        const errors = parseInt(
          (await redis.get(`${METRICS_PREFIX}errors:${endpoint}`)) || '0',
          10,
        );

        const latency = await this.getLatencyStats(endpoint);

        results.push({ endpoint, requests, errors, avgLatencyMs: latency.avg });
      }

      results.sort((a, b) => b.requests - a.requests);
      return results.slice(0, 30);
    } catch {
      return [];
    }
  }

  /**
   * Get slowest endpoints (by p95 latency).
   */
  async getSlowestEndpoints(
    limit = 10,
  ): Promise<{ endpoint: string; p95: number; p99: number; avg: number }[]> {
    const overview = await this.getEndpointOverview();
    const withLatency: { endpoint: string; p95: number; p99: number; avg: number }[] = [];

    for (const ep of overview) {
      const stats = await this.getLatencyStats(ep.endpoint);
      if (stats.count > 0) {
        withLatency.push({ endpoint: ep.endpoint, p95: stats.p95, p99: stats.p99, avg: stats.avg });
      }
    }

    withLatency.sort((a, b) => b.p95 - a.p95);
    return withLatency.slice(0, limit);
  }

  /**
   * Get error rate summary.
   */
  async getErrorSummary(): Promise<{
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    topErrors: { endpoint: string; errors: number }[];
  }> {
    const overview = await this.getEndpointOverview();
    const totalRequests = overview.reduce((s, e) => s + e.requests, 0);
    const totalErrors = overview.reduce((s, e) => s + e.errors, 0);
    const errorRate = totalRequests > 0 ? +((totalErrors / totalRequests) * 100).toFixed(2) : 0;

    const topErrors = overview
      .filter((e) => e.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 10)
      .map((e) => ({ endpoint: e.endpoint, errors: e.errors }));

    return { totalRequests, totalErrors, errorRate, topErrors };
  }

  /**
   * Normalize path to group similar endpoints.
   * /api/v1/products/abc123 → /api/v1/products/:id
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/[a-f0-9]{24}/gi, '/:id') // MongoDB ObjectIds
      .replace(/\/\d+/g, '/:num') // numeric IDs
      .replace(/\?.*$/, ''); // strip query params
  }
}

// Singleton
export const metricsCollector = new MetricsCollector();
