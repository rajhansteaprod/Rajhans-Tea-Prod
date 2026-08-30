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

  /**
   * Real SERP evidence (4b.5). Per-run, in-memory only — no persistent TTL here
   * (a cross-run SERP cache is deferred until a real persistence phase exists).
   */
  serp: {
    /** Bounded concurrency for SERP fetches — DataForSEO Live SERP allows only
     * one task per call, so this bounds parallel HTTP calls, not batch size. */
    maxConcurrency: Number(process.env.MARKET_SERP_MAX_CONCURRENCY || 5),
    /** BOTH keywords in a pair need at least this many valid organic URLs, or
     * the pair's evidence is UNKNOWN (null), never a fabricated 0. */
    minValidOrganicResults: Number(process.env.MARKET_SERP_MIN_VALID_ORGANIC || 5),
  },

  /**
   * Opportunity scoring (4b.6). Raw importances, renormalized over whichever
   * components are applicable/known for a given opportunity — never required to
   * presum to 100 (same convention as clustering/mapping weights). serpDifficulty
   * and trendMomentum are reserved at 0: no organic-difficulty evidence or trend
   * provider exists yet.
   */
  opportunity: {
    weights: {
      searchDemand: 20,
      businessRelevance: 20,
      commercialValue: 12,
      gscVisibilityGap: 14,
      rankingProximity: 8,
      existingPageFit: 12, // B only
      contentGapStrength: 12, // C/D/E only
      effortInverse: 4,
      serpDifficulty: 0, // reserved — no organicDifficulty evidence yet
      trendMomentum: 0, // reserved — no trend provider
    },
    /** log10 saturation reference so a single huge-volume keyword can't dominate. */
    demandSaturationVolume: Number(process.env.MARKET_OPPORTUNITY_DEMAND_SATURATION || 5000),
    /** cannibalization risk haircut — a risk adjustment, not a scoring dimension. */
    cannibalizationPenaltyMultiplier: Number(process.env.MARKET_OPPORTUNITY_CANNIBALIZATION_PENALTY || 0.7),
    /** bumped whenever weights/formulas change — part of the evaluationSnapshot hash (4b.7). */
    scoringConfigVersion: process.env.MARKET_OPPORTUNITY_SCORING_VERSION || '4b.6-v1',
  },

  /**
   * Search Market Orchestrator (4b.7) — cadence, freshness, lock, and cost
   * defaults. FROZEN design; see the approved 4b.7 plan.
   */
  orchestrator: {
    lockHeartbeatIntervalSeconds: Number(process.env.MARKET_LOCK_HEARTBEAT_INTERVAL_SECONDS || 60),
    staleRunTimeoutMinutes: Number(process.env.MARKET_STALE_RUN_TIMEOUT_MINUTES || 60),
    pendingApprovalExpiryMinutes: Number(process.env.MARKET_PENDING_APPROVAL_EXPIRY_MINUTES || 1440),

    discoveryIntervalDays: Number(process.env.MARKET_DISCOVERY_INTERVAL_DAYS || 30),
    keywordFreshDays: Number(process.env.MARKET_KEYWORD_FRESH_DAYS || 30),
    keywordStaleMaxDays: Number(process.env.MARKET_KEYWORD_STALE_MAX_DAYS || 90),

    priorityMaxAgeDays: Number(process.env.MARKET_SERP_PRIORITY_MAX_AGE_DAYS || 7),
    broadMaxAgeDays: Number(process.env.MARKET_SERP_BROAD_MAX_AGE_DAYS || 30),
    serpStaleMaxAgeDays: Number(process.env.MARKET_SERP_STALE_MAX_AGE_DAYS || 60),

    maxSerpCallsPerRun: Number(process.env.MARKET_MAX_SERP_CALLS_PER_RUN || 30),
    clusterMatchThreshold: Number(process.env.MARKET_CLUSTER_MATCH_THRESHOLD || 0.5),
    /** Additive (4b.7 completion pass): a no-SERP pairwise combinedScore within
     * this distance of `clustering.minEdgeScore` is "borderline" — worth a
     * paid SERP request to see if real evidence pushes it over/under the
     * threshold. Does not touch minEdgeScore itself or any clustering weight. */
    borderlineClusteringBandWidth: Number(process.env.MARKET_BORDERLINE_CLUSTERING_BAND_WIDTH || 0.1),

    monthlySoftCeilingUsd: Number(process.env.MARKET_ORCHESTRATOR_MONTHLY_SOFT_CEILING_USD || 2),
  },
};
