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

/** Vendor-neutral discovery options — "limit" is a generic result cap concept
 * (most keyword-idea providers support one), never a DataForSEO-specific term. */
export interface DiscoverKeywordsOptions {
  limit?: number;
}

// ── Capability interfaces (adapters implemented in later sub-phases) ──
export interface KeywordDemandProvider extends SearchProvider {
  kind: 'keyword-demand';
  /**
   * `seeds` is a BATCH (vendor-neutral): most keyword-idea providers accept many
   * seed keywords in one call/task, and issuing one call per seed when the
   * provider supports batching wastes both cost and quota. Since no production
   * caller exists yet (4b is not integrated into any route/cron), the interface
   * takes the batch shape directly rather than bolting on a provider-specific
   * batch method alongside a single-seed one.
   */
  discoverKeywords(seeds: string[], market: Market, opts?: DiscoverKeywordsOptions): Promise<KeywordDemandResult[]>;
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

// ── Clustering (4b.3) — SERP evidence is vendor-neutral and provider-supplied.
// 4b.3 only CONSUMES this shape; it ships zero implementations. Absent/null is
// "not checked", never a fabricated 0. ──
export interface SerpPairEvidence {
  score: number; // 0..1 — degree of SERP overlap between two keywords
  sharedUrls?: string[];
  sharedDomains?: string[];
  reasons: string[];
}
export interface SerpOverlapProvider {
  /** Returns real evidence, or null if not computed/available for this pair — never fabricated. */
  getPairEvidence(normalizedKeywordA: string, normalizedKeywordB: string): SerpPairEvidence | null;
}

// ── URL mapping (4b.4) ──
/** No 'collection' — confirmed no live public Collection page exists (route
 * commented out in app.routes.ts). A collection-anchored cluster with no
 * matching page becomes D_NEW_LANDING, never a mapping to a non-existent URL. */
export type PageType = 'product' | 'category' | 'blog' | 'static' | 'home';

export type PageHealth = 'GOOD' | 'NEEDS_OPT' | 'UNKNOWN';

export interface PageCandidate {
  url: string;
  canonicalUrl: string;
  pageType: PageType;
  title: string | null;
  slug: string;
  indexable: boolean;
  anchors: string[]; // sorted — anchorTermsOf(title/name, taxonomy)
  normalizedTerms: string[]; // sorted — normalizeKeyword() tokens
  pageHealth: PageHealth; // derived ONCE by page-candidate.builder.ts; the mapper never reinterprets raw audit state
  healthReasons: string[];
  qualityFacts: { wordCount: number | null; hasSnapshot: boolean; openCriticalIssueCount: number }; // explainability only
}

/** 4b.4 deliberately narrower than the (unimplemented) GscOverlay.state: no
 * NO_VISIBILITY (would fabricate "confirmed zero" from mere row absence) and no
 * DECLINING (would require a genuine two-window per-candidate comparison this
 * phase does not build — safer to omit than to claim it). */
export type CandidateGscState = 'UNKNOWN' | 'EMERGING' | 'STRIKING_DISTANCE' | 'WINNING';

export interface CandidateGscEvidence {
  state: CandidateGscState;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
  matchedKeywords: string[];
  evidenceKnown: boolean;
}

/** Cluster-wide demand evidence (no candidate URL involved) — used ONLY for
 * D/E evidence sufficiency (§3), never as candidate-specific ranking evidence. */
export interface ClusterGscDemandEvidence {
  impressions: number | null;
  evidenceKnown: boolean;
  matchedKeywords: string[];
}

export type UrlMappingBucket =
  | 'A_EXISTING_GOOD'
  | 'B_EXISTING_NEEDS_OPT'
  | 'C_CONTENT_SUPPORT'
  | 'D_NEW_LANDING'
  | 'E_NEW_ARTICLE'
  | 'F_NOT_RELEVANT'
  | 'G_ALREADY_COVERED';

export interface UrlMappingAlternative {
  url: string;
  pageType: PageType;
  score: number;
  reason: string;
}

export interface UrlMapping {
  bucket: UrlMappingBucket;
  matchedUrl: string | null;
  matchedPageType: PageType | null;
  matchScore: number;
  confidence: number;
  reasons: string[];
  actionable: boolean;
  evidenceStatus: 'sufficient' | 'insufficient' | 'not-applicable'; // F/A/B are 'not-applicable' (evidence gate doesn't apply to them)
  whyExistingPageInsufficient?: string; // mandatory (non-empty) whenever bucket is C/D/E
  alternativeCandidates: UrlMappingAlternative[]; // capped, explainability only
  possibleCannibalizationRisk?: { competingClusterLabel: string; sharedUrl: string; reason: string };
}

// ── Mapping input contract (4b.4) — never mutates ClusterResult ──
export interface MappingKeywordEvidence {
  keywordId: string;
  keyword: string;
  normalizedKeyword: string;
  businessRelevance: BusinessRelevanceResult; // scoreBusinessRelevance() — NOT classifyKeyword()
  demand: { searchVolume: number | null; metricsKnown: boolean; source: string | null; capturedAt: string | null } | null;
}
