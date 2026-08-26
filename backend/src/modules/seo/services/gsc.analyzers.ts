import { gscConfig } from '../gsc.config';
import {
  OpportunityConfidence,
  OpportunityDraft,
  PageWindowMetric,
  QueryPageMetric,
  SeoJoinFacts,
} from '../gsc.types';

/**
 * Pure GSC opportunity analyzers. Each takes collected metrics (+ the SEO join)
 * and returns OpportunityDrafts with a confidence rating and fully reproducible
 * score components, so any prioritization is explainable from stored evidence.
 * No DB, no network — deterministic over its inputs.
 */

// ── Position → expected organic CTR benchmark (interpolated, configurable seed) ──
const CTR_CURVE: [number, number][] = [
  [1, 0.28], [2, 0.15], [3, 0.1], [4, 0.07], [5, 0.055],
  [6, 0.043], [7, 0.035], [8, 0.03], [9, 0.026], [10, 0.023],
  [15, 0.013], [20, 0.009], [30, 0.005], [50, 0.003], [100, 0.002],
];

export function expectedCtr(position: number): number {
  if (position <= CTR_CURVE[0][0]) return CTR_CURVE[0][1];
  const last = CTR_CURVE[CTR_CURVE.length - 1];
  if (position >= last[0]) return last[1];
  for (let i = 1; i < CTR_CURVE.length; i++) {
    const [p1, c1] = CTR_CURVE[i - 1];
    const [p2, c2] = CTR_CURVE[i];
    if (position <= p2) {
      const t = (position - p1) / (p2 - p1);
      return c1 + t * (c2 - c1);
    }
  }
  return last[1];
}

export function positionBucket(position: number): string {
  if (position <= 3) return '1-3';
  if (position <= 10) return '4-10';
  if (position <= 20) return '11-20';
  return '21+';
}

const cap100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Confidence from sample size + supporting signals. Deliberately conservative:
 * a single small-sample window is `low`; larger samples, historical support
 * (two complete windows), real clicks, or multi-signal corroboration raise it.
 */
export function confidence(opts: {
  impressions: number;
  floor: number;
  hasHistory?: boolean;
  multiSignal?: boolean;
  hasClicks?: boolean;
}): OpportunityConfidence {
  let pts = 0;
  if (opts.impressions >= opts.floor * 10) pts += 2;
  else if (opts.impressions >= opts.floor * 3) pts += 1;
  if (opts.hasHistory) pts += 1;
  if (opts.multiSignal) pts += 1;
  if (opts.hasClicks) pts += 1;
  return pts >= 3 ? 'high' : pts >= 1 ? 'medium' : 'low';
}

const join = (m: Map<string, SeoJoinFacts>, url: string): SeoJoinFacts =>
  m.get(url) ?? { inSnapshot: false, title: null, wordCount: 0, openIssueCheckIds: [], openRecommendationIds: [] };

interface AnalyzerCtx {
  window: { start: string; end: string };
  seo: Map<string, SeoJoinFacts>;
}

// ── 1) High impressions + low CTR ──
export function analyzeHighImpressionLowCtr(rows: QueryPageMetric[], ctx: AnalyzerCtx): OpportunityDraft[] {
  const t = gscConfig.thresholds;
  const out: OpportunityDraft[] = [];
  for (const r of rows) {
    if (r.impressions < t.lowCtrMinImpressions) continue;
    const exp = expectedCtr(r.position);
    if (r.ctr >= exp * t.lowCtrRatio) continue;
    const missedClicks = Math.max(0, (exp - r.ctr) * r.impressions);
    const facts = join(ctx.seo, r.normalizedUrl);
    const scoreComponents = {
      demand: Math.min(50, (r.impressions / gscConfig.demandBoost.impressionsForMax) * 50),
      ctrGap: Math.min(50, ((exp - r.ctr) / exp) * 50),
    };
    out.push({
      type: 'high-impression-low-ctr',
      key: `low-ctr::${r.normalizedUrl}::${r.query}`,
      normalizedUrl: r.normalizedUrl,
      query: r.query,
      title: `Low CTR for "${r.query}" — high impressions, weak clickthrough`,
      why: `"${r.query}" gets ${r.impressions} impressions at position ${r.position.toFixed(1)} but only ${(r.ctr * 100).toFixed(1)}% CTR (expected ~${(exp * 100).toFixed(1)}%). A stronger title/meta could recover ~${Math.round(missedClicks)} clicks.`,
      suggestedFix: 'Rewrite the page title/meta description (or add rich results) to better match this query intent. Do not auto-generate.',
      confidence: confidence({ impressions: r.impressions, floor: t.lowCtrMinImpressions, hasClicks: r.clicks > 0, multiSignal: facts.openIssueCheckIds.length + facts.openRecommendationIds.length > 0 }),
      score: cap100(scoreComponents.demand + scoreComponents.ctrGap),
      evidence: {
        query: r.query, page: r.page, periodStart: ctx.window.start, periodEnd: ctx.window.end,
        clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, expectedCtr: exp, position: r.position,
        positionBucket: positionBucket(r.position), trend: 'flat', scoreComponents,
        relatedIssueCheckIds: facts.openIssueCheckIds, relatedRecommendationIds: facts.openRecommendationIds,
      },
    });
  }
  return out;
}

// ── 2) Striking distance (positions 4–20) ──
export function analyzeStrikingDistance(rows: QueryPageMetric[], ctx: AnalyzerCtx): OpportunityDraft[] {
  const t = gscConfig.thresholds;
  const out: OpportunityDraft[] = [];
  for (const r of rows) {
    if (r.position < 4 || r.position > 20 || r.impressions < t.strikingMinImpressions) continue;
    const upside = Math.max(0, (expectedCtr(3) - r.ctr) * r.impressions);
    const facts = join(ctx.seo, r.normalizedUrl);
    const proximity = (20 - r.position) / 16; // closer to 4 = higher
    const scoreComponents = {
      proximity: proximity * 40,
      demand: Math.min(40, (r.impressions / gscConfig.demandBoost.impressionsForMax) * 40),
      upside: Math.min(20, upside / 5),
    };
    out.push({
      type: 'striking-distance',
      key: `striking::${r.normalizedUrl}::${r.query}`,
      normalizedUrl: r.normalizedUrl,
      query: r.query,
      title: `Striking distance: "${r.query}" at position ${r.position.toFixed(1)}`,
      why: `"${r.query}" ranks ${r.position.toFixed(1)} (bucket ${positionBucket(r.position)}) with ${r.impressions} impressions. Pushing it into the top 3 could add ~${Math.round(upside)} clicks.`,
      suggestedFix: 'Strengthen the ranking page for this query (on-page relevance, internal links, content depth). Do not auto-edit.',
      confidence: confidence({ impressions: r.impressions, floor: t.strikingMinImpressions, hasClicks: r.clicks > 0, multiSignal: facts.openIssueCheckIds.length + facts.openRecommendationIds.length > 0 }),
      score: cap100(scoreComponents.proximity + scoreComponents.demand + scoreComponents.upside),
      evidence: {
        query: r.query, page: r.page, periodStart: ctx.window.start, periodEnd: ctx.window.end,
        clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, expectedCtr: expectedCtr(3), position: r.position,
        positionBucket: positionBucket(r.position), trend: 'flat', scoreComponents,
        relatedIssueCheckIds: facts.openIssueCheckIds, relatedRecommendationIds: facts.openRecommendationIds,
      },
    });
  }
  return out;
}

// ── 3) Suspected query cannibalization (meaningful repeated competition) ──
export function analyzeCannibalization(rows: QueryPageMetric[], ctx: AnalyzerCtx): OpportunityDraft[] {
  const t = gscConfig.thresholds;
  const byQuery = new Map<string, QueryPageMetric[]>();
  for (const r of rows) (byQuery.get(r.query) || byQuery.set(r.query, []).get(r.query)!).push(r);

  const out: OpportunityDraft[] = [];
  for (const [query, list] of byQuery) {
    const totalImpr = list.reduce((n, r) => n + r.impressions, 0);
    if (totalImpr <= 0) continue;
    // Only URLs with a MEANINGFUL share AND absolute floor count as competitors.
    const competitors = list
      .map((r) => ({ normalizedUrl: r.normalizedUrl, impressions: r.impressions, clicks: r.clicks, position: r.position, share: r.impressions / totalImpr }))
      .filter((c) => c.share >= t.cannibalizationMinShare && c.impressions >= t.cannibalizationMinImpressions)
      .sort((a, b) => b.impressions - a.impressions);
    if (competitors.length < 2) continue; // trivial secondary appearances are ignored

    const anchor = competitors[0];
    out.push({
      type: 'suspected-query-cannibalization',
      key: `cannib::${query}`,
      normalizedUrl: anchor.normalizedUrl,
      query,
      title: `Suspected cannibalization for "${query}" (${competitors.length} pages)`,
      why: `${competitors.length} pages meaningfully compete for "${query}" (each ≥${Math.round(t.cannibalizationMinShare * 100)}% of its impressions). They may split ranking signals.`,
      suggestedFix: 'Review intent overlap; consolidate or clearly differentiate the pages, and align internal links to one primary target. Do not auto-change.',
      confidence: confidence({ impressions: totalImpr, floor: t.cannibalizationMinImpressions, hasClicks: competitors.some((c) => c.clicks > 0) }),
      score: cap100(30 + Math.min(40, (totalImpr / gscConfig.demandBoost.impressionsForMax) * 40) + (competitors.length - 2) * 10),
      evidence: {
        query, periodStart: ctx.window.start, periodEnd: ctx.window.end, impressions: totalImpr,
        competingUrls: competitors,
      },
    });
  }
  return out;
}

// ── 4) Declining / growing pages (equal complete windows) ──
export function analyzeTrends(
  latest: PageWindowMetric[],
  previous: PageWindowMetric[],
  ctx: AnalyzerCtx & { previousWindow: { start: string; end: string } },
): OpportunityDraft[] {
  const t = gscConfig.thresholds;
  const prevByUrl = new Map(previous.map((p) => [p.normalizedUrl, p]));
  const out: OpportunityDraft[] = [];

  for (const cur of latest) {
    const prev = prevByUrl.get(cur.normalizedUrl);
    if (!prev) continue; // need both complete windows to compare
    const combined = cur.impressions + prev.impressions;
    if (combined < t.trendMinCombinedImpressions) continue;
    const facts = join(ctx.seo, cur.normalizedUrl);
    const imprDrop = prev.impressions > 0 ? (prev.impressions - cur.impressions) / prev.impressions : 0;
    const imprGain = prev.impressions > 0 ? (cur.impressions - prev.impressions) / prev.impressions : 0;
    const posWorse = cur.position - prev.position; // higher = worse

    const base = {
      periodStart: ctx.window.start, periodEnd: ctx.window.end,
      clicks: cur.clicks, impressions: cur.impressions, ctr: cur.ctr, position: cur.position,
      previousClicks: prev.clicks, previousImpressions: prev.impressions, previousCtr: prev.ctr, previousPosition: prev.position,
      relatedIssueCheckIds: facts.openIssueCheckIds, relatedRecommendationIds: facts.openRecommendationIds,
    };

    if (imprDrop >= t.declineImpressionsPct || posWorse >= t.positionDeclineDelta) {
      out.push({
        type: 'declining-page', key: `decline::${cur.normalizedUrl}`, normalizedUrl: cur.normalizedUrl, query: null,
        title: `Declining page: ${cur.normalizedUrl}`,
        why: `Impressions ${prev.impressions}→${cur.impressions} (${Math.round(-imprDrop * 100)}%), position ${prev.position.toFixed(1)}→${cur.position.toFixed(1)} across two ${gscConfig.opportunityWindowDays}-day windows.`,
        suggestedFix: 'Investigate the drop (content freshness, lost links, SERP changes, technical regressions). Do not auto-change.',
        confidence: confidence({ impressions: combined, floor: t.trendMinCombinedImpressions, hasHistory: true, hasClicks: cur.clicks + prev.clicks > 0, multiSignal: facts.openIssueCheckIds.length > 0 }),
        score: cap100(30 + Math.min(50, imprDrop * 100) + Math.min(20, posWorse * 4)),
        evidence: { ...base, trend: 'down', scoreComponents: { drop: Math.min(50, imprDrop * 100), positionWorse: Math.min(20, posWorse * 4) } },
      });
    } else if (imprGain >= t.growthImpressionsPct) {
      out.push({
        type: 'growing-query', key: `growth::${cur.normalizedUrl}`, normalizedUrl: cur.normalizedUrl, query: null,
        title: `Growing page: ${cur.normalizedUrl}`,
        why: `Impressions ${prev.impressions}→${cur.impressions} (+${Math.round(imprGain * 100)}%) across two ${gscConfig.opportunityWindowDays}-day windows — momentum to capitalize on.`,
        suggestedFix: 'Reinforce the winning page (internal links, related content, conversion path). Do not auto-change.',
        confidence: confidence({ impressions: combined, floor: t.trendMinCombinedImpressions, hasHistory: true, hasClicks: cur.clicks + prev.clicks > 0 }),
        score: cap100(20 + Math.min(50, imprGain * 60)),
        evidence: { ...base, trend: 'up', scoreComponents: { gain: Math.min(50, imprGain * 60) } },
      });
    }
  }
  return out;
}

// ── 5) Content gap (demandful query ranking only via a generic hub) ──
export function analyzeContentGaps(rows: QueryPageMetric[], ctx: AnalyzerCtx & { hubNormalizedUrls: Set<string> }): OpportunityDraft[] {
  const t = gscConfig.thresholds;
  // Best-ranking page per query (most impressions).
  const bestByQuery = new Map<string, QueryPageMetric>();
  const totalByQuery = new Map<string, number>();
  for (const r of rows) {
    totalByQuery.set(r.query, (totalByQuery.get(r.query) || 0) + r.impressions);
    const best = bestByQuery.get(r.query);
    if (!best || r.impressions > best.impressions) bestByQuery.set(r.query, r);
  }
  const out: OpportunityDraft[] = [];
  for (const [query, best] of bestByQuery) {
    const total = totalByQuery.get(query) || best.impressions;
    if (total < t.contentGapMinImpressions) continue;
    if (!ctx.hubNormalizedUrls.has(best.normalizedUrl)) continue; // best page is NOT a hub → has a dedicated page already
    out.push({
      type: 'content-gap',
      key: `gap::${query}`,
      normalizedUrl: best.normalizedUrl,
      query,
      title: `Content gap: "${query}" ranks only via a generic page`,
      why: `"${query}" has ${total} impressions but its best-ranking URL is the generic hub ${best.normalizedUrl} (position ${best.position.toFixed(1)}). A dedicated page could capture this demand.`,
      suggestedFix: 'Consider a dedicated, genuinely useful page/article for this query and link it appropriately. RECOMMENDATION ONLY — do not create/publish content automatically.',
      confidence: confidence({ impressions: total, floor: t.contentGapMinImpressions, hasClicks: best.clicks > 0 }),
      score: cap100(20 + Math.min(50, (total / gscConfig.demandBoost.impressionsForMax) * 50)),
      evidence: {
        query, page: best.page, periodStart: ctx.window.start, periodEnd: ctx.window.end,
        clicks: best.clicks, impressions: total, ctr: best.ctr, position: best.position, positionBucket: positionBucket(best.position),
      },
    });
  }
  return out;
}

/** Explain, per query×page row, which analyzers it qualifies for (and why not). */
export function queryPageEligibility(r: QueryPageMetric, joined: boolean): { eligibleFor: string[]; reason: string } {
  if (!joined) return { eligibleFor: [], reason: 'excluded: URL did not join to a canonical indexable page' };
  const t = gscConfig.thresholds;
  const eligibleFor: string[] = [];
  const notes: string[] = [];
  const exp = expectedCtr(r.position);
  if (r.impressions >= t.lowCtrMinImpressions && r.ctr < exp * t.lowCtrRatio) eligibleFor.push('high-impression-low-ctr');
  else notes.push(`low-ctr needs impr≥${t.lowCtrMinImpressions} & ctr<${(exp * t.lowCtrRatio * 100).toFixed(1)}% (have impr ${r.impressions}, ctr ${(r.ctr * 100).toFixed(1)}%)`);
  if (r.position >= 4 && r.position <= 20 && r.impressions >= t.strikingMinImpressions) eligibleFor.push('striking-distance');
  else notes.push(`striking needs pos 4-20 & impr≥${t.strikingMinImpressions} (have pos ${r.position.toFixed(1)}, impr ${r.impressions})`);
  return { eligibleFor, reason: eligibleFor.length ? `eligible: ${eligibleFor.join(', ')}` : `excluded: ${notes.join('; ')}` };
}

export interface AnalyzeInput {
  queryPage: QueryPageMetric[];
  pageLatest: PageWindowMetric[];
  pagePrevious: PageWindowMetric[];
  seo: Map<string, SeoJoinFacts>;
  hubNormalizedUrls: Set<string>;
  window: { start: string; end: string };
  previousWindow: { start: string; end: string };
}

/** Run all analyzers; attach the confidence into each draft's evidence. */
export function runAllAnalyzers(input: AnalyzeInput): OpportunityDraft[] {
  const ctx: AnalyzerCtx = { window: input.window, seo: input.seo };
  const drafts = [
    ...analyzeHighImpressionLowCtr(input.queryPage, ctx),
    ...analyzeStrikingDistance(input.queryPage, ctx),
    ...analyzeCannibalization(input.queryPage, ctx),
    ...analyzeTrends(input.pageLatest, input.pagePrevious, { ...ctx, previousWindow: input.previousWindow }),
    ...analyzeContentGaps(input.queryPage, { ...ctx, hubNormalizedUrls: input.hubNormalizedUrls }),
  ];
  for (const d of drafts) d.evidence.confidence = d.confidence;
  return drafts;
}
