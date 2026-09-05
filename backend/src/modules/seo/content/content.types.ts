import { OpportunityConfidence } from '../gsc.types';
import { FaqSignals, HeadingRef, RecommendationPriority } from '../seo.types';
import { Intent, PageType, RelevanceBand } from '../market/market.types';

/**
 * Phase 6.1 — Content Opportunity & Page Analysis shared types.
 *
 * Design invariants baked into the shapes below:
 *
 *  1. ANALYSIS ONLY. Nothing in this phase publishes, writes CMS/product/
 *     category content, executes a change, calls a paid provider, or calls an
 *     LLM. The output is evidence and findings, nothing else.
 *
 *  2. ONE confidence vocabulary. `evidenceStrength` is the EXISTING
 *     `OpportunityConfidence` ('low' | 'medium' | 'high') that the GSC and
 *     market subsystems already produce and the admin UI already renders — not
 *     a third parallel scale. `priority` is the existing
 *     `RecommendationPriority`.
 *
 *  3. UNKNOWN is never 0. Absent evidence is represented structurally, by a
 *     `known: false` block plus a `MissingEvidence` entry that names WHICH
 *     opportunity types the absence suppressed — so a reader can always tell
 *     "we looked and found nothing" from "we could not look".
 *
 *  4. Executability is DERIVED from real Phase 5 support, never assumed from a
 *     page type. See `PageExecutability`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The smallest defensible taxonomy the stored evidence can actually support.
 * Existing vocabulary is reused verbatim wherever a concept already has a name
 * in this codebase, so the same phenomenon is never called two things:
 *
 *   - 'high-impression-low-ctr', 'striking-distance' and
 *     'suspected-query-cannibalization' are the EXACT `gsc.types.OpportunityType`
 *     names, and are produced by re-running the existing analyzers page-scoped.
 *   - 'thin-content' is the EXACT existing `recommendationId` from
 *     recommendation.generators.ts.
 *
 * Deliberately ABSENT (per the approved audit):
 *   - `ranking_relevance_gap` — stored evidence cannot distinguish it from
 *     striking distance without competitor-content evidence this system does
 *     not hold. Folding it in beats inventing the distinction.
 *   - a second "query/page mismatch" concept — 'type-compatibility-mismatch'
 *     reuses url-mapper.ts's TYPE_COMPATIBILITY semantics, which is the one
 *     place intent↔page-type compatibility is defined.
 */
export type ContentOpportunityType =
  // ── GSC-derived (existing analyzers, re-projected page-first) ──
  | 'high-impression-low-ctr'
  | 'striking-distance'
  | 'suspected-query-cannibalization'
  // ── first-party page-state derived ──
  | 'thin-content'
  | 'metadata-opportunity'
  | 'heading-structure-opportunity'
  | 'internal-link-opportunity'
  // ── evidence-joined ──
  | 'missing-topic-coverage'
  | 'type-compatibility-mismatch'
  // ── terminal state; never emits a recommendation ──
  | 'insufficient-evidence';

// ─────────────────────────────────────────────────────────────────────────────
// Evidence provenance
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceSource = 'snapshot' | 'gsc' | 'market' | 'audit' | 'recommendation';

/**
 * Reuses the 4b.7 freshness vocabulary verbatim
 * (`evidence-freshness.service.ts`) rather than introducing a second one.
 * 'unknown' means "no timestamped evidence of this kind was found", which is
 * NOT the same as "the evidence says zero".
 */
export type EvidenceFreshness = 'fresh' | 'stale-but-usable' | 'too-old' | 'unknown';

/**
 * One provenanced fact an opportunity actually rests on. `facts` is
 * deliberately scalar-only: it bounds the persisted document naturally and
 * keeps the analysis artifact a summary, not a second copy of the GSC and
 * market collections.
 */
export interface EvidenceRef {
  source: EvidenceSource;
  /** The Mongo collection / module the fact came from, for traceability. */
  collection: string;
  /** Stable lookup key: a normalizedUrl, or `${normalizedUrl}::${query}`. */
  key: string;
  observedAt: Date | null;
  freshness: EvidenceFreshness;
  /** Human-readable one-liner, e.g. 'impr 412, pos 7.3, ctr 0.9% (exp 3.5%)'. */
  summary: string;
  facts: Record<string, string | number | boolean | null>;
}

export type MissingEvidenceReason =
  | 'gsc_not_configured'
  | 'gsc_no_rows_for_page'
  | 'no_audit_snapshot'
  | 'audit_run_stale'
  | 'page_structure_not_captured'
  | 'page_text_truncated'
  | 'market_no_mapped_keywords'
  | 'market_evidence_too_old'
  | 'serp_evidence_absent';

/**
 * An absence, recorded rather than silently defaulted. `suppressedOpportunityTypes`
 * is what makes this actionable: it states exactly which findings could NOT be
 * evaluated because of this gap.
 */
export interface MissingEvidence {
  source: EvidenceSource;
  reason: MissingEvidenceReason;
  suppressedOpportunityTypes: ContentOpportunityType[];
  detail: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Executability — derived from real Phase 5 capability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 'executable'          — Phase 5.3 resolves a live target for this URL today
 *                         and can write at least one of `supportedFields`.
 * 'recommendation_only' — a genuine, analysable page, but NO current Phase 5
 *                         executor supports its target type. The opportunity is
 *                         still real and still worth surfacing; applying it
 *                         needs a human (and, for product/category metadata, a
 *                         code or schema change). Phase 6.4 may widen this.
 * 'unsupported'         — the URL has the shape Phase 5 executes but no live
 *                         published target resolves behind it.
 */
export type ExecutabilityStatus = 'executable' | 'recommendation_only' | 'unsupported';

export interface PageExecutability {
  status: ExecutabilityStatus;
  /** Plain-language why, naming the real constraint — never a page-type guess. */
  reason: string;
  /** The exact fields Phase 5 could write for THIS page. Empty unless executable. */
  supportedFields: string[];
  /** The Phase 5 target type that resolved, when one did. */
  targetType: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembled evidence blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Which taxonomy dimension a page does or does not visibly address. */
export interface TopicCoverageEntry {
  /** 'region' | 'productType' | 'consumption' | 'attribute' | 'rajhansEntity' */
  dimension: string;
  term: string;
  covered: boolean;
  /** Where the term was found. null when `covered` is false. */
  foundIn: 'title' | 'heading' | 'body' | 'metaDescription' | null;
  /** Why this term was even considered — always a real demand signal. */
  demandSource: 'gsc-query' | 'market-keyword';
}

export interface PageContentState {
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  h1: string[];
  h2: string[];
  h3: string[];
  headingOutline: HeadingRef[];
  wordCount: number | null;
  contentHash: string | null;
  normalizedTextChars: number;
  /** Exact word count of the Phase 6.1 scoped normalized visible text. */
  visibleWordCount: number;
  normalizedTextTruncated: boolean;
  faqSignals: FaqSignals | null;
  canonical: string | null;
  robotsMeta: string | null;
  indexable: boolean;
  inSitemap: boolean;
  structuredDataTypes: string[];
  internalLinks: { outboundCount: number; inboundCount: number; outboundTargets: string[] };
  /**
   * False when the snapshot predates the Phase 6.1 extractor
   * (`extractorVersion === null`). Structure-dependent detectors MUST be
   * suppressed rather than reading absence as "no headings".
   */
  captureComplete: boolean;
  extractorVersion: string | null;
}

export interface PageQueryEvidence {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  /** From the shared CTR curve in gsc.analyzers.ts. */
  expectedCtr: number;
  positionBucket: string;
  /** Matched a Rajhans brand/entity term — excluded from CTR/mismatch logic. */
  branded: boolean;
  intents: { intent: Intent; confidence: number }[];
  /** Verbatim `queryPageEligibility()` verdict — why it did or did not qualify. */
  eligibleFor: string[];
  eligibilityReason: string;
}

export interface PageSearchPerformance {
  /** False ⇒ no GSC rows joined to this page. Totals stay null, never 0. */
  known: boolean;
  period: { start: string; end: string } | null;
  totals: { impressions: number; clicks: number; ctr: number; averagePosition: number } | null;
  /** Bounded, impression-ranked. `queryCount` reports the true total. */
  queries: PageQueryEvidence[];
  queryCount: number;
  queriesTruncated: boolean;
}

export interface PageMarketKeyword {
  keyword: string;
  normalizedKeyword: string;
  searchVolume: number | null;
  volumeKnown: boolean;
  businessRelevanceBand: RelevanceBand | null;
  commercialIntentBand: RelevanceBand | null;
  capturedAt: Date | null;
  freshness: EvidenceFreshness;
}

export interface PageMarketEvidence {
  known: boolean;
  freshness: EvidenceFreshness;
  keywords: PageMarketKeyword[];
  keywordCount: number;
  keywordsTruncated: boolean;
  clusters: { label: string; primaryIntent: Intent | null; stableClusterId: string | null; memberCount: number }[];
  /** Reference only — Phase 6.1 never fetches or refreshes a SERP. */
  serpSnapshotAt: Date | null;
  openMarketRecommendationIds: string[];
}

export interface PageExistingWork {
  openIssueCheckIds: string[];
  openRecommendations: { recommendationId: string; source: string; reviewStatus: string; priority: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Findings
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentOpportunity {
  type: ContentOpportunityType;
  priority: RecommendationPriority;
  /** The EXISTING low|medium|high vocabulary — see invariant 2 above. */
  evidenceStrength: OpportunityConfidence;
  /** States the numbers it used, so the finding is checkable without the code. */
  explanation: string;
  affectedQueries: string[];
  /** Never empty: an opportunity with no supporting evidence is not emitted. */
  evidence: EvidenceRef[];
  /** Stable identity for a future recommendation fingerprint. Carries no
   *  timestamp, score or window, so it is invariant across re-analysis. */
  discriminator: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The analysis artifact
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisEvidenceWindow {
  auditRunId: string | null;
  auditRunAt: Date | null;
  auditRunStatus: string | null;
  /** Content hash of the snapshot this analysis read — source-state identity. */
  snapshotContentHash: string | null;
  gscPeriodStart: string | null;
  gscPeriodEnd: string | null;
  marketEvidenceAt: Date | null;
}

export interface ContentPageAnalysis {
  // ── identity ──
  normalizedUrl: string;
  canonicalUrl: string;
  pageType: PageType;
  sourceRef: { model: string; documentId: string | null; slug: string };

  // ── provenance ──
  analyzerVersion: string;
  extractorVersion: string | null;
  analyzedAt: Date;
  /** Deterministic hash of every input. Same inputs ⇒ same hash ⇒ same findings. */
  inputsHash: string;
  /** Human-readable evidence-window identity; part of the persistence key. */
  evidenceWindowKey: string;
  evidenceWindow: AnalysisEvidenceWindow;

  // ── evidence ──
  currentState: PageContentState;
  searchPerformance: PageSearchPerformance;
  marketEvidence: PageMarketEvidence;
  existingWork: PageExistingWork;
  topicCoverage: TopicCoverageEntry[];

  // ── findings ──
  opportunities: ContentOpportunity[];
  missingEvidence: MissingEvidence[];
  executability: PageExecutability;
}

/** One eligible page plus the reason it is (or is not) analysable. */
export interface EligiblePage {
  normalizedUrl: string;
  canonicalUrl: string;
  pageType: PageType;
  slug: string;
  title: string | null;
  sourceModel: string;
  documentId: string | null;
  eligible: boolean;
  ineligibleReason: string | null;
}
