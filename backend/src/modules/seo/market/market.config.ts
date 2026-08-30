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

  /**
   * Clustering (4b.3). Weights are RAW importances, not required to pre-sum to 1 —
   * the engine renormalizes over whichever signals are actually available for a
   * given pair (UNKNOWN/absent signals are excluded, never defaulted to 0). `serp`
   * is documented for 4b.5 forward-compatibility only: 4b.3 never supplies SERP
   * evidence, so that weight is inert until a real SerpOverlapProvider exists.
   */
  clustering: {
    weights: {
      lexical: Number(process.env.MARKET_CLUSTER_WEIGHT_LEXICAL || 0.25),
      entity: Number(process.env.MARKET_CLUSTER_WEIGHT_ENTITY || 0.45),
      modifier: Number(process.env.MARKET_CLUSTER_WEIGHT_MODIFIER || 0.15),
      intent: Number(process.env.MARKET_CLUSTER_WEIGHT_INTENT || 0.15),
      serp: Number(process.env.MARKET_CLUSTER_WEIGHT_SERP || 0.4),
    },
    /** Minimum combined score for a pair to be unioned — AND the anchor gate must also pass. */
    minEdgeScore: Number(process.env.MARKET_CLUSTER_MIN_EDGE_SCORE || 0.55),
    /** Post-hoc cap — never enforced by "stop while iterating" (would be input-order dependent). */
    maxClusterSize: Number(process.env.MARKET_MAX_CLUSTER_SIZE || 40),
    /** O(n²) pairwise-comparison safety valve; irrelevant at current run sizes (~200 keywords). */
    maxKeywordsPerRun: Number(process.env.MARKET_MAX_KEYWORDS_PER_CLUSTER_RUN || 500),
  },

  /**
   * URL mapping (4b.4). All thresholds are final per the approved plan — no
   * placeholders. `matchMinScore` matches 4b.3's `minEdgeScore` (one consistent
   * "real match" bar across the whole 4b pipeline); `gCoverageMinScore` is
   * deliberately HIGHER (G is a stronger claim than an ordinary A/B match).
   */
  mapping: {
    matchWeights: {
      anchor: Number(process.env.MARKET_MAPPING_WEIGHT_ANCHOR || 0.6),
      lexical: Number(process.env.MARKET_MAPPING_WEIGHT_LEXICAL || 0.4),
    },
    matchMinScore: Number(process.env.MARKET_MAPPING_MATCH_MIN_SCORE || 0.55),
    gCoverageMinScore: Number(process.env.MARKET_MAPPING_G_COVERAGE_MIN_SCORE || 0.7),
    minHealthyWordCount: Number(process.env.MARKET_MAPPING_MIN_HEALTHY_WORDCOUNT || 300),
    newPageMinSearchVolume: Number(process.env.MARKET_MAPPING_NEW_PAGE_MIN_VOLUME || 100),
    strongGscEvidenceMinImpressions: Number(process.env.MARKET_MAPPING_STRONG_GSC_MIN_IMPR || 50),
    maxAlternativeCandidates: Number(process.env.MARKET_MAPPING_MAX_ALTERNATIVES || 3),
  },
};
