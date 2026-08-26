/**
 * READ-ONLY Phase 4a GSC dry-run. Run in an environment with the real credential
 * (GSC_SA_KEY_BASE64) + GSC_SITE_URL + MONGO_URI. Authenticates, pulls GSC data,
 * resolves GSC URLs to canonical pages, joins to the latest SEO audit, computes
 * opportunities, and prints a full report. PERSISTS NOTHING; never prints
 * credential material (all errors sanitized).
 *
 *   cd backend && npx ts-node scripts/gsc-dryrun.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { gscConfig } from '../src/modules/seo/gsc.config';
import { sanitizeGscError } from '../src/modules/seo/gsc.util';
import { verifyAccess } from '../src/modules/seo/services/gsc.client';
import { fetchGscMetrics, buildSeoContext } from '../src/modules/seo/services/gsc.sync.service';
import { resolveMetrics } from '../src/modules/seo/services/gsc.join';
import { computeOpportunities, previewDemandBoost } from '../src/modules/seo/services/gsc.opportunity.service';
import { queryPageEligibility } from '../src/modules/seo/services/gsc.analyzers';

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(74));
const short = (u: string) => u.replace(gscConfig.siteUrl.replace('sc-domain:', 'https://'), '').replace('https://rajhanstea.com', '');

async function main() {
  hr();
  line('PHASE 4a — GSC READ-ONLY DRY-RUN (no writes; credentials never printed)');
  hr();
  line(`GSC configured: ${gscConfig.enabled ? 'YES' : 'NO'} | site=${gscConfig.siteUrl || '(unset)'} | key=${gscConfig.saKeyBase64 ? 'set(hidden)' : 'unset'}`);
  if (!gscConfig.enabled) { line('\n✗ GSC not configured — set GSC_SITE_URL and GSC_SA_KEY_BASE64.'); process.exit(1); }

  const auth = await verifyAccess();
  line(`1) API authentication: ${auth.ok ? '✓ success' : '✗ ' + auth.detail}`);
  if (!auth.ok) process.exit(1);

  let raw;
  try { raw = await fetchGscMetrics(); } catch (e) { line(`✗ property access/fetch failed: ${sanitizeGscError(e)}`); process.exit(1); }
  line('2) GSC property access: ✓');
  line(`3) Windows — opportunity ${raw.window.start}…${raw.window.end} | previous ${raw.previousWindow.start}…${raw.previousWindow.end} | backfill ${raw.backfill.start}…${raw.backfill.end}`);
  line(`4) Page-daily rows: ${raw.pageDaily.length}   5) Query-page rows: ${raw.queryPage.length}`);

  await mongoose.connect(config.mongo.uri);
  const { canonicalSet, facts } = await buildSeoContext();
  const { metrics, queryPageResolutions, urlResolutions } = resolveMetrics(raw, canonicalSet);

  const joined = urlResolutions.filter((r) => r.joined);
  line(`\n6) Canonical inventory pages: ${canonicalSet.size} | GSC URLs seen: ${urlResolutions.length} | JOINED: ${joined.length}/${urlResolutions.length}`);
  line('\n=== URL RESOLUTION / CLASSIFICATION ===');
  line('   originalUrl → canonical | classification (method)');
  for (const r of urlResolutions.sort((a, b) => Number(b.joined) - Number(a.joined))) {
    line(`   ${short(r.originalNormalized) || '/'} ${r.joined ? '→ ' + (short(r.canonicalUrl!) || '/') : '→ (not joined)'} | ${r.classification} (${r.method})`);
  }

  line('\n=== ALL QUERY×PAGE ROWS ===');
  line('   query | page → canonical | clicks | impr | ctr | pos | joined | eligibility');
  for (const r of queryPageResolutions) {
    const el = queryPageEligibility({ ...r, normalizedUrl: r.resolution.canonicalUrl ?? r.normalizedUrl }, r.resolution.joined);
    line(`   "${r.query}" | ${short(r.normalizedUrl)}${r.resolution.joined ? '→' + short(r.resolution.canonicalUrl!) : ''} | ${r.clicks} | ${r.impressions} | ${(r.ctr * 100).toFixed(1)}% | ${r.position.toFixed(1)} | ${r.resolution.joined ? 'Y' : 'N'} | ${el.reason}`);
  }

  line('\n=== TOP PAGE ROWS (resolved, by impressions) ===');
  for (const p of [...metrics.pageLatest].sort((a, b) => b.impressions - a.impressions).slice(0, 15)) {
    line(`   ${short(p.normalizedUrl) || '/'} | impr ${p.impressions} clicks ${p.clicks} ctr ${(p.ctr * 100).toFixed(1)}% pos ${p.position.toFixed(1)}`);
  }

  const opps = computeOpportunities(metrics, facts);
  const byType = new Map<string, number>();
  const byConf = { low: 0, medium: 0, high: 0 } as Record<string, number>;
  for (const o of opps) { byType.set(o.type, (byType.get(o.type) || 0) + 1); byConf[o.confidence]++; }
  line(`\n=== OPPORTUNITIES: ${opps.length} ===`);
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) line(`   ${t}: ${n}`);
  line(`   confidence: high ${byConf.high} · medium ${byConf.medium} · low ${byConf.low}`);
  for (const o of opps.slice(0, 20)) line(`   [${o.score.toFixed(0)} · ${o.confidence}] ${o.type} — ${o.query ? '"' + o.query + '"' : short(o.normalizedUrl)}`);

  const boosts = await previewDemandBoost(metrics);
  const lifted = boosts.filter((b) => b.lifted);
  line(`\n=== DEMAND BOOSTS on existing recs: ${boosts.length}; priority changed: ${lifted.length} ===`);
  for (const b of boosts.slice(0, 15)) line(`   ${b.recommendationId} (${short(b.url)}) impr ${b.impressions} → ${b.basePriority}${b.lifted ? ' ⇒ ' + b.effectivePriority : ''} (bonus ${b.bonus})`);

  line('\n=== SANITIZER DEMONSTRATION ===');
  const secretDemo = 'ERR -----BEGIN PRIVATE KEY-----MIIEvQIBADANBgkq...midbody...abc-----END PRIVATE KEY----- ' +
    'Bearer abcTOKEN123 jwt=eyJhbGci.eyJzdWIi.SIGabc access_token=ya29.SECRETVALUE "private_key":"-----BEGIN PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END PRIVATE KEY-----\\n"';
  line('   ' + sanitizeGscError(new Error(secretDemo)));

  hr();
  line('DRY-RUN COMPLETE — nothing written. Review before enabling the cron.');
  hr();
  await mongoose.disconnect();
  process.exit(0);
}
main().catch(async (e) => {
  console.error('DRY-RUN ERROR (sanitized):', sanitizeGscError(e));
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
