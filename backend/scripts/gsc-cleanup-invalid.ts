/**
 * ONE-TIME cleanup for the persistence bug where raw GSC URLs were stored as SEO
 * metric facts. A correctly-persisted row is keyed by a CANONICAL page
 * (normalizedUrl ∈ canonicalSet). Everything else is a bug artifact, in two kinds:
 *
 *   • invalid   — noindex-system / obsolete-soft404 / unresolved (never a page)
 *   • mis-keyed — a canonical/query/legacy/host variant stored under its RAW url
 *                 instead of the canonical (the fixed sync has re-persisted the
 *                 canonical version, so these are stale duplicates)
 *
 * Default deletes ONLY `invalid` (the narrow scope). Add --include-miskeyed to
 * also remove the stale mis-keyed variants. Preview by default; --apply to delete.
 *
 *   npx ts-node scripts/gsc-cleanup-invalid.ts                         # preview both categories
 *   npx ts-node scripts/gsc-cleanup-invalid.ts --apply                # delete invalid only
 *   npx ts-node scripts/gsc-cleanup-invalid.ts --apply --include-miskeyed
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { GscQueryPageMetric } from '../src/modules/seo/models/gsc-query-page-metric.model';
import { GscPageDailyMetric } from '../src/modules/seo/models/gsc-page-daily-metric.model';
import { buildSeoContext } from '../src/modules/seo/services/gsc.sync.service';
import { resolveGscUrl } from '../src/modules/seo/services/gsc.join';

const APPLY = process.argv.includes('--apply');
const INCLUDE_MISKEYED = process.argv.includes('--include-miskeyed');

type Doomed = { id: mongoose.Types.ObjectId; url: string; note: string };

async function main() {
  await mongoose.connect(config.mongo.uri);
  const { canonicalSet } = await buildSeoContext();
  if (!canonicalSet.size) {
    console.log('✗ No canonical audit snapshot found — refusing to run (would misclassify everything).');
    process.exit(1);
  }

  const scan = async (Model: typeof GscQueryPageMetric | typeof GscPageDailyMetric, label: string) => {
    const rows = await (Model as typeof GscQueryPageMetric).find().select('_id normalizedUrl').lean().exec();
    const invalid: Doomed[] = [];
    const miskeyed: Doomed[] = [];
    for (const r of rows) {
      if (canonicalSet.has(r.normalizedUrl)) continue; // correctly canonical → keep
      const res = resolveGscUrl(r.normalizedUrl, canonicalSet);
      const id = r._id as mongoose.Types.ObjectId;
      if (!res.joined) invalid.push({ id, url: r.normalizedUrl, note: res.classification });
      else miskeyed.push({ id, url: r.normalizedUrl, note: `→ ${res.canonicalUrl} (${res.classification})` });
    }
    console.log(`\n${label}: ${rows.length} rows | invalid ${invalid.length} | mis-keyed ${miskeyed.length}`);
    for (const d of invalid) console.log(`   INVALID    ${d.url}  [${d.note}]`);
    for (const d of miskeyed) console.log(`   MIS-KEYED  ${d.url}  ${d.note}`);

    if (APPLY) {
      const toDelete = INCLUDE_MISKEYED ? [...invalid, ...miskeyed] : invalid;
      if (toDelete.length) {
        const res = await (Model as typeof GscQueryPageMetric).deleteMany({ _id: { $in: toDelete.map((d) => d.id) } });
        console.log(`   ✓ deleted ${res.deletedCount}`);
      }
    }
    return { invalid: invalid.length, miskeyed: miskeyed.length };
  };

  const q = await scan(GscQueryPageMetric, 'GscQueryPageMetric');
  const p = await scan(GscPageDailyMetric, 'GscPageDailyMetric');
  const mode = APPLY ? (INCLUDE_MISKEYED ? 'APPLIED (invalid + mis-keyed)' : 'APPLIED (invalid only)') : 'PREVIEW (no changes)';
  console.log(`\n${mode} — invalid: qp ${q.invalid}, page ${p.invalid} | mis-keyed: qp ${q.miskeyed}, page ${p.miskeyed}`);
  if (!APPLY) console.log('Re-run with --apply (invalid only) or --apply --include-miskeyed (also stale variants).');
  await mongoose.disconnect();
  process.exit(0);
}
main().catch(async (e) => { console.error('CLEANUP ERROR:', e instanceof Error ? e.message : String(e)); try { await mongoose.disconnect(); } catch { /* ignore */ } process.exit(1); });
