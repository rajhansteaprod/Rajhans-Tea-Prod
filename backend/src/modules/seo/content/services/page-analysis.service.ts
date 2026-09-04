import { createHash } from 'crypto';
import { ANALYZER_VERSION, contentConfig } from '../content.config';
import { ContentPageAnalysis, EligiblePage } from '../content.types';
import { loadPageStates } from './page-state.assembler';
import { buildSearchPerformance, loadGscEvidence } from './gsc-page-evidence';
import { loadMarketEvidence } from './market-page-evidence';
import { computeTopicCoverage, deriveCoverageCandidates } from './content-extraction';
import { detectOpportunities } from './opportunity-detectors';

/**
 * Phase 6.1 — the analysis orchestrator.
 *
 * Assemble stored evidence → run the pure detectors → build the versioned
 * artifact. This module owns SEQUENCING and PROVENANCE and nothing else: it
 * never re-derives a detector's logic, never fetches a page, never calls a paid
 * provider, and (in this commit) never writes anything at all.
 *
 * Determinism is the load-bearing property. `inputsHash` is a content-only hash
 * of everything the detectors saw, deliberately excluding `analyzedAt` and any
 * other clock reading, so two runs over the same evidence produce the same hash
 * and the same findings — which is what makes the artifact a trustworthy Phase 8
 * baseline rather than a diary entry.
 */

export interface AnalyzePagesOptions {
  /** Restrict to these canonical URLs. Narrows the batch; never widens eligibility. */
  urls?: string[];
  /** Restrict to a page type. */
  pageType?: string;
  /** Cap the number of pages analysed, applied after eligibility and ordering. */
  limit?: number;
  /** Injectable clock, so freshness and staleness are testable. */
  now?: Date;
}

export interface AnalyzeRunSummary {
  analyzerVersion: string;
  analyzedAt: Date;
  /** 'complete' when every selected page produced an analysis. */
  outcome: 'complete' | 'partial';
  /** Why the run is partial — a page that could not be assembled, etc. */
  degradationReasons: string[];
  pagesConsidered: number;
  pagesAnalysed: number;
  pagesSkipped: { normalizedUrl: string; reason: string }[];
  gscConfigured: boolean;
  gscPeriod: { start: string; end: string } | null;
  auditRun: { runId: string | null; runAt: Date | null; status: string | null; stale: boolean; ageDays: number | null };
}

export interface AnalyzeResult {
  summary: AnalyzeRunSummary;
  analyses: ContentPageAnalysis[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Key-sorted deep canonicalization, so an object's hash never depends on the
 * order its keys happened to be built in. Intentionally local rather than
 * imported from the 4b orchestrator: Phase 6.1 must not depend on a module that
 * can spend money, and its own safety tests enforce that.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * A content-only hash of every input the detectors consumed. Excludes
 * `analyzedAt` and every other clock reading BY CONSTRUCTION — identical
 * evidence hashes identically no matter when it was analysed.
 */
export function computeInputsHash(input: {
  normalizedUrl: string;
  analyzerVersion: string;
  extractorVersion: string | null;
  evidenceWindowKey: string;
  currentState: unknown;
  searchPerformance: unknown;
  marketEvidence: unknown;
  existingWork: unknown;
  topicCoverage: unknown;
}): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(input))).digest('hex');
}

/**
 * The evidence window's identity, and part of the persistence key. Human
 * readable on purpose: an operator can see at a glance which audit run and GSC
 * period an analysis rested on. Re-running against the same evidence produces
 * the same key and therefore upserts one row instead of accumulating.
 */
export function buildEvidenceWindowKey(input: {
  auditRunId: string | null;
  gscPeriodEnd: string | null;
  marketEvidenceAt: Date | null;
}): string {
  return [
    `run:${input.auditRunId ?? 'none'}`,
    `gsc:${input.gscPeriodEnd ?? 'none'}`,
    // Day granularity: a market capture is not meaningfully different within a
    // single day, and finer granularity would fragment the history pointlessly.
    `market:${input.marketEvidenceAt ? input.marketEvidenceAt.toISOString().slice(0, 10) : 'none'}`,
  ].join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

function selectPages(pages: EligiblePage[], opts: AnalyzePagesOptions): EligiblePage[] {
  let selected = pages.filter((p) => p.eligible);
  if (opts.pageType) selected = selected.filter((p) => p.pageType === opts.pageType);
  // Deterministic ordering, so `--limit` always takes the same pages.
  selected.sort((a, b) => a.pageType.localeCompare(b.pageType) || a.normalizedUrl.localeCompare(b.normalizedUrl));
  if (opts.limit && opts.limit > 0) selected = selected.slice(0, opts.limit);
  return selected;
}

/**
 * Analyse the selected pages IN MEMORY. Writes nothing — persistence is a
 * separate, explicitly-invoked step, so a dry run and a persisted run take the
 * same code path and can never disagree.
 */
export async function analyzePages(opts: AnalyzePagesOptions = {}): Promise<AnalyzeResult> {
  const now = opts.now ?? new Date();
  const degradationReasons: string[] = [];

  const bundle = await loadPageStates({ only: opts.urls, now });
  const selected = selectPages(bundle.pages, opts);
  const urls = selected.map((p) => p.normalizedUrl);

  const [gsc, market] = await Promise.all([loadGscEvidence(urls), loadMarketEvidence(urls, now)]);

  if (!gsc.configured) degradationReasons.push('Search Console is not provisioned; query evidence is unavailable.');
  if (!bundle.auditRun.runId) degradationReasons.push('No completed audit run exists; no page state could be read.');
  else if (bundle.auditRun.stale) {
    degradationReasons.push(
      `The latest completed audit run is ${bundle.auditRun.ageDays} days old (limit ${contentConfig.maxAuditRunAgeDays}).`,
    );
  }

  const analyses: ContentPageAnalysis[] = [];
  const pagesSkipped: { normalizedUrl: string; reason: string }[] = [];

  for (const page of selected) {
    const state = bundle.stateByUrl.get(page.normalizedUrl) ?? null;
    const normalizedText = bundle.normalizedTextByUrl.get(page.normalizedUrl) ?? '';
    const gscRows = gsc.rowsByUrl.get(page.normalizedUrl) ?? [];
    const marketEvidence = market.byUrl.get(page.normalizedUrl) ?? {
      known: false,
      freshness: 'unknown' as const,
      keywords: [],
      keywordCount: 0,
      keywordsTruncated: false,
      clusters: [],
      serpSnapshotAt: null,
      openMarketRecommendationIds: [],
    };
    const existingWork = bundle.existingWorkByUrl.get(page.normalizedUrl) ?? {
      openIssueCheckIds: [],
      openRecommendations: [],
    };
    const executability = bundle.executabilityByUrl.get(page.normalizedUrl);
    if (!executability) {
      // The assembler derives executability for every eligible page, so a gap
      // here means the page could not be assembled at all. Recorded as a real
      // degradation rather than analysed on partial inputs.
      pagesSkipped.push({ normalizedUrl: page.normalizedUrl, reason: 'page state could not be assembled' });
      degradationReasons.push(`${page.normalizedUrl}: page state could not be assembled.`);
      continue;
    }

    const searchPerformance = buildSearchPerformance(gscRows, gsc.period, bundle.taxonomy);

    // Coverage candidates come only from real demand — see content-extraction.
    const coverageCandidates = deriveCoverageCandidates(
      {
        queries: searchPerformance.queries.map((q) => ({ query: q.query, impressions: q.impressions })),
        marketKeywords: marketEvidence.keywords.map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume })),
      },
      bundle.taxonomy,
    );
    // Coverage is only meaningful when the page's text was actually captured.
    const topicCoverage =
      state && state.captureComplete ? computeTopicCoverage(state, coverageCandidates, normalizedText) : [];

    const { opportunities, missingEvidence } = detectOpportunities({
      page,
      state,
      normalizedText,
      searchPerformance,
      marketEvidence,
      existingWork,
      topicCoverage,
      coverageCandidates,
      gscRows,
      allGscRows: gsc.allRows,
      gscConfigured: gsc.configured,
      gscPeriod: gsc.period,
      auditRun: {
        runId: bundle.auditRun.runId ? String(bundle.auditRun.runId) : null,
        runAt: bundle.auditRun.runAt,
        stale: bundle.auditRun.stale,
        ageDays: bundle.auditRun.ageDays,
      },
      taxonomy: bundle.taxonomy,
    });

    const evidenceWindow = {
      auditRunId: bundle.auditRun.runId ? String(bundle.auditRun.runId) : null,
      auditRunAt: bundle.auditRun.runAt,
      auditRunStatus: bundle.auditRun.status,
      snapshotContentHash: bundle.contentHashByUrl.get(page.normalizedUrl) ?? null,
      gscPeriodStart: gsc.period?.start ?? null,
      gscPeriodEnd: gsc.period?.end ?? null,
      marketEvidenceAt: market.newestCaptureAt,
    };
    const evidenceWindowKey = buildEvidenceWindowKey({
      auditRunId: evidenceWindow.auditRunId,
      gscPeriodEnd: evidenceWindow.gscPeriodEnd,
      marketEvidenceAt: evidenceWindow.marketEvidenceAt,
    });

    analyses.push({
      normalizedUrl: page.normalizedUrl,
      canonicalUrl: page.canonicalUrl,
      pageType: page.pageType,
      sourceRef: { model: page.sourceModel, documentId: page.documentId, slug: page.slug },
      analyzerVersion: ANALYZER_VERSION,
      extractorVersion: state?.extractorVersion ?? null,
      analyzedAt: now,
      inputsHash: computeInputsHash({
        normalizedUrl: page.normalizedUrl,
        analyzerVersion: ANALYZER_VERSION,
        extractorVersion: state?.extractorVersion ?? null,
        evidenceWindowKey,
        currentState: state,
        searchPerformance,
        marketEvidence,
        existingWork,
        topicCoverage,
      }),
      evidenceWindowKey,
      evidenceWindow,
      currentState:
        state ??
        // No snapshot: an explicit "nothing observed" shell whose captureComplete
        // is false, never a fabricated healthy-looking state.
        {
          title: null,
          titleLength: null,
          metaDescription: null,
          metaDescriptionLength: null,
          h1: [],
          h2: [],
          h3: [],
          headingOutline: [],
          wordCount: null,
          contentHash: null,
          normalizedTextChars: 0,
          normalizedTextTruncated: false,
          faqSignals: null,
          canonical: null,
          robotsMeta: null,
          indexable: false,
          inSitemap: false,
          structuredDataTypes: [],
          internalLinks: { outboundCount: 0, inboundCount: 0, outboundTargets: [] },
          captureComplete: false,
          extractorVersion: null,
        },
      searchPerformance,
      marketEvidence,
      existingWork,
      topicCoverage,
      opportunities,
      missingEvidence,
      executability,
    });
  }

  return {
    summary: {
      analyzerVersion: ANALYZER_VERSION,
      analyzedAt: now,
      outcome: pagesSkipped.length ? 'partial' : 'complete',
      degradationReasons,
      pagesConsidered: bundle.pages.length,
      pagesAnalysed: analyses.length,
      pagesSkipped,
      gscConfigured: gsc.configured,
      gscPeriod: gsc.period,
      auditRun: {
        runId: bundle.auditRun.runId ? String(bundle.auditRun.runId) : null,
        runAt: bundle.auditRun.runAt,
        status: bundle.auditRun.status,
        stale: bundle.auditRun.stale,
        ageDays: bundle.auditRun.ageDays,
      },
    },
    analyses,
  };
}
