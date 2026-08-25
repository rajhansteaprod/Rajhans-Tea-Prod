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
import { resolveLinkTargets, runCrossPageRules } from './crosspage.service';
import { generateAndPersistRecommendations } from './recommendation.service';
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
      internalLinkDetails: [],
      images: [],
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
    internalLinkDetails: parsed?.internalLinkDetails ?? [],
    images: parsed?.images ?? [],
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

    // ── Resolve unique internal link targets once (for the cross-page checks) ──
    // Reuses already-observed pages; only non-canonical targets (e.g. /x that
    // 301s to /x/) are fetched, a single time each, rate-limited like the crawl.
    const linkResolutions = await resolveLinkTargets(
      observations,
      pagesByNormalizedUrl,
      seoConfig.baseUrl,
      fetchUrl,
      seoConfig.maxConcurrency,
      seoConfig.perRequestDelayMs ? () => new Promise((r) => setTimeout(r, seoConfig.perRequestDelayMs)) : undefined,
    );

    // ── Run rules ──
    const detected: DetectedIssue[] = [];
    for (const o of observations) detected.push(...runPageRules(o, ctx));
    detected.push(...runSitemapRules(ctx));
    detected.push(...runCrossPageRules(observations, ctx, linkResolutions));

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
      discoveredNormalizedUrls: new Set(observations.map((o) => o.normalizedUrl)),
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

    // ── Phase 3: synthesize + persist growth recommendations (recommend-only) ──
    // Isolated in its own try/catch so a recommendation failure can never fail or
    // roll back the audit itself.
    try {
      const recoDiff = await generateAndPersistRecommendations({
        runId: run._id,
        isBaseline,
        allowResolution: !isBaseline && !degraded,
        baseUrl: seoConfig.baseUrl,
        detected,
        observations,
        linkResolutions,
      });
      logger.info({ runId: run._id.toString(), recoCounts: recoDiff.counts, recoDelta: recoDiff.delta }, 'SEO recommendations generated');
    } catch (recErr) {
      logger.error({ runId: run._id.toString(), err: recErr }, 'SEO recommendation generation failed (audit unaffected)');
    }

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
