/**
 * Google Search Console (Phase 4a) configuration. Entirely env-driven — nothing
 * about the property or credentials is hardcoded. GSC is DISABLED unless both the
 * site URL and the service-account key are present, so the rest of the SEO system
 * is unaffected until it is provisioned.
 *
 * SECURITY: GSC_SA_KEY_BASE64 is the raw service-account private key. It is read
 * here only as an opaque string; it is decoded solely in memory by gsc.client to
 * sign a JWT, and is NEVER logged, persisted, or returned by any API.
 */
export const gscConfig = {
  /** Domain property identifier, e.g. `sc-domain:rajhanstea.com`. */
  siteUrl: process.env.GSC_SITE_URL || '',
  /** base64(service-account JSON). Decoded in memory only. */
  saKeyBase64: process.env.GSC_SA_KEY_BASE64 || '',

  /** Feature flag: on only when fully configured. */
  get enabled(): boolean {
    return !!(this.siteUrl && this.saKeyBase64);
  },

  // ── Google endpoints / scope (read-only) ──
  scope: 'https://www.googleapis.com/auth/webmasters.readonly',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  apiBase: 'https://searchconsole.googleapis.com/webmasters/v3',

  // ── Windows & pull sizing ──
  backfillDays: Number(process.env.GSC_BACKFILL_DAYS || 90),
  opportunityWindowDays: Number(process.env.GSC_OPPORTUNITY_WINDOW_DAYS || 28),
  /** GSC final-data lag: the most recent complete day is `today - dataLagDays`. */
  dataLagDays: Number(process.env.GSC_DATA_LAG_DAYS || 3),
  rowLimit: Number(process.env.GSC_ROW_LIMIT || 25000),
  maxRows: Number(process.env.GSC_MAX_ROWS || 200000), // hard safety cap on pagination
  requestTimeoutMs: Number(process.env.GSC_REQUEST_TIMEOUT_MS || 30000),
  maxRetries: Number(process.env.GSC_MAX_RETRIES || 3),
  retryBaseDelayMs: Number(process.env.GSC_RETRY_BASE_MS || 1000),

  /**
   * Analyzer-specific thresholds (per the approved refinements). One universal
   * MIN_IMPRESSIONS is deliberately avoided — each analyzer has its own floor.
   */
  thresholds: {
    lowCtrMinImpressions: Number(process.env.GSC_LOWCTR_MIN_IMPR || 100),
    lowCtrRatio: Number(process.env.GSC_LOWCTR_RATIO || 0.6), // ctr < expected × ratio
    strikingMinImpressions: Number(process.env.GSC_STRIKING_MIN_IMPR || 30),
    trendMinCombinedImpressions: Number(process.env.GSC_TREND_MIN_IMPR || 50),
    contentGapMinImpressions: Number(process.env.GSC_GAP_MIN_IMPR || 25),
    // suspected-query-cannibalization: require MEANINGFUL repeated competition.
    cannibalizationMinShare: Number(process.env.GSC_CANNIB_MIN_SHARE || 0.2), // secondary URL ≥ 20% of query impressions
    cannibalizationMinImpressions: Number(process.env.GSC_CANNIB_MIN_IMPR || 30),
    // trend deltas (latest complete window vs preceding complete window)
    declineImpressionsPct: Number(process.env.GSC_DECLINE_IMPR_PCT || 0.3),
    growthImpressionsPct: Number(process.env.GSC_GROWTH_IMPR_PCT || 0.5),
    positionDeclineDelta: Number(process.env.GSC_POS_DECLINE || 3),
  },

  /**
   * Demand priority boost. GSC demand may NUDGE an existing recommendation's
   * priority but is capped and never converts a low-severity technical
   * observation into a critical one — technical severity and growth-opportunity
   * priority stay conceptually distinct.
   */
  demandBoost: {
    enabled: (process.env.GSC_DEMAND_BOOST ?? 'true') === 'true',
    maxBonus: Number(process.env.GSC_DEMAND_MAX_BONUS || 20), // capped flat score add
    impressionsForMax: Number(process.env.GSC_DEMAND_IMPR_FOR_MAX || 1000),
    /** Priority may rise at most this many levels (low→med→high). */
    maxPriorityLift: Number(process.env.GSC_DEMAND_MAX_LIFT || 1),
  },

  /** Retention: keep daily metrics ≥ 24 months; 0 = never auto-delete. */
  retentionMonths: Number(process.env.GSC_RETENTION_MONTHS || 24),

  /** Generic hub pages a demandful query should NOT have to rank via (content-gap signal). */
  hubPaths: (process.env.GSC_HUB_PATHS || '/,/products/,/blog/').split(',').map((s) => s.trim()),
};
