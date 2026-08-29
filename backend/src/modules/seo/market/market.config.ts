/**
 * Phase 4b — Search Market Intelligence config. Env-driven; no vendor names, no
 * secrets. The MODULE existing (models/logic/tests) is separate from whether any
 * external PROVIDER is configured — see `market.enabled` vs provider availability
 * (resolved at runtime by the ProviderRegistry). A discovery run that needs a
 * provider capability is blocked with "provider capability unavailable", NOT by
 * disabling the whole module.
 */
export const marketConfig = {
  /** MARKET_INTELLIGENCE_ENABLED — the module is usable/testable with zero providers. */
  enabled: (process.env.MARKET_INTELLIGENCE_ENABLED ?? 'true') === 'true',

  /** Default market for discovery (India / English + Roman-script Hinglish). */
  defaultMarket: {
    country: process.env.MARKET_COUNTRY || 'IN',
    language: process.env.MARKET_LANGUAGE || 'en',
    currency: process.env.MARKET_CURRENCY || 'INR',
    device: (process.env.MARKET_DEVICE as 'desktop' | 'mobile' | 'all') || 'all',
  },

  /** Seed generation bounds — never explode combinations blindly. */
  seeds: {
    maxSeedsPerRun: Number(process.env.MARKET_MAX_SEEDS || 200),
    maxKeywordExpansionsPerSeed: Number(process.env.MARKET_MAX_EXPANSIONS || 50),
  },

  /** Freshness / retention. Raw payload TTL is separate from normalized retention. */
  ttl: {
    metricTtlDays: Number(process.env.MARKET_METRIC_TTL_DAYS || 30),
    rawRetentionDays: Number(process.env.MARKET_RAW_RETENTION_DAYS || 30),
  },

  /**
   * Agent SPENDING PERMISSION (USD) — distinct from any provider account balance.
   * Deterministic accounting period = the calendar month in UTC.
   */
  cost: {
    monthlyHardCapUsd: Number(process.env.MARKET_MONTHLY_HARD_CAP_USD || 10),
    perRunHardCapUsd: Number(process.env.MARKET_PER_RUN_HARD_CAP_USD || 2),
    manualApprovalUsd: Number(process.env.MARKET_MANUAL_APPROVAL_USD || 0.5),
    /** When a provider cannot estimate cost: 'approve' → require manual approval; 'refuse' → block. */
    onUnknownCost: (process.env.MARKET_ON_UNKNOWN_COST as 'approve' | 'refuse') || 'approve',
  },
};
