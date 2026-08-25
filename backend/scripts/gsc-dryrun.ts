/**
 * READ-ONLY Phase 4a GSC dry-run. Run this in an environment that has the real
 * credential (GSC_SA_KEY_BASE64) + GSC_SITE_URL + MONGO_URI. It authenticates,
 * pulls GSC data, joins it to the latest SEO audit snapshot, computes
 * opportunities, and prints a full report. It PERSISTS NOTHING and never prints
 * credential material (all errors are sanitized).
 *
 *   cd backend && npx ts-node scripts/gsc-dryrun.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { gscConfig } from '../src/modules/seo/gsc.config';
import { sanitizeGscError } from '../src/modules/seo/gsc.util';
import { verifyAccess } from '../src/modules/seo/services/gsc.client';
import { fetchGscMetrics, buildSeoJoin } from '../src/modules/seo/services/gsc.sync.service';
import { computeOpportunities, previewDemandBoost } from '../src/modules/seo/services/gsc.opportunity.service';

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(70));

async function main() {
  hr();
  line('PHASE 4a — GSC READ-ONLY DRY-RUN (no writes, credentials never printed)');
  hr();

  // ── config presence (never prints the key) ──
  line(`GSC configured:        ${gscConfig.enabled ? 'YES' : 'NO'}`);
  line(`GSC_SITE_URL set:      ${gscConfig.siteUrl ? 'YES (' + gscConfig.siteUrl + ')' : 'NO'}`);
  line(`GSC_SA_KEY_BASE64 set: ${gscConfig.saKeyBase64 ? 'YES (hidden)' : 'NO'}`);
  if (!gscConfig.enabled) {
    line('\n✗ GSC is not configured — set GSC_SITE_URL and GSC_SA_KEY_BASE64 and retry.');
    process.exit(1);
  }

  // ── 1) authentication ──
  const auth = await verifyAccess();
  line(`\n1) API authentication: ${auth.ok ? '✓ success' : '✗ failed — ' + auth.detail}`);
  if (!auth.ok) process.exit(1);

  // ── fetch (read-only) — also exercises property access + pagination ──
  let metrics;
  try {
    metrics = await fetchGscMetrics();
  } catch (e) {
    line(`\n✗ GSC property access / fetch FAILED (sanitized): ${sanitizeGscError(e)}`);
    process.exit(1);
  }
  line('2) GSC property access: ✓ (searchAnalytics.query returned)');
  line(`3) Date range retrieved:`);
  line(`     opportunity window: ${metrics.window.start} … ${metrics.window.end}`);
  line(`     previous window:    ${metrics.previousWindow.start} … ${metrics.previousWindow.end}`);
  line(`     page-daily backfill: ${metrics.backfill.start} … ${metrics.backfill.end}`);
  line(`4) Page-daily rows:      ${metrics.pageDaily.length}`);
  line(`5) Query-page rows:      ${metrics.queryPage.length}`);
  line(`   pagination/quota:     rowLimit=${gscConfig.rowLimit}, maxRows=${gscConfig.maxRows}; ` +
    `${metrics.queryPage.length >= gscConfig.rowLimit || metrics.pageDaily.length >= gscConfig.rowLimit ? 'PAGINATED (hit a page boundary)' : 'single page each'}; no 429s surfaced (retries handled internally)`);

  // ── SEO join (needs Mongo) ──
  await mongoose.connect(config.mongo.uri);
  const urls = new Set<string>([...metrics.queryPage.map((q) => q.normalizedUrl), ...metrics.pageLatest.map((p) => p.normalizedUrl)]);
  const seo = await buildSeoJoin(urls);
  const joined = [...urls].filter((u) => seo.get(u)?.inSnapshot);
  const notJoined = [...urls].filter((u) => !seo.get(u)?.inSnapshot);
  line(`\n6) Pages joined to SEO inventory:    ${joined.length}/${urls.size}`);
  line(`7) Pages that did NOT join:          ${notJoined.length}`);
  for (const u of notJoined.slice(0, 15)) line(`     · ${u}  — not in latest audit snapshot (query-variant/legacy/uncrawled)`);
  if (notJoined.length > 15) line(`     …and ${notJoined.length - 15} more`);

  // ── opportunities ──
  const opps = computeOpportunities(metrics, seo);
  const byType = new Map<string, number>();
  const byConf = { low: 0, medium: 0, high: 0 } as Record<string, number>;
  for (const o of opps) { byType.set(o.type, (byType.get(o.type) || 0) + 1); byConf[o.confidence]++; }

  line(`\n8) Opportunities by type (${opps.length} total):`);
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) line(`     ${t}: ${n}`);
  line(`10) Confidence distribution: high ${byConf.high} · medium ${byConf.medium} · low ${byConf.low}`);

  line(`\n9) Top 20 opportunities:`);
  for (const o of opps.slice(0, 20)) {
    const q = o.query ? `"${o.query}"` : o.normalizedUrl.replace(gscConfig.siteUrl, '');
    const e = o.evidence;
    line(`   [${o.score.toFixed(0)} · ${o.confidence}] ${o.type} — ${q}` +
      (e.impressions !== undefined ? ` | impr=${e.impressions} clicks=${e.clicks ?? 0} pos=${(e.position ?? 0).toFixed(1)} ctr=${((e.ctr ?? 0) * 100).toFixed(1)}%` : ''));
  }

  // ── demand-driven priority changes on existing recs ──
  const boosts = await previewDemandBoost(metrics);
  const lifted = boosts.filter((b) => b.lifted);
  line(`\n11) Existing recommendations with GSC demand: ${boosts.length}; priority CHANGED by demand: ${lifted.length}`);
  for (const b of lifted.slice(0, 15)) line(`     · ${b.recommendationId} (${b.url}) impr=${b.impressions} → ${b.basePriority} ⇒ ${b.effectivePriority} (bonus ${b.bonus})`);

  // ── 12) sanitized failure behavior demo ──
  line(`\n12) Sanitized failure behavior:`);
  line(`     ${sanitizeGscError(new Error('boom -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY----- token=ya29.SECRET'))}`);

  hr();
  line('DRY-RUN COMPLETE — nothing was written. Review before enabling the cron.');
  hr();
  await mongoose.disconnect();
  process.exit(0);
}
main().catch(async (e) => {
  console.error('DRY-RUN ERROR (sanitized):', sanitizeGscError(e));
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
