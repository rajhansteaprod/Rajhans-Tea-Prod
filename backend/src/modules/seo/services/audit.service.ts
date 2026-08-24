import { SeoAuditRun, ISeoAuditRunDoc } from '../models/seo-audit-run.model';
import { SeoPageSnapshot } from '../models/seo-page-snapshot.model';
import { seoConfig } from '../seo.config';
import { AuditContext, DetectedIssue, PageObservation, RunScope, RunTrigger } from '../seo.types';
import { normalizeUrl } from '../seo.util';
import { buildInventory } from './inventory.service';
import { fetchUrl } from './fetcher.service';
import { parseHtml } from './parser.service';
import { runPageRules } from './rules';
import { runSitemapRules } from './analyzer.service';
import { diffAndPersist } from './diff.service';
import { logger } from '../../../utils/logger';

/** Bounded-concurrency map with a politeness delay — protects production. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
      if (seoConfig.perRequestDelayMs) await new Promise((r) => setTimeout(r, seoConfig.perRequestDelayMs));
    }
  });
  await Promise.all(workers);
  return results;
}

async function observe(url: string, sitemapUrls: Set<string>): Promise<PageObservation> {
  const normalizedUrl = normalizeUrl(url);
  const inSitemap = sitemapUrls.has(normalizedUrl);
  const res = await fetchUrl(url);

  if (res.transient || res.finalStatus === null) {
    return {
      url,
      normalizedUrl,
      fetched: false,
      transientFailure: !!res.transient,
      httpStatus: res.finalStatus,
      redirectChain: res.redirectChain,
      finalUrl: res.finalUrl,
      finalStatus: res.finalStatus,
      title: null,
      metaDescription: null,
      robotsMeta: null,
      canonical: null,
      h1: [],
      imagesTotal: 0,
      imagesMissingAlt: 0,
      internalLinks: [],
      structuredDataTypes: [],
      wordCount: 0,
      contentHash: null,
      inSitemap,
      fetchError: res.error,
    };
  }

  const parsed = res.html ? parseHtml(res.html, res.finalUrl, seoConfig.baseUrl) : null;
  return {
    url,
    normalizedUrl,
    fetched: true,
    transientFailure: false,
    httpStatus: res.finalStatus,
    redirectChain: res.redirectChain,
    finalUrl: res.finalUrl,
    finalStatus: res.finalStatus,
    title: parsed?.title ?? null,
    metaDescription: parsed?.metaDescription ?? null,
    robotsMeta: parsed?.robotsMeta ?? null,
    canonical: parsed?.canonical ?? null,
    h1: parsed?.h1 ?? [],
    imagesTotal: parsed?.imagesTotal ?? 0,
    imagesMissingAlt: parsed?.imagesMissingAlt ?? 0,
    internalLinks: parsed?.internalLinks ?? [],
    structuredDataTypes: parsed?.structuredDataTypes ?? [],
    wordCount: parsed?.wordCount ?? 0,
    contentHash: parsed?.contentHash ?? null,
    inSitemap,
    fetchError: res.error,
  };
}

/**
 * Run one full SEO audit: preflight → inventory → fetch/parse → rules → diff.
 * Entirely read-only against production. Returns the persisted run document.
 */
export async function runAudit(trigger: RunTrigger, scope: RunScope = 'daily'): Promise<ISeoAuditRunDoc> {
  const run = await SeoAuditRun.create({ trigger, scope, status: 'running', startedAt: new Date() });
  logger.info({ runId: run._id.toString(), trigger, scope }, 'SEO audit started');

  try {
    // ── Preflight: is the site reachable at all? If not, abort (do not flag URLs) ──
    const preflight = await fetchUrl(seoConfig.baseUrl + '/');
    if (preflight.transient || preflight.finalStatus === null || preflight.finalStatus >= 500) {
      run.status = 'failed';
      run.siteReachable = false;
      run.error = `Preflight failed: ${preflight.error || preflight.finalStatus}`;
      run.finishedAt = new Date();
      await run.save();
      logger.warn({ runId: run._id.toString(), err: run.error }, 'SEO audit aborted: site unreachable');
      return run;
    }

    // ── Inventory + baseline determination ──
    const inventory = await buildInventory();
    const prev = await SeoAuditRun.findOne({ status: 'completed', _id: { $ne: run._id } })
      .sort({ createdAt: -1 })
      .exec();
    const isBaseline = !prev;

    // ── Fetch + parse every URL (rate-limited) ──
    const observations = await mapLimited(inventory.urls, seoConfig.maxConcurrency, (u) =>
      observe(u, inventory.sitemapUrls),
    );

    // Persist snapshots.
    await SeoPageSnapshot.insertMany(observations.map((o) => ({ ...o, runId: run._id })));

    // ── Build context ──
    const pagesByNormalizedUrl = new Map<string, PageObservation>();
    for (const o of observations) pagesByNormalizedUrl.set(o.normalizedUrl, o);
    const ctx: AuditContext = {
      baseUrl: seoConfig.baseUrl,
      sitemapUrls: inventory.sitemapUrls,
      robotsAccessible: inventory.robotsAccessible,
      pagesByNormalizedUrl,
    };

    // ── Run rules ──
    const detected: DetectedIssue[] = [];
    for (const o of observations) detected.push(...runPageRules(o, ctx));
    detected.push(...runSitemapRules(ctx));

    // ── Coverage ──
    const fetched = observations.filter((o) => o.fetched);
    const fetchedNormalizedUrls = new Set(fetched.map((o) => o.normalizedUrl));
    const coverageRatio = observations.length ? fetched.length / observations.length : 0;
    const degraded = coverageRatio < seoConfig.minCoverageRatio;
    const status = degraded ? 'degraded' : 'completed';

    // ── Diff + persist issue state ──
    const diff = await diffAndPersist({
      runId: run._id,
      isBaseline,
      allowResolution: !isBaseline && !degraded,
      detectedIssues: detected,
      fetchedNormalizedUrls,
    });

    run.status = status;
    run.isBaseline = isBaseline;
    run.previousRunId = prev?._id ?? null;
    run.siteReachable = true;
    run.urlsDiscovered = observations.length;
    run.urlsFetched = fetched.length;
    run.coverageRatio = Number(coverageRatio.toFixed(4));
    run.counts = diff.counts;
    run.delta = diff.delta;
    run.finishedAt = new Date();
    await run.save();

    logger.info(
      { runId: run._id.toString(), status, urls: observations.length, fetched: fetched.length, counts: diff.counts, delta: diff.delta },
      'SEO audit finished',
    );
    return run;
  } catch (err) {
    run.status = 'failed';
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date();
    await run.save();
    logger.error({ runId: run._id.toString(), err }, 'SEO audit crashed');
    return run;
  }
}
