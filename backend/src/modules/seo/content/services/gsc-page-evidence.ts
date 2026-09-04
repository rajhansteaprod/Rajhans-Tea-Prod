import { GscQueryPageMetric } from '../../models/gsc-query-page-metric.model';
import { gscConfig } from '../../gsc.config';
import { QueryPageMetric } from '../../gsc.types';
import { expectedCtr, positionBucket, queryPageEligibility } from '../../services/gsc.analyzers';
import { finalizeIntents } from '../../market/services/intent-classifier';
import { RelevanceTaxonomy } from '../../market/relevance.taxonomy';
import { contentConfig } from '../content.config';
import { PageQueryEvidence, PageSearchPerformance } from '../content.types';
import { isBrandedQuery } from './content-extraction';

/**
 * Phase 6.1 — Search Console evidence, re-projected PAGE-FIRST.
 *
 * The existing GSC pipeline is row-first: it pulls a window and emits per-row
 * opportunity drafts. Phase 6.1 needs the inverse — given one canonical URL,
 * its queries, its rollups and the per-query verdicts. Nothing is recomputed
 * here that the analyzers already compute: `expectedCtr`, `positionBucket` and
 * `queryPageEligibility` are imported, so a page's view of a query can never
 * disagree with the pipeline's.
 *
 * Reads STORED metrics only. Google is never called: `GscQueryPageMetric` rows
 * are already resolved to canonical URLs at sync time (see `resolveMetrics`),
 * so a page-first read is a direct indexed lookup on `normalizedUrl`.
 */

export interface GscEvidenceBundle {
  /** Whether GSC is provisioned at all. False ⇒ absence proves nothing. */
  configured: boolean;
  /** The most recent complete period present in storage. */
  period: { start: string; end: string } | null;
  /** Rows for the analysed pages, keyed by canonical URL. */
  rowsByUrl: Map<string, QueryPageMetric[]>;
  /**
   * EVERY row in the period, for every page. Cannibalization is a property of a
   * QUERY across pages, so it cannot be decided from one page's rows alone —
   * this is the whole-period view the detector needs, loaded in the same single
   * read rather than a second query per page.
   */
  allRows: QueryPageMetric[];
}

const toMetric = (r: {
  query: string;
  page: string;
  normalizedUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}): QueryPageMetric => ({
  query: r.query,
  page: r.page,
  normalizedUrl: r.normalizedUrl,
  clicks: r.clicks,
  impressions: r.impressions,
  ctr: r.ctr,
  position: r.position,
});

/**
 * ONE bounded read for the whole batch. The period is whichever `periodEnd` is
 * newest in storage — not a recomputed window — so the analysis is reproducible
 * against exactly the data that was synced, even if the clock has since moved
 * into a new window.
 */
export async function loadGscEvidence(urls: string[]): Promise<GscEvidenceBundle> {
  const empty: GscEvidenceBundle = {
    configured: gscConfig.enabled,
    period: null,
    rowsByUrl: new Map(),
    allRows: [],
  };

  const newest = await GscQueryPageMetric.findOne().sort({ periodEnd: -1 }).select('periodStart periodEnd').lean().exec();
  if (!newest) return empty;

  const rows = await GscQueryPageMetric.find({ periodEnd: newest.periodEnd })
    .select('query page normalizedUrl clicks impressions ctr position')
    .lean()
    .exec();

  const wanted = new Set(urls);
  const rowsByUrl = new Map<string, QueryPageMetric[]>();
  const allRows: QueryPageMetric[] = [];
  for (const r of rows) {
    const metric = toMetric(r);
    allRows.push(metric);
    if (!wanted.has(r.normalizedUrl)) continue;
    const list = rowsByUrl.get(r.normalizedUrl);
    if (list) list.push(metric);
    else rowsByUrl.set(r.normalizedUrl, [metric]);
  }

  return {
    configured: gscConfig.enabled,
    period: { start: newest.periodStart, end: newest.periodEnd },
    rowsByUrl,
    allRows,
  };
}

/**
 * One page's search performance. `known: false` when no rows joined — totals
 * stay null rather than becoming a fabricated zero, because "Google reported
 * nothing for this URL" and "this URL gets no traffic" are different claims and
 * only the first is supported by the data.
 */
export function buildSearchPerformance(
  rows: QueryPageMetric[],
  period: { start: string; end: string } | null,
  taxonomy: RelevanceTaxonomy,
): PageSearchPerformance {
  if (!rows.length || !period) {
    return { known: false, period, totals: null, queries: [], queryCount: 0, queriesTruncated: false };
  }

  let impressions = 0;
  let clicks = 0;
  let positionWeighted = 0;
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    positionWeighted += r.position * r.impressions;
  }

  const ranked = [...rows].sort(
    (a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query),
  );
  const kept = ranked.slice(0, contentConfig.limits.maxQueriesPerAnalysis);

  const queries: PageQueryEvidence[] = kept.map((r) => {
    // The row joined by construction (it is stored against this canonical URL),
    // so eligibility is evaluated with joined = true.
    const eligibility = queryPageEligibility(r, true);
    return {
      query: r.query,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      position: r.position,
      expectedCtr: expectedCtr(r.position),
      positionBucket: positionBucket(r.position),
      branded: isBrandedQuery(r.query, taxonomy),
      intents: finalizeIntents(r.query, taxonomy).map((i) => ({ intent: i.intent, confidence: i.confidence })),
      eligibleFor: eligibility.eligibleFor,
      eligibilityReason: eligibility.reason,
    };
  });

  return {
    known: true,
    period,
    totals: {
      impressions,
      clicks,
      ctr: impressions ? clicks / impressions : 0,
      // Impression-weighted, matching how the GSC sync aggregates a window.
      averagePosition: impressions ? positionWeighted / impressions : 0,
    },
    queries,
    queryCount: rows.length,
    queriesTruncated: rows.length > kept.length,
  };
}
