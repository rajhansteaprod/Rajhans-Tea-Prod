/**
 * Phase 4b.2 — FIRST real DataForSEO validation run.
 *
 * WRITES NOTHING TO THE DATABASE. No SearchMarketRun, SearchKeyword, or
 * SearchKeywordMetric rows are created. This script only calls the provider
 * (after explicit cost approval) and prints results. Persistence is a
 * separately-approved follow-up after this output is reviewed.
 *
 * All 12 approved seeds are sent as ONE Keyword Ideas task (DataForSEO Labs
 * supports up to 200 seed keywords per task) — NOT 12 separate paid calls.
 *
 * Usage (from backend/ — uses tsconfig.scripts.json, NOT the main src tsconfig,
 * since this file needs Node globals/types and lives outside rootDir "./src"):
 *   npm run market:validate-dataforseo
 *     → prints the exact calculated estimate and stops (no call made).
 *
 *   npm run market:validate-dataforseo -- --confirm
 *     → calls DataForSEO once for all 12 seeds, after the cost gate passes.
 *
 * Equivalent direct invocation:
 *   npx ts-node --project tsconfig.scripts.json scripts/market-validate-dataforseo.ts [--confirm]
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

// Conservative first-test limit — enough real keyword ideas to inspect without
// retrieving the 700-1000-item default/max unnecessarily.
const RESULT_LIMIT = 200;

async function main() {
  const confirmed = process.argv.includes('--confirm');

  bootstrapMarketProviders();
  if (!providerRegistry.hasCapability('keyword-demand')) {
    console.error('DataForSEO is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing). Nothing to validate.');
    process.exitCode = 1;
    return;
  }
  const provider = providerRegistry.require<KeywordDemandProvider>('keyword-demand') as DataForSeoProvider;

  // Pre-flight: ONE Keyword Ideas task for all 12 seeds (well under the 200
  // seeds/task limit), estimated using the CONFIGURED pricing table — task cost
  // + (requested limit × per-item cost), printed BEFORE anything is approved.
  const op: ProviderOp = { capability: 'keyword-demand', op: 'discoverKeywords', units: RESULT_LIMIT };
  const estimate = provider.estimateCost(op);

  console.log('=== Phase 4b.2 — DataForSEO validation run (NO PERSISTENCE) ===');
  console.log('Seeds submitted:', SEEDS.length, '(all in ONE Keyword Ideas task — provider allows up to 200 seeds/task)');
  console.log('Requested result limit:', RESULT_LIMIT);
  console.log('location_code:', 2356, '| language_code: en | include_serp_info: false | include_clickstream_data: false');
  console.log('Estimated cost (from configured pricing table):', JSON.stringify(estimate));
  console.log(`TOTAL estimated cost for this task: ${estimate.usd === null ? 'UNKNOWN' : `$${estimate.usd}`}`);

  const needsApproval = estimate.usd === null || estimate.usd > MANUAL_APPROVAL_USD;
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
  // call; the gate is enforced inside the provider itself (not only here), and
  // charges every physical HTTP attempt (including retries) cumulatively.
  const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: confirmed });
  provider.beginRun(budget);

  let retained: KeywordDemandResult[] = [];
  let degraded = false;
  let errorMessage: string | null = null;

  try {
    retained = await provider.discoverKeywords(SEEDS, MARKET, { limit: RESULT_LIMIT });
  } catch (e) {
    degraded = true;
    errorMessage = e instanceof CostGateRefusedError ? `COST GATE REFUSED: ${e.reason}` : (e as Error).message;
  }

  console.log('\n--- Results (sanitized, not persisted) ---');
  console.log('Keywords returned:', retained.length);
  console.log('Run degraded:', degraded);
  if (errorMessage) console.log('Error:', errorMessage);
  console.log('Cumulative actual-run cost (estimate-based; DataForSEO billing API not queried here):', `$${budget.getCumulativeRunUsd()}`);

  const withMetrics = retained.filter((r) => r.inlineMetrics).map((r) => r.inlineMetrics!);
  const returnedKeywordsMissingMetrics = diffMissingMetrics(retained.map((r) => r.keyword), withMetrics);
  console.log('Rows with inline metrics (no separate getMetrics call made):', withMetrics.length, '/', retained.length);
  console.log('Returned keywords with no inline metrics (UNKNOWN, not rejected):', returnedKeywordsMissingMetrics.length);

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
