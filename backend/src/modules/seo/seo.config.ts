/**
 * SEO audit configuration. Self-contained (reads its own env) so the engine can
 * be tuned without touching shared config. All values are read-only crawl knobs;
 * nothing here mutates production.
 */
export const seoConfig = {
  /** Crawl target — the PUBLIC origin, verified reachable from the backend. */
  baseUrl: (process.env.SEO_CRAWL_BASE_URL || 'https://rajhanstea.com').replace(/\/+$/, ''),

  /** Politeness / anti-hammering. */
  maxConcurrency: Number(process.env.SEO_MAX_CONCURRENCY || 4),
  perRequestDelayMs: Number(process.env.SEO_REQUEST_DELAY_MS || 250),

  /** Per-request timeout and retry policy for TRANSIENT failures only. */
  requestTimeoutMs: Number(process.env.SEO_REQUEST_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.SEO_MAX_RETRIES || 2),
  retryBaseDelayMs: Number(process.env.SEO_RETRY_BASE_DELAY_MS || 1000),

  /** Redirect handling — capture the chain manually, cap the hops. */
  maxRedirectHops: Number(process.env.SEO_MAX_REDIRECT_HOPS || 5),

  /** A chain longer than this is flagged (redirect-chain-long). */
  redirectChainWarnThreshold: 2,

  /**
   * Coverage guard: if fewer than this fraction of discovered URLs were fetched
   * successfully, the run is 'degraded' — it will NOT be used as a diff baseline
   * and will NOT resolve any issues (false-positive protection).
   */
  minCoverageRatio: Number(process.env.SEO_MIN_COVERAGE || 0.8),

  /** Description length advisory bounds (info-level). */
  descriptionMinLength: 50,
  descriptionMaxLength: 160,

  /** User-Agent so the crawl is identifiable in logs. */
  userAgent: 'RajhansTea-SEO-Auditor/1.0 (+read-only)',

  /**
   * "Important" routes that must always be inventoried and are expected to be in
   * the sitemap (drives important-url-missing-from-sitemap). Static, high-value
   * pages only — dynamic product/category/blog URLs come from the DB.
   */
  importantStaticPaths: [
    '/',
    '/products/',
    '/blog/',
    '/page/about-us/',
    '/page/shipping-policy/',
    '/page/terms-and-conditions/',
    '/page/return-refund-policy/',
  ],
};
