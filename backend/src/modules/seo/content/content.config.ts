/**
 * Phase 6.1 — Content Opportunity & Page Analysis configuration.
 *
 * The overwhelming majority of the thresholds this phase needs ALREADY EXIST,
 * tuned and env-overridable, and are consumed by reference rather than
 * restated here:
 *
 *   gscConfig.thresholds.lowCtrMinImpressions / lowCtrRatio  → low-CTR gate
 *   gscConfig.thresholds.strikingMinImpressions              → striking distance
 *   gscConfig.thresholds.cannibalization{MinShare,MinImpressions}
 *   gsc.analyzers.expectedCtr() / positionBucket() / confidence()
 *   recoConfig.thinContentWordCount / thinContentExcludePatterns
 *   recoConfig.lowInboundThreshold                           → internal linking
 *   seoConfig.description{Min,Max}Length                     → description bounds
 *   PREFLIGHT_THRESHOLDS.renderedTitle{Min,Max}Length        → title bounds
 *   marketConfig.orchestrator.keyword{Fresh,StaleMax}Days    → market freshness
 *   gscConfig.hubPaths                                       → generic hubs
 *
 * Only genuinely NEW decisions live below, each with a stated deterministic
 * meaning and a boundary test.
 */
export const contentConfig = {
  /**
   * Beyond this age the latest completed audit run is reported as stale
   * evidence: `currentState` may describe a page that has since changed.
   * Analysis still runs (the snapshot is the only deterministic source of page
   * state) but records an `audit_run_stale` MissingEvidence entry. Chosen to be
   * a little over the weekly audit cadence, so an ordinary schedule never trips
   * it and a genuinely lapsed one always does.
   */
  maxAuditRunAgeDays: Number(process.env.SEO_CONTENT_MAX_AUDIT_AGE_DAYS || 14),

  /**
   * Page-level impression floor. Below this, a page's whole GSC footprint is
   * too small to reason about, so demand-dependent opportunities are suppressed
   * and the page falls through to 'insufficient-evidence'. Deliberately LOWER
   * than any per-analyzer floor (the lowest existing one is
   * `contentGapMinImpressions` = 25): this gate only removes pure noise, and
   * the existing per-analyzer thresholds remain the real bar.
   */
  minPageImpressions: Number(process.env.SEO_CONTENT_MIN_PAGE_IMPRESSIONS || 10),

  /**
   * Minimum taxonomy weight a term must carry before its absence from a page
   * can be reported as missing topical coverage. The taxonomy scores terms
   * 0..1 by relevance strength; 0.5 keeps genuinely defining terms (region
   * names at 0.95–1.0, 'ctc' at 1.0, 'chai' at 0.9, 'tea' at 0.6) and drops
   * weak modifiers whose absence means nothing.
   */
  minCoverageDimensionWeight: Number(process.env.SEO_CONTENT_MIN_COVERAGE_WEIGHT || 0.5),

  /**
   * A term is only a coverage candidate when real demand points at it. This is
   * the impression floor for the GSC query that supplies that demand — the
   * guardrail that stops "this phrase does not appear, therefore add it".
   */
  coverageMinQueryImpressions: Number(process.env.SEO_CONTENT_COVERAGE_MIN_IMPR || 25),

  /**
   * A page over this word count with no H2 at all has a genuinely flat
   * structure. Below it, the absence of sub-headings is normal (a short policy
   * page needs none), so no finding is raised. Anchored to the existing
   * thin-content bar so the two rules cannot contradict each other: a page is
   * either thin, or long enough to deserve sub-headings — never both.
   */
  headingStructureMinWords: Number(process.env.SEO_CONTENT_HEADING_MIN_WORDS || 250),

  /**
   * Bounds on what the analysis artifact persists. The artifact is a SUMMARY
   * with provenance, never a second copy of the GSC/market collections.
   */
  limits: {
    /** Impression-ranked queries retained per analysis. */
    maxQueriesPerAnalysis: Number(process.env.SEO_CONTENT_MAX_QUERIES || 25),
    /** Volume-ranked market keywords retained per analysis. */
    maxMarketKeywordsPerAnalysis: Number(process.env.SEO_CONTENT_MAX_KEYWORDS || 25),
    /** Coverage rows retained per analysis. */
    maxTopicCoverageEntries: Number(process.env.SEO_CONTENT_MAX_COVERAGE || 30),
    /** Evidence refs retained per opportunity. */
    maxEvidenceRefsPerOpportunity: Number(process.env.SEO_CONTENT_MAX_EVIDENCE_REFS || 10),
    /** Outbound link targets listed in currentState. */
    maxOutboundTargets: Number(process.env.SEO_CONTENT_MAX_OUTBOUND || 50),
  },

  /**
   * Retention. Analyses are keyed by (url, analyzerVersion, evidenceWindowKey),
   * so repeated runs inside one evidence window UPSERT rather than accumulate;
   * history grows only when the window or the analyzer version genuinely moves.
   * These caps bound it anyway.
   */
  retention: {
    /** Newest analyses kept per page, across all versions and windows. */
    maxAnalysesPerPage: Number(process.env.SEO_CONTENT_HISTORY_PER_PAGE || 12),
    /** Hard age cutoff. Matches gscConfig.retentionMonths. 0 = never delete. */
    retentionMonths: Number(process.env.SEO_CONTENT_RETENTION_MONTHS || 24),
  },
};

/**
 * Bumped whenever a detector, threshold or scoring rule changes in a way that
 * could alter the findings for identical inputs. It is part of the persistence
 * key, so a bump produces a NEW analysis row rather than silently rewriting
 * history — the same discipline as `marketConfig.opportunity.scoringConfigVersion`.
 */
export const ANALYZER_VERSION = '6.1.0-content-v3';
