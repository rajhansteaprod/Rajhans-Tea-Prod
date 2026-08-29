/**
 * Phase 4b — Search Market Intelligence shared types (vendor-neutral).
 *
 * Design invariants baked into the types:
 *  - UNKNOWN ≠ 0: every provider-supplied metric is `T | null`; null means "not
 *    supplied / unknown", never zero.
 *  - Paid signals (cpc / paidCompetition*) are named apart from organic difficulty
 *    and may only feed commercial value — never SEO difficulty.
 *  - businessRelevance and commercialIntent are SEPARATE outputs.
 */

export interface Market {
  country: string; // 'IN'
  language: string; // 'en'
  currency?: string; // 'INR'
  device?: 'desktop' | 'mobile' | 'all';
  region?: string; // optional state/region
}

export type ProviderKind = 'keyword-demand' | 'serp' | 'trend' | 'gsc-performance';
export type ProviderId = string;

export interface ProviderOp {
  capability: ProviderKind;
  op: string; // e.g. 'discoverKeywords' | 'getMetrics' | 'getSerp'
  units: number; // e.g. keyword count / SERP lookups — used for cost estimation
}

/** Cost estimate. `unknown:true` (usd null) MUST NOT be treated as free. */
export interface CostEstimate {
  usd: number | null;
  unknown: boolean;
  detail?: string;
}

export interface SearchProvider {
  id: ProviderId;
  kind: ProviderKind;
  isConfigured(): boolean; // env-gated; false ⇒ capability unavailable
  estimateCost(op: ProviderOp): CostEstimate; // BEFORE any call
}

// ── Capability interfaces (adapters implemented in later sub-phases) ──
export interface KeywordDemandProvider extends SearchProvider {
  kind: 'keyword-demand';
  discoverKeywords(seed: string, market: Market): Promise<KeywordDemandResult[]>;
  getMetrics(keywords: string[], market: Market): Promise<KeywordMetrics[]>;
}
export interface SerpProvider extends SearchProvider {
  kind: 'serp';
  getSerp(keyword: string, market: Market): Promise<SerpResult>;
}
export interface TrendProvider extends SearchProvider {
  kind: 'trend';
  getInterest(keyword: string, market: Market): Promise<TrendSeries | null>;
}
export interface GscQueryProvider extends SearchProvider {
  kind: 'gsc-performance';
  getPerformance(keywords: string[]): Promise<GscOverlay[]>;
}

export type AnyProvider = KeywordDemandProvider | SerpProvider | TrendProvider | GscQueryProvider;

// ── Normalized provider payload shapes (null = UNKNOWN) ──
export interface KeywordDemandResult {
  keyword: string;
  sourceKeywordId?: string | null;
  /** Metrics embedded in the SAME discovery response, when the provider supplies
   * them (e.g. DataForSEO's keyword_ideas). Lets callers avoid an automatic
   * second paid getMetrics() call for every discovered keyword — refresh/backfill
   * remains an explicit, separate decision. null/absent = provider didn't embed it. */
  inlineMetrics?: KeywordMetrics | null;
}
export interface KeywordMetrics {
  keyword: string;
  searchVolume: number | null;
  volumeRange?: [number, number] | null;
  // PAID-advertiser signals — NEVER organic difficulty (see design §10a):
  cpc?: { value: number; currency: string } | null;
  paidCompetition?: 'low' | 'medium' | 'high' | null;
  paidCompetitionIndex?: number | null;
  trend?: 'rising' | 'flat' | 'declining' | null;
}
export interface SerpResult {
  keyword: string;
  topUrls: string[];
  topDomains: string[];
  resultTypes: string[]; // 'organic' | 'product' | 'video' | 'featured-snippet' ...
  features: string[];
  retrievedAt: string;
}
export interface TrendSeries {
  keyword: string;
  points: { date: string; interest: number }[];
}
export interface GscOverlay {
  keyword: string;
  normalizedUrl: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  state: 'NO_VISIBILITY' | 'EMERGING' | 'STRIKING_DISTANCE' | 'WINNING' | 'DECLINING' | 'UNKNOWN';
}

// ── Intent + lifecycle enums (used across 4b) ──
export type Intent =
  | 'TRANSACTIONAL'
  | 'COMMERCIAL_INVESTIGATION'
  | 'CATEGORY'
  | 'INFORMATIONAL'
  | 'HOW_TO'
  | 'COMPARISON'
  | 'NAVIGATIONAL'
  | 'PROBLEM_NEED';

export type OpportunityState =
  | 'discovered'
  | 'validated'
  | 'recommended'
  | 'accepted'
  | 'rejected'
  | 'targeted'
  | 'monitoring'
  | 'winning'
  | 'declining'
  | 'resolved';

// ── Business-relevance vs commercial-intent (separate outputs — refinement 1) ──
export type RelevanceBand = 'high' | 'medium' | 'low';
/** 'measured' = we found (weak or strong) evidence; 'insufficient' = no evidence at all. */
export type RelevanceConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface RelevanceComponent {
  dimension: string; // 'rajhansEntity' | 'region' | 'productType' | 'consumption' | 'attribute'
  term: string; // strongest matched term in that dimension
  weight: number; // that term's relevance strength
  source: 'taxonomy' | 'inventory';
}
export interface BusinessRelevanceResult {
  score: number; // 0..1
  band: RelevanceBand;
  confidence: RelevanceConfidence; // distinguishes low-with-evidence from insufficient-evidence
  components: RelevanceComponent[];
  reasons: string[];
}
export interface CommercialIntentResult {
  score: number; // 0..1 — INDEPENDENT of business relevance
  band: RelevanceBand;
  signals: string[]; // matched commercial terms/modifiers
}
export interface KeywordClassification {
  businessRelevance: BusinessRelevanceResult;
  commercialIntent: CommercialIntentResult;
  competitorBranded: boolean;
  targetingPolicy: 'ignore' | 'review' | 'comparison-potential' | null;
  hardNegative: boolean; // spam/adult/unrelated
  hardNegativeReason?: string;
}
