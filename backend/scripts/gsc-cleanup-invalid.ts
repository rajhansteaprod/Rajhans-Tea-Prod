/**
 * ONE-TIME, NARROWLY-SCOPED cleanup for the persistence bug where raw GSC URLs
 * (noindex-system / obsolete-soft404 / unresolved) were stored as canonical SEO
 * metric facts. Deletes ONLY rows whose stored normalizedUrl does NOT resolve to
 * a joined canonical page. Canonical/query/legacy/host-alias rows are UNTOUCHED.
 *
 * Dry preview by default; pass --apply to delete.
 *   cd backend && npx ts-node scripts/gsc-cleanup-invalid.ts          # preview
 *   cd backend && npx ts-node scripts/gsc-cleanup-invalid.ts --apply  # delete
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { GscQueryPageMetric } from '../src/modules/seo/models/gsc-query-page-metric.model';
import { GscPageDailyMetric } from '../src/modules/seo/models/gsc-page-daily-metric.model';
import { buildSeoContext } from '../src/modules/seo/services/gsc.sync.service';
import { resolveGscUrl } from '../src/modules/seo/services/gsc.join';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(config.mongo.uri);
  const { canonicalSet } = await buildSeoContext();
  if (!canonicalSet.size) {
    console.log('✗ No canonical audit snapshot found — refusing to run (would misclassify everything).');
    process.exit(1);
  }

  const invalidClasses = new Set(['noindex-system', 'obsolete-soft404', 'unknown']);
  const scan = async (Model: typeof GscQueryPageMetric | typeof GscPageDailyMetric, label: string) => {
    const rows = await (Model as typeof GscQueryPageMetric).find().select('_id normalizedUrl').lean().exec();
    const doomed: { id: unknown; url: string; cls: string }[] = [];
    for (const r of rows) {
      const res = resolveGscUrl(r.normalizedUrl, canonicalSet);
      if (!res.joined && invalidClasses.has(res.classification)) doomed.push({ id: r._id, url: r.normalizedUrl, cls: res.classification });
    }
    console.log(`\n${label}: ${rows.length} rows | INVALID to remove: ${doomed.length}`);
    for (const d of doomed) console.log(`   - ${d.url}  [${d.cls}]`);
    if (APPLY && doomed.length) {
      const r = await (Model as typeof GscQueryPageMetric).deleteMany({ _id: { $in: doomed.map((d) => d.id) } });
      console.log(`   ✓ deleted ${r.deletedCount}`);
    }
    return doomed.length;
  };

  const q = await scan(GscQueryPageMetric, 'GscQueryPageMetric');
  const p = await scan(GscPageDailyMetric, 'GscPageDailyMetric');
  console.log(`\n${APPLY ? 'APPLIED' : 'PREVIEW (no changes — pass --apply to delete)'} — invalid query-page: ${q}, invalid page-daily: ${p}`);
  await mongoose.disconnect();
  process.exit(0);
}
main().catch(async (e) => { console.error('CLEANUP ERROR:', e instanceof Error ? e.message : String(e)); try { await mongoose.disconnect(); } catch { /* ignore */ } process.exit(1); });
