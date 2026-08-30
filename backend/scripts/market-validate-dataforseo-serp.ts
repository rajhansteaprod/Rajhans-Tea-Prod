/**
 * Phase 4b.5 — FIRST real DataForSEO SERP validation run.
 *
 * WRITES NOTHING TO THE DATABASE. No persistence of any kind. This script only
 * calls the provider (after explicit cost approval) and prints results.
 *
 * Usage (from backend/):
 *   npm run market:validate-dataforseo-serp
 *     -> prints the exact calculated estimate and stops (no call made).
 *   npm run market:validate-dataforseo-serp -- --confirm
 *     -> fetches real SERPs for the 5 keywords below, after the cost gate passes.
 *
 * Requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the environment.
 */
import { bootstrapMarketProviders } from '../src/modules/seo/market/providers/provider.bootstrap';
import { providerRegistry } from '../src/modules/seo/market/providers/provider.registry';
import { RunBudget } from '../src/modules/seo/market/providers/dataforseo/run-budget';
import { DATAFORSEO_SERP_PRICING } from '../src/modules/seo/market/providers/dataforseo/dataforseo-serp-pricing';
import { CostGateRefusedError } from '../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { DataForSeoSerpProvider } from '../src/modules/seo/market/providers/dataforseo/dataforseo-serp.provider';
import { SerpOverlapCache } from '../src/modules/seo/market/services/serp-overlap.provider';
import { clusterKeywords, ClusteringKeywordInput } from '../src/modules/seo/market/services/clustering.engine';
import { Market, ProviderOp, SerpProvider } from '../src/modules/seo/market/market.types';

const KEYWORDS = ['assam tea', 'assam ctc tea', 'ctc tea', 'darjeeling tea', 'what is ctc tea'];
const MARKET: Market = { country: 'IN', language: 'en', currency: 'INR', device: 'all' };
const MANUAL_APPROVAL_USD = 0.5;

async function main() {
  const confirmed = process.argv.includes('--confirm');

  bootstrapMarketProviders();
  if (!providerRegistry.hasCapability('serp')) {
    console.error('DataForSEO SERP is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing). Nothing to validate.');
    process.exitCode = 1;
    return;
  }
  const provider = providerRegistry.require<SerpProvider>('serp') as DataForSeoSerpProvider;

  const op: ProviderOp = { capability: 'serp', op: 'getSerp', units: DATAFORSEO_SERP_PRICING.supportedDepth };
  const perKeywordEstimate = provider.estimateCost(op);
  const totalEstimate = perKeywordEstimate.usd === null ? null : Math.round(perKeywordEstimate.usd * KEYWORDS.length * 1000) / 1000;

  console.log('=== Phase 4b.5 — DataForSEO SERP validation run (NO PERSISTENCE) ===');
  console.log('Keywords:', KEYWORDS.length, KEYWORDS);
  console.log('location_code: 2356 | language_code: en | device: desktop | depth: 10');
  console.log('Per-keyword estimate (from configured pricing table):', JSON.stringify(perKeywordEstimate));
  console.log(`TOTAL estimated cost for ${KEYWORDS.length} keywords: ${totalEstimate === null ? 'UNKNOWN' : `$${totalEstimate}`}`);

  const needsApproval = totalEstimate === null || totalEstimate > MANUAL_APPROVAL_USD;
  console.log('Requires explicit manual approval (> $0.50 or UNKNOWN):', needsApproval);

  if (!confirmed) {
    console.log('\nNo --confirm flag passed. Stopping WITHOUT calling DataForSEO.');
    return;
  }

  const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: confirmed });
  provider.beginRun(budget);
  const cache = new SerpOverlapCache();

  console.log('\n--- Fetching SERPs (bounded concurrency, one call per unique keyword) ---');
  try {
    await cache.fetchAll(KEYWORDS, MARKET, provider);
  } catch (e) {
    if (e instanceof CostGateRefusedError) console.error('COST GATE REFUSED:', e.reason);
    else console.error('SERP fetch failed:', (e as Error).message);
  }

  for (const kw of KEYWORDS) {
    const result = await cache.getOrFetch(kw, MARKET, provider); // already cached — no new network call
    if (!result) {
      console.log(`  ${kw}: UNAVAILABLE this run`);
      continue;
    }
    console.log(`  ${kw}: ${result.topUrls.length} valid organic URL(s), ${result.topDomains.length} unique domain(s)`);
  }

  console.log('\n--- Pairwise SERP evidence ---');
  const overlapProvider = cache.asOverlapProvider(MARKET);
  for (let i = 0; i < KEYWORDS.length; i++) {
    for (let j = i + 1; j < KEYWORDS.length; j++) {
      const evidence = overlapProvider.getPairEvidence(KEYWORDS[i], KEYWORDS[j]);
      if (!evidence) {
        console.log(`  ${KEYWORDS[i]} <> ${KEYWORDS[j]}: UNKNOWN (too few valid organic results, or a fetch failed)`);
      } else {
        console.log(`  ${KEYWORDS[i]} <> ${KEYWORDS[j]}: score=${evidence.score.toFixed(2)} sharedUrls=${evidence.sharedUrls?.length ?? 0} sharedDomains=${evidence.sharedDomains?.length ?? 0}`);
      }
    }
  }

  const clusterInput: ClusteringKeywordInput[] = KEYWORDS.map((k, i) => ({ keywordId: String(i), keyword: k, normalizedKeyword: k }));
  const withoutSerp = clusterKeywords({ keywords: clusterInput });
  const withSerp = clusterKeywords({ keywords: clusterInput, serpOverlap: overlapProvider });

  const summarize = (out: ReturnType<typeof clusterKeywords>) => out.clusters.map((c) => ({ label: c.label, members: c.members.map((m) => m.keyword) }));
  console.log('\n--- Clustering WITHOUT SERP ---');
  console.log(JSON.stringify(summarize(withoutSerp), null, 2));
  console.log('\n--- Clustering WITH real SERP evidence ---');
  console.log(JSON.stringify(summarize(withSerp), null, 2));

  console.log('\nCumulative physical-attempt cost this run:', `$${budget.getCumulativeRunUsd()}`);
  console.log('NOTE: this call is NOT tracked in the Phase 4b.7 orchestrator month-to-date accounting (SearchMarketRun-based). Do not schedule this script.');
  provider.endRun();
  console.log('\n=== Done. Nothing was written to the database. ===');
}

main().catch((e) => {
  console.error('Validation run failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
