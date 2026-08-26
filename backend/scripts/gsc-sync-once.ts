/**
 * Run ONE manual GSC sync through the real production mechanism (runGscSync — the
 * exact function the worker/cron would call). Persists GSC metrics + recommendation
 * lifecycle data as designed. Run on a host with GSC_SITE_URL + GSC_SA_KEY_BASE64
 * + MONGO_URI. Never prints credentials (errors sanitized).
 *
 *   cd backend && npx ts-node scripts/gsc-sync-once.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { gscConfig } from '../src/modules/seo/gsc.config';
import { sanitizeGscError } from '../src/modules/seo/gsc.util';
import { runGscSync } from '../src/modules/seo/services/gsc.opportunity.service';

async function main() {
  console.log(`GSC configured: ${gscConfig.enabled ? 'YES' : 'NO'} | site=${gscConfig.siteUrl || '(unset)'} | key=${gscConfig.saKeyBase64 ? 'set(hidden)' : 'unset'}`);
  if (!gscConfig.enabled) { console.log('✗ GSC not configured — set GSC_SITE_URL and GSC_SA_KEY_BASE64.'); process.exit(1); }
  await mongoose.connect(config.mongo.uri);
  const run = await runGscSync('manual');
  console.log('SYNC RUN:', {
    id: String(run._id), status: run.status, dateRange: run.dateRange,
    pageRowsUpserted: run.pageRowsUpserted, queryPageRowsUpserted: run.queryPageRowsUpserted,
    opportunitiesDetected: run.opportunitiesDetected, error: run.error, // already sanitized
  });
  await mongoose.disconnect();
  process.exit(run.status === 'failed' ? 1 : 0);
}
main().catch(async (e) => {
  console.error('SYNC ERROR (sanitized):', sanitizeGscError(e));
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
