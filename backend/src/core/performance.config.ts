/**
 * Performance configuration — tune for production.
 *
 * These values are optimized for 10k+ concurrent users.
 */

export const PERFORMANCE = {
  // ─── MongoDB ──────────────────────────────────────────────────────────────
  mongo: {
    // Connection pool: 10 per CPU core, min 10, max 100
    poolSize: Math.max(10, Math.min(100, require('os').cpus().length * 10)),
    // Server selection timeout: 5s (fail fast if replica unavailable)
    serverSelectionTimeoutMS: 5000,
    // Socket timeout: 45s
    socketTimeoutMS: 45000,
  },

  // ─── Redis ────────────────────────────────────────────────────────────────
  redis: {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    commandTimeout: 3000,
  },

  // ─── HTTP Cache TTLs (seconds) ────────────────────────────────────────────
  cache: {
    categories: 300,          // 5 min — rarely changes
    collections: 300,         // 5 min
    productList: 120,         // 2 min — changes with stock
    productDetail: 60,        // 1 min
    search: 60,               // 1 min — already cached in SearchCacheService
    homeFeed: 120,            // 2 min
    trending: 300,            // 5 min
    activeCampaigns: 300,     // 5 min
  },

  // ─── Request Limits ───────────────────────────────────────────────────────
  request: {
    timeout: 30000,           // 30s max per request
    maxBodySize: '10mb',      // already set in app.ts
    maxFileSize: 5 * 1024 * 1024,  // 5MB upload limit
  },

  // ─── Rate Limiting ────────────────────────────────────────────────────────
  rateLimit: {
    global: { windowMs: 60000, max: 100 },    // 100 req/min (already configured)
    auth: { windowMs: 60000, max: 10 },       // 10 auth req/min
    search: { windowMs: 60000, max: 60 },     // 60 search/min
    api: { windowMs: 60000, max: 200 },       // 200 api/min for authenticated
  },

  // ─── BullMQ ───────────────────────────────────────────────────────────────
  bullmq: {
    defaultAttempts: 3,
    defaultBackoff: { type: 'exponential' as const, delay: 5000 },
    concurrency: {
      payment: 5,
      invoice: 2,
      wallet: 1,
      fulfillment: 3,
      promotions: 3,
      personalization: 5,
      reviews: 3,
      notifications: 5,
    },
  },
} as const;
