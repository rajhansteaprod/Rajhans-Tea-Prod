/**
 * DataForSEO adapter configuration — env-driven only. NEVER hardcode/log credentials.
 * `isConfigured()` is the single source of truth for capability availability
 * (refinement 6, carried into 4b.2): the market module works with zero providers,
 * and DataForSEO is registered but reports unconfigured until both env vars are set.
 */
export const dataForSeoConfig = {
  // Getters (not evaluated-once fields): credentials/config must reflect env at
  // ACCESS time, not at module-import time — required for both correctness
  // (env may be set after import in some bootstraps) and testability.
  get login(): string {
    return process.env.DATAFORSEO_LOGIN || '';
  },
  get password(): string {
    return process.env.DATAFORSEO_PASSWORD || '';
  },
  get baseUrl(): string {
    return process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com';
  },

  isConfigured(): boolean {
    return !!dataForSeoConfig.login && !!dataForSeoConfig.password;
  },

  timeoutMs: Number(process.env.DATAFORSEO_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.DATAFORSEO_MAX_RETRIES || 2),

  /**
   * Batching (DataForSEO Labs Keyword Ideas): up to 200 seed keywords in ONE
   * task. Never issue one request per seed when the provider supports batching.
   */
  maxSeedsPerTask: Number(process.env.DATAFORSEO_MAX_SEEDS_PER_TASK || 200),

  /** Requested result cap per task. Provider max is 1000; keep the default
   * conservative — callers can raise it explicitly via DiscoverKeywordsOptions. */
  defaultResultLimit: Number(process.env.DATAFORSEO_DEFAULT_RESULT_LIMIT || 200),
  maxResultLimit: Number(process.env.DATAFORSEO_MAX_RESULT_LIMIT || 1000),

  /** Extra pages beyond the first (offset-based) — OFF by default; each page is
   * its own billed task and is budgeted individually via RunBudget. */
  maxPagesPerCall: Number(process.env.DATAFORSEO_MAX_PAGES_PER_CALL || 1),

  /** No paid SERP/clickstream enrichment in 4b.2 — always false here. */
  includeSerpInfo: false,
  includeClickstreamData: false,

  /** Optional, licence-respecting raw payload retention. Default OFF until
   * DataForSEO's account-tier retention terms are confirmed. */
  rawStorageAllowed: (process.env.DATAFORSEO_RAW_STORAGE_ALLOWED ?? 'false') === 'true',

  /** Initial market scope (approved): India / English. */
  defaultLocationCode: Number(process.env.DATAFORSEO_LOCATION_CODE || 2356),
  defaultLanguageCode: process.env.DATAFORSEO_LANGUAGE_CODE || 'en',
};
