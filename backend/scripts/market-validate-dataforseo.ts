/**
 * Phase 4b.2 — FIRST real DataForSEO validation run.
 *
 * WRITES NOTHING TO THE DATABASE. No SearchMarketRun, SearchKeyword, or
 * SearchKeywordMetric rows are created. This script only calls the provider
 * (after explicit cost approval) and prints results. Persistence is a
 * separately-approved follow-up after this output is reviewed.
 *
 * Usage:
 *   npx ts-node backend/scripts/market-validate-dataforseo.ts
 *     → prints the estimate and stops (no call made).
 *
 *   npx ts-node backend/scripts/market-validate-dataforseo.ts --confirm
 *     → calls DataForSEO for the fixed 12-seed list, after the cost gate passes.
 *
 * Requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the environment.
 */
import { bootstrapMarketProviders } from '../src/modules/seo/market/providers/provider.bootstrap';
import { providerRegistry } from '../src/modules/seo/market/providers/provider.registry';
import { RunBudget } from '../src/modules/seo/market/providers/dataforseo/run-budget';
import { DataForSeoProvider, CostGateRefusedError } from '../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { KeywordDemandProvider, KeywordDemandResult, Market, ProviderOp } from '../src/modules/seo/market/market.types';
import { diffMissingMetrics } from '../src/modules/seo/market/providers/dataforseo/dataforseo.mapper';

const SEEDS = [
  'Assam tea',
  'CTC tea',
  'kadak chai',
  'chai patti',
  'strong tea',
  'Darjeeling tea',
  'Nilgiri tea',
  'Dooars tea',
  'loose leaf tea',
  'tea for milk chai',
  'buy tea online',
  'bulk tea',
];

const MARKET: Market = { country: 'IN', language: 'en', currency: 'INR', device: 'all' };
const MANUAL_APPROVAL_USD = 0.5;

async function main() {
  const confirmed = process.argv.includes('--confirm');

  bootstrapMarketProviders();
  if (!providerRegistry.hasCapability('keyword-demand')) {
    console.error('DataForSEO is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing). Nothing to validate.');
    process.exitCode = 1;
    return;
  }
  const provider = providerRegistry.require<KeywordDemandProvider>('keyword-demand') as DataForSeoProvider;

  // Pre-flight: estimate cost for a discoverKeywords call per seed (each seed is
  // its own paid call), BEFORE anything is approved or executed.
  const perSeedOp: ProviderOp = { capability: 'keyword-demand', op: 'discoverKeywords', units: 100 }; // provider's configured pageSize
  const perSeedEstimate = provider.estimateCost(perSeedOp);
  const totalEstimateUsd = perSeedEstimate.usd === null ? null : Math.round(perSeedEstimate.usd * SEEDS.length * 100) / 100;

  console.log('=== Phase 4b.2 — DataForSEO validation run (NO PERSISTENCE) ===');
  console.log('Seeds submitted:', SEEDS.length);
  console.log('Per-seed estimate:', JSON.stringify(perSeedEstimate));
  console.log('TOTAL estimated cost for all 12 seeds:', totalEstimateUsd === null ? 'UNKNOWN' : `$${totalEstimateUsd}`);

  const needsApproval = totalEstimateUsd === null || totalEstimateUsd > MANUAL_APPROVAL_USD;
  console.log('Requires explicit manual approval (> $0.50 or UNKNOWN):', needsApproval);

  if (!confirmed) {
    console.log('\nNo --confirm flag passed. Stopping WITHOUT calling DataForSEO.');
    console.log('Re-run with --confirm only after reviewing the estimate above.');
    return;
  }

  if (needsApproval) {
    console.log('\n--confirm was passed — treating this explicit flag as the manual approval for this run.');
  }

  // Explicit approved execution/budget context — required before ANY capability
  // call; the gate is enforced inside the provider itself (not only here).
  const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: confirmed });
  provider.beginRun(budget);

  const retained: KeywordDemandResult[] = [];
  let rejectedCount = 0;
  const providerErrors: { seed: string; error: string }[] = [];
  let degraded = false;

  for (const seed of SEEDS) {
    try {
      const results = await provider.discoverKeywords(seed, MARKET);
      // "rejected" here means exact-duplicate-of-seed only (a placeholder filter —
      // no relevance/business filtering is applied in this validation run).
      for (const r of results) {
        if (r.keyword.trim().toLowerCase() === seed.trim().toLowerCase()) {
          rejectedCount++;
          continue;
        }
        retained.push(r);
      }
    } catch (e) {
      degraded = true;
      const message = e instanceof CostGateRefusedError ? `COST GATE REFUSED: ${e.reason}` : (e as Error).message;
      providerErrors.push({ seed, error: message });
      if (e instanceof CostGateRefusedError) {
        console.log(`\nCost gate refused further calls at seed "${seed}" — stopping run.`);
        break;
      }
    }
  }

  console.log('\n--- Results (sanitized, not persisted) ---');
  console.log('Keywords returned (retained):', retained.length);
  console.log('Rejected (exact seed dupes):', rejectedCount);
  console.log('Provider errors/degraded seeds:', providerErrors.length);
  if (providerErrors.length) console.log(JSON.stringify(providerErrors, null, 2));
  console.log('Run degraded:', degraded);
  console.log('Cumulative actual-run cost (estimate-based; DataForSEO billing API not queried here):', `$${budget.getCumulativeRunUsd()}`);

  const requestedKeywords = SEEDS;
  const missing = diffMissingMetrics(requestedKeywords, retained.filter((r) => r.inlineMetrics).map((r) => r.inlineMetrics!));
  console.log('Seeds with no inline metrics in the discovery response (UNKNOWN, not rejected):', missing);

  console.log('\nSample normalized keywords with inline metrics:');
  for (const r of retained.slice(0, 10)) {
    console.log(JSON.stringify({ keyword: r.keyword, inlineMetrics: r.inlineMetrics ?? 'UNKNOWN' }));
  }

  provider.endRun();
  console.log('\n=== Done. Nothing was written to the database. ===');
}

main().catch((e) => {
  console.error('Validation run failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
