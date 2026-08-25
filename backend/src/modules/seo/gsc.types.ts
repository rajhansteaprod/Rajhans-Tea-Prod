/** Shared Phase 4a (GSC) types. */

export type GscSyncTrigger = 'manual' | 'cron' | 'dry-run';
export type GscSyncStatus = 'running' | 'completed' | 'degraded' | 'failed';

export type OpportunityConfidence = 'low' | 'medium' | 'high';

export type OpportunityType =
  | 'high-impression-low-ctr'
  | 'striking-distance'
  | 'suspected-query-cannibalization'
  | 'declining-page'
  | 'growing-query'
  | 'content-gap';

/** One query×page row aggregated over the opportunity window. */
export interface QueryPageMetric {
  query: string;
  page: string;
  normalizedUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** One page rollup for a window (used for trend comparison). */
export interface PageWindowMetric {
  normalizedUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** What each URL contributes to a per-URL cross-reference join. */
export interface SeoJoinFacts {
  inSnapshot: boolean;
  title: string | null;
  wordCount: number;
  openIssueCheckIds: string[];
  openRecommendationIds: string[];
}

/**
 * A GSC-derived opportunity before it is persisted as a SeoRecommendation. Carries
 * fully reproducible evidence so any prioritization decision is explainable purely
 * from stored data.
 */
export interface OpportunityDraft {
  type: OpportunityType;
  /** Stable identity discriminator (e.g. `${normalizedUrl}::${query}`). */
  key: string;
  normalizedUrl: string;
  query: string | null;
  title: string;
  why: string;
  suggestedFix: string;
  confidence: OpportunityConfidence;
  /** Bounded 0..100 opportunity score (traffic-potential driven). */
  score: number;
  evidence: OpportunityEvidence;
}

export interface OpportunityEvidence {
  query?: string | null;
  page?: string;
  periodStart?: string;
  periodEnd?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  expectedCtr?: number;
  position?: number;
  positionBucket?: string;
  previousClicks?: number;
  previousImpressions?: number;
  previousCtr?: number;
  previousPosition?: number;
  trend?: 'up' | 'down' | 'flat';
  scoreComponents?: Record<string, number>;
  confidence?: OpportunityConfidence;
  /** For cannibalization: per-URL competition breakdown. */
  competingUrls?: { normalizedUrl: string; impressions: number; clicks: number; position: number; share: number }[];
  /** Cross-reference: existing technical debt on this URL that has real demand. */
  relatedIssueCheckIds?: string[];
  relatedRecommendationIds?: string[];
  [k: string]: unknown;
}
