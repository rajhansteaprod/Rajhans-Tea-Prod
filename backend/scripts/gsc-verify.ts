/**
 * READ-ONLY verification of persisted GSC data + idempotency + rec sourcing.
 * Run after a manual sync (and again after a second sync to prove idempotency).
 * Never writes; never prints credentials.
 *
 *   cd backend && npx ts-node scripts/gsc-verify.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { gscConfig } from '../src/modules/seo/gsc.config';
import { GscSyncRun } from '../src/modules/seo/models/gsc-sync-run.model';
import { GscPageDailyMetric } from '../src/modules/seo/models/gsc-page-daily-metric.model';
import { GscQueryPageMetric } from '../src/modules/seo/models/gsc-query-page-metric.model';
import { SeoRecommendation } from '../src/modules/seo/models/seo-recommendation.model';
import { buildSeoContext } from '../src/modules/seo/services/gsc.sync.service';
import { resolveGscUrl } from '../src/modules/seo/services/gsc.join';

const line = (s = '') => console.log(s);

async function main() {
  line(`GSC configured: ${gscConfig.enabled ? 'YES' : 'NO'} | site=${gscConfig.siteUrl || '(unset)'} | key=${gscConfig.saKeyBase64 ? 'set(hidden)' : 'unset'}`);
  await mongoose.connect(config.mongo.uri);

  line('\n=== RECENT SYNC RUNS ===');
  for (const r of await GscSyncRun.find().sort({ createdAt: -1 }).limit(5).lean()) {
    line(`  ${new Date(r.createdAt).toISOString()} | ${r.status} | ${r.trigger} | pageRows ${r.pageRowsUpserted} qpRows ${r.queryPageRowsUpserted} opps ${r.opportunitiesDetected}${r.error ? ' | err ' + r.error : ''}`);
  }

  const pageTotal = await GscPageDailyMetric.countDocuments();
  const qpTotal = await GscQueryPageMetric.countDocuments();
  line(`\n=== METRIC COLLECTION TOTALS (stable across repeat syncs = idempotent) ===`);
  line(`  GscPageDailyMetric: ${pageTotal}   GscQueryPageMetric: ${qpTotal}`);

  const dupPages = await GscPageDailyMetric.aggregate([{ $group: { _id: { d: '$date', u: '$normalizedUrl' }, c: { $sum: 1 } } }, { $match: { c: { $gt: 1 } } }, { $count: 'n' }]);
  const dupQp = await GscQueryPageMetric.aggregate([{ $group: { _id: { p: '$periodEnd', q: '$query', u: '$normalizedUrl' }, c: { $sum: 1 } } }, { $match: { c: { $gt: 1 } } }, { $count: 'n' }]);
  line(`  duplicate (date,url) page rows: ${dupPages[0]?.n ?? 0}  |  duplicate (periodEnd,query,url) rows: ${dupQp[0]?.n ?? 0}  (both must be 0)`);

  line('\n=== CANONICAL-KEYING CHECK (against latest audit canonical set) ===');
  const { canonicalSet } = await buildSeoContext();
  const qpUrls: string[] = await GscQueryPageMetric.distinct('normalizedUrl');
  const pdUrls: string[] = await GscPageDailyMetric.distinct('normalizedUrl');
  const classify = (urls: string[]) => {
    const canonical: string[] = [], invalid: string[] = [], miskeyed: string[] = [];
    for (const u of urls) {
      if (canonicalSet.has(u)) canonical.push(u);
      else if (resolveGscUrl(u, canonicalSet).joined) miskeyed.push(u);
      else invalid.push(u);
    }
    return { canonical, invalid, miskeyed };
  };
  const qp = classify(qpUrls), pd = classify(pdUrls);
  line(`  canonicalSet size: ${canonicalSet.size}`);
  line(`  query-page urls  → canonical ${qp.canonical.length} | system/obsolete ${qp.invalid.length} | mis-keyed ${qp.miskeyed.length}`);
  if (qp.invalid.length) line(`     system/obsolete: ${qp.invalid.join(', ')}`);
  if (qp.miskeyed.length) line(`     mis-keyed: ${qp.miskeyed.join(', ')}`);
  line(`  page-daily urls  → canonical ${pd.canonical.length} | system/obsolete ${pd.invalid.length} | mis-keyed ${pd.miskeyed.length}`);
  line(`  ✔ target after cleanup: system/obsolete 0, mis-keyed 0`);

  line('\n=== RECOMMENDATIONS BY SOURCE ===');
  const auditOpen = await SeoRecommendation.countDocuments({ status: 'open', source: { $ne: 'gsc' } });
  const gscOpen = await SeoRecommendation.countDocuments({ status: 'open', source: 'gsc' });
  const boosted = await SeoRecommendation.countDocuments({ status: 'open', source: { $ne: 'gsc' }, demandBonus: { $gt: 0 } });
  line(`  open audit recs: ${auditOpen}  |  open GSC recs: ${gscOpen}  |  audit recs with GSC demand boost: ${boosted}`);

  await mongoose.disconnect();
  process.exit(0);
}
main().catch(async (e) => { console.error('VERIFY ERROR:', e instanceof Error ? e.message : String(e)); try { await mongoose.disconnect(); } catch { /* ignore */ } process.exit(1); });
