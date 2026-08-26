import mongoose from 'mongoose';
import { GscPageDailyMetric } from '../models/gsc-page-daily-metric.model';
import { GscQueryPageMetric } from '../models/gsc-query-page-metric.model';
import { SeoAuditRun } from '../models/seo-audit-run.model';
import { SeoPageSnapshot } from '../models/seo-page-snapshot.model';
import { SeoIssue } from '../models/seo-issue.model';
import { SeoRecommendation } from '../models/seo-recommendation.model';
import { gscConfig } from '../gsc.config';
import { backfillWindow, DateWindow, trendWindows } from '../gsc.util';
import { PageWindowMetric, QueryPageMetric, SeoJoinFacts } from '../gsc.types';
import { querySearchAnalytics } from './gsc.client';
import { normalizeUrl } from '../seo.util';

interface PageDailyRow {
  date: string;
  page: string;
  normalizedUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface FetchedMetrics {
  window: DateWindow; // latest complete opportunity window
  previousWindow: DateWindow;
  backfill: DateWindow;
  queryPage: QueryPageMetric[];
  pageDaily: PageDailyRow[];
  pageLatest: PageWindowMetric[];
  pagePrevious: PageWindowMetric[];
}

/** Impression-weight daily rows into a single per-page rollup over a window. */
function aggregateWindow(daily: PageDailyRow[], window: DateWindow): PageWindowMetric[] {
  const byUrl = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
  for (const d of daily) {
    if (d.date < window.start || d.date > window.end) continue;
    const a = byUrl.get(d.normalizedUrl) || { clicks: 0, impressions: 0, posWeighted: 0 };
    a.clicks += d.clicks;
    a.impressions += d.impressions;
    a.posWeighted += d.position * d.impressions;
    byUrl.set(d.normalizedUrl, a);
  }
  return Array.from(byUrl.entries()).map(([normalizedUrl, a]) => ({
    normalizedUrl,
    clicks: a.clicks,
    impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0,
    position: a.impressions ? a.posWeighted / a.impressions : 0,
  }));
}

/**
 * Fetch GSC metrics for the current windows. Read-only against Google. Used by
 * both the persisting sync and the read-only dry-run. Two narrow pulls:
 * query×page over the opportunity window, and date×page over the backfill span.
 */
export async function fetchGscMetrics(today = new Date()): Promise<FetchedMetrics> {
  const win = trendWindows(gscConfig.opportunityWindowDays, today);
  const backfill = backfillWindow(today);

  const qpRows = await querySearchAnalytics({ startDate: win.latest.start, endDate: win.latest.end, dimensions: ['query', 'page'] });
  const queryPage: QueryPageMetric[] = qpRows
    .filter((r) => r.keys?.length >= 2)
    .map((r) => ({ query: r.keys[0], page: r.keys[1], normalizedUrl: normalizeUrl(r.keys[1]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  const pdRows = await querySearchAnalytics({ startDate: backfill.start, endDate: backfill.end, dimensions: ['date', 'page'] });
  const pageDaily: PageDailyRow[] = pdRows
    .filter((r) => r.keys?.length >= 2)
    .map((r) => ({ date: r.keys[0], page: r.keys[1], normalizedUrl: normalizeUrl(r.keys[1]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  return {
    window: win.latest,
    previousWindow: win.previous,
    backfill,
    queryPage,
    pageDaily,
    pageLatest: aggregateWindow(pageDaily, win.latest),
    pagePrevious: aggregateWindow(pageDaily, win.previous),
  };
}

/**
 * The canonical-page context from the latest audit: the set of indexable
 * canonical URLs (for GSC-URL resolution) + facts (title/wordCount/open issues +
 * recommendations) keyed by canonical URL. This is the join target for GSC demand.
 */
export async function buildSeoContext(): Promise<{ canonicalSet: Set<string>; facts: Map<string, SeoJoinFacts> }> {
  const canonicalSet = new Set<string>();
  const facts = new Map<string, SeoJoinFacts>();
  const run = await SeoAuditRun.findOne({ status: { $in: ['completed', 'degraded'] } }).sort({ createdAt: -1 }).lean().exec();
  if (!run) return { canonicalSet, facts };

  const snaps = await SeoPageSnapshot.find({ runId: run._id }).select('normalizedUrl finalStatus redirectChain title wordCount').lean().exec();
  for (const s of snaps) {
    const indexable = s.finalStatus === 200 && (!s.redirectChain || s.redirectChain.length === 0);
    if (!indexable) continue;
    canonicalSet.add(s.normalizedUrl);
    facts.set(s.normalizedUrl, { inSnapshot: true, title: s.title ?? null, wordCount: s.wordCount ?? 0, openIssueCheckIds: [], openRecommendationIds: [] });
  }
  const urls = Array.from(canonicalSet);
  if (urls.length) {
    const issues = await SeoIssue.find({ status: 'open', normalizedUrl: { $in: urls } }).select('normalizedUrl checkId').lean().exec();
    for (const i of issues) facts.get(i.normalizedUrl)?.openIssueCheckIds.push(i.checkId);
    const recs = await SeoRecommendation.find({ status: 'open', affectedUrls: { $in: urls } }).select('recommendationId affectedUrls').lean().exec();
    for (const r of recs) for (const u of r.affectedUrls) if (facts.has(u)) facts.get(u)!.openRecommendationIds.push(r.recommendationId);
  }
  return { canonicalSet, facts };
}

/**
 * Build the SEO cross-reference join for a set of normalized URLs: latest
 * snapshot facts + open audit issues + open recommendations. This is what lets a
 * page's real demand be tied to its existing technical debt.
 */
export async function buildSeoJoin(urls: Set<string>): Promise<Map<string, SeoJoinFacts>> {
  const map = new Map<string, SeoJoinFacts>();
  const ensure = (u: string): SeoJoinFacts => {
    let f = map.get(u);
    if (!f) { f = { inSnapshot: false, title: null, wordCount: 0, openIssueCheckIds: [], openRecommendationIds: [] }; map.set(u, f); }
    return f;
  };
  const list = Array.from(urls);
  if (!list.length) return map;

  const run = await SeoAuditRun.findOne({ status: { $in: ['completed', 'degraded'] } }).sort({ createdAt: -1 }).lean().exec();
  if (run) {
    const snaps = await SeoPageSnapshot.find({ runId: run._id, normalizedUrl: { $in: list } }).select('normalizedUrl title wordCount').lean().exec();
    for (const s of snaps) {
      const f = ensure(s.normalizedUrl);
      f.inSnapshot = true;
      f.title = s.title ?? null;
      f.wordCount = s.wordCount ?? 0;
    }
  }
  const issues = await SeoIssue.find({ status: 'open', normalizedUrl: { $in: list } }).select('normalizedUrl checkId').lean().exec();
  for (const i of issues) ensure(i.normalizedUrl).openIssueCheckIds.push(i.checkId);

  const recs = await SeoRecommendation.find({ status: 'open', affectedUrls: { $in: list } }).select('recommendationId affectedUrls').lean().exec();
  for (const r of recs) for (const u of r.affectedUrls) if (urls.has(u)) ensure(u).openRecommendationIds.push(r.recommendationId);

  return map;
}

/**
 * Upsert fetched metrics idempotently + apply retention. Pure persistence — the
 * orchestrator (runGscSync) owns the GscSyncRun lifecycle and error handling.
 */
export async function persistMetrics(runId: mongoose.Types.ObjectId, m: FetchedMetrics): Promise<{ pageRows: number; qpRows: number }> {
  let pageRows = 0;
  for (const d of m.pageDaily) {
    await GscPageDailyMetric.updateOne(
      { date: d.date, normalizedUrl: d.normalizedUrl },
      { $set: { page: d.page, clicks: d.clicks, impressions: d.impressions, ctr: d.ctr, position: d.position, syncRunId: runId } },
      { upsert: true },
    );
    pageRows++;
  }
  let qpRows = 0;
  for (const q of m.queryPage) {
    await GscQueryPageMetric.updateOne(
      { periodEnd: m.window.end, query: q.query, normalizedUrl: q.normalizedUrl },
      { $set: { periodStart: m.window.start, page: q.page, clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position, syncRunId: runId } },
      { upsert: true },
    );
    qpRows++;
  }
  await applyRetention();
  return { pageRows, qpRows };
}

/** Delete daily metrics older than the retention horizon (0 months = never). */
async function applyRetention(): Promise<void> {
  if (!gscConfig.retentionMonths) return;
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - gscConfig.retentionMonths);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  await GscPageDailyMetric.deleteMany({ date: { $lt: cutoffDate } });
  // Query×page period snapshots are retained for reconstructability (small volume).
}
