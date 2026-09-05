/**
 * Phase 6.1 — Content Opportunity & Page Analysis CLI (manual entrypoint only;
 * NOT a cron job, NOT a BullMQ worker).
 *
 *   content-analyze                          dry run: analyse every eligible
 *                                            page, print the report, WRITE
 *                                            NOTHING AT ALL.
 *   content-analyze --url <canonical-url>    analyse one page.
 *   content-analyze --page-type product      restrict to one page type.
 *   content-analyze --limit 4                cap the batch (deterministic order).
 *   content-analyze --persist                additionally upsert the analysis
 *                                            artifacts. Still emits ZERO
 *                                            recommendations.
 *   content-analyze --json                   machine-readable output.
 *
 * SAFETY, enforced structurally by tests/unit/services/content-no-paid-calls.test.ts:
 * this phase performs zero CMS/product/category writes, zero public-site
 * mutation, zero execution, zero DataForSEO or other paid provider calls, zero
 * LLM calls and zero scheduling. It reads stored audit snapshots, stored Search
 * Console metrics and cached Phase 4B market evidence, and — only with
 * --persist — writes to its own SeoContentPageAnalysis collection.
 *
 * Recommendation emission is DELIBERATELY ABSENT. It is gated behind the 6.1.7
 * checkpoint review and is not implemented in this build; there is no flag that
 * turns it on.
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { analyzePages, persistAnalyses } from '../src/modules/seo/content/services/page-analysis.service';
import { previewContentRecommendations } from '../src/modules/seo/content/services/content-recommendation.service';
import { ContentPageAnalysis } from '../src/modules/seo/content/content.types';

const line = (s = '') => console.log(s);
const hr = (ch = '─') => line(ch.repeat(78));

const arg = (args: string[], name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const shortUrl = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function printAnalysis(a: ContentPageAnalysis): void {
  hr();
  line(`${a.pageType.toUpperCase()}  ${shortUrl(a.canonicalUrl)}`);
  hr('╌');

  // ── executability, first: it frames what any finding below can become ──
  line(`EXECUTABILITY : ${a.executability.status}`);
  line(`                ${a.executability.reason}`);
  if (a.executability.supportedFields.length) {
    line(`                writable fields: ${a.executability.supportedFields.join(', ')}`);
  }

  // ── current state ──
  const s = a.currentState;
  line('');
  line('CURRENT STATE');
  line(`  title           ${s.title === null ? '(absent)' : `"${s.title}"`} [${s.titleLength ?? '-'} chars]`);
  line(`  description     ${s.metaDescription === null ? '(absent)' : `"${s.metaDescription}"`} [${s.metaDescriptionLength ?? '-'} chars]`);
  line(`  headings        h1×${s.h1.length} h2×${s.h2.length} h3×${s.h3.length}${s.captureComplete ? '' : '  (NOT CAPTURED — pre-6.1 snapshot)'}`);
  if (s.h1.length) line(`    h1: ${s.h1.join(' | ')}`);
  if (s.h2.length) line(`    h2: ${s.h2.slice(0, 8).join(' | ')}${s.h2.length > 8 ? ` … +${s.h2.length - 8}` : ''}`);
  const reportWordCount = s.captureComplete ? s.visibleWordCount : s.wordCount;
  line(`  words           ${reportWordCount ?? '-'}${s.captureComplete ? ' visible content' : ' legacy full-document'}${s.normalizedTextTruncated ? '  (text truncated at capture)' : ''}`);
  line(`  faq             ${s.faqSignals ? `${s.faqSignals.questionHeadings} question headings, heading=${s.faqSignals.faqHeadingPresent}, schema=${s.faqSignals.faqSchemaPresent}` : '(not captured)'}`);
  line(`  schema          ${s.structuredDataTypes.length ? s.structuredDataTypes.join(', ') : '(none)'}`);
  line(`  internal links  ${s.internalLinks.inboundCount} inbound / ${s.internalLinks.outboundCount} outbound`);
  line(`  indexable       ${s.indexable}   inSitemap ${s.inSitemap}`);

  // ── search performance ──
  line('');
  if (!a.searchPerformance.known) {
    line('SEARCH CONSOLE  (no rows joined to this page — totals are UNKNOWN, not zero)');
  } else {
    const t = a.searchPerformance.totals!;
    line(`SEARCH CONSOLE  ${a.searchPerformance.period!.start}…${a.searchPerformance.period!.end}`);
    line(`  totals          ${t.impressions} impr / ${t.clicks} clicks / ctr ${pct(t.ctr)} / avg pos ${t.averagePosition.toFixed(1)}`);
    line(`  queries         ${a.searchPerformance.queryCount}${a.searchPerformance.queriesTruncated ? ` (showing top ${a.searchPerformance.queries.length})` : ''}`);
    for (const q of a.searchPerformance.queries.slice(0, 10)) {
      const flags = [q.branded ? 'branded' : null, ...q.eligibleFor].filter(Boolean).join(',') || '—';
      line(
        `    "${q.query}"  ${q.impressions} impr, ${q.clicks} clk, ctr ${pct(q.ctr)} (exp ${pct(q.expectedCtr)}), pos ${q.position.toFixed(1)} [${q.positionBucket}]  ${flags}`,
      );
    }
  }

  // ── market evidence ──
  line('');
  if (!a.marketEvidence.known) {
    line('MARKET (4B)     no mapped keywords in cache — nothing fetched');
  } else {
    line(`MARKET (4B)     ${a.marketEvidence.keywordCount} keyword(s), freshness ${a.marketEvidence.freshness}, serp snapshot ${a.marketEvidence.serpSnapshotAt?.toISOString().slice(0, 10) ?? 'none'}`);
    for (const k of a.marketEvidence.keywords.slice(0, 6)) {
      line(`    "${k.keyword}"  vol ${k.volumeKnown ? k.searchVolume : 'UNKNOWN'}  rel ${k.businessRelevanceBand ?? '-'}  ${k.freshness}`);
    }
  }

  // ── topic coverage ──
  if (a.topicCoverage.length) {
    line('');
    line('TOPIC COVERAGE  (only terms real demand points at)');
    for (const c of a.topicCoverage) {
      line(`    ${c.covered ? '✓' : '✗'} ${c.dimension}/${c.term}${c.covered ? ` — in ${c.foundIn}` : ' — not addressed anywhere'}  [${c.demandSource}]`);
    }
  }

  // ── findings ──
  line('');
  line(`OPPORTUNITIES   ${a.opportunities.length}`);
  for (const o of a.opportunities) {
    line(`  • ${o.type}  [priority ${o.priority} · evidence ${o.evidenceStrength}]`);
    line(`    ${o.explanation}`);
    if (o.affectedQueries.length) line(`    queries: ${o.affectedQueries.join(', ')}`);
    for (const e of o.evidence.slice(0, 4)) line(`    ← ${e.source}/${e.collection}: ${e.summary}`);
  }

  if (a.missingEvidence.length) {
    line('');
    line('MISSING / STALE EVIDENCE');
    for (const m of a.missingEvidence) {
      line(`  ! ${m.reason} (${m.source})`);
      line(`    ${m.detail}`);
      if (m.suppressedOpportunityTypes.length) line(`    suppressed: ${m.suppressedOpportunityTypes.join(', ')}`);
    }
  }

  line('');
  line(`PROVENANCE      analyzer ${a.analyzerVersion} · extractor ${a.extractorVersion ?? 'none (pre-6.1 snapshot)'}`);
  line(`                window ${a.evidenceWindowKey}`);
  line(`                inputsHash ${a.inputsHash.slice(0, 16)}…  snapshotHash ${a.evidenceWindow.snapshotContentHash?.slice(0, 12) ?? 'none'}`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = argv;
  const persist = args.includes('--persist');
  const recommendationPreview = args.includes('--recommendation-preview');
  const asJson = args.includes('--json');
  const url = arg(args, '--url');
  const pageType = arg(args, '--page-type');
  const limitRaw = arg(args, '--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    console.error(`--limit must be a positive number (got "${limitRaw}")`);
    process.exit(1);
  }

  if (recommendationPreview && asJson) {
    console.error('--recommendation-preview and --json are not combined in this checkpoint build');
    process.exit(1);
  }

  // autoIndex:false AND autoCreate:false — belt-and-suspenders on top of
  // --persist gating. These are TWO SEPARATE Mongoose connection options:
  // autoIndex controls automatic index builds; autoCreate controls automatic
  // collection creation (via createCollection) on model initialization, and
  // defaults to true independently of autoIndex — disabling only autoIndex
  // still lets Mongoose silently create an empty collection for this phase's
  // brand-new SeoContentPageAnalysis schema the moment it connects, in ANY
  // mode, persisted or not. (This codebase relies on the opposite default —
  // plain mongoose.connect(uri) with both left on — elsewhere; see
  // change-execution.service.ts.) Both must be off for this connection to be a
  // genuine no-footprint read against whatever database it points at.
  await mongoose.connect(config.mongo.uri, { autoIndex: false, autoCreate: false });
  try {
    const result = await analyzePages({
      urls: url ? [url] : undefined,
      pageType: pageType ?? undefined,
      limit,
    });

    if (asJson) {
      line(JSON.stringify(result, null, 2));
    } else {
      hr('═');
      line('PHASE 6.1 — CONTENT OPPORTUNITY & PAGE ANALYSIS');
      line(
        recommendationPreview
          ? 'MODE: recommendation preview — READ ONLY, WRITES NOTHING'
          : persist
            ? 'MODE: analyse + persist artifacts (zero recommendations, zero CMS writes)'
            : 'MODE: dry run — WRITES NOTHING',
      );
      hr('═');
      const su = result.summary;
      line(`analyzer        ${su.analyzerVersion}`);
      line(`audit run       ${su.auditRun.runId ?? 'none'} (${su.auditRun.status ?? '-'}, ${su.auditRun.ageDays ?? '-'} days old${su.auditRun.stale ? ', STALE' : ''})`);
      line(`gsc             ${su.gscConfigured ? 'configured' : 'NOT configured'}${su.gscPeriod ? ` · period ${su.gscPeriod.start}…${su.gscPeriod.end}` : ' · no stored period'}`);
      line(`pages           ${su.pagesAnalysed} analysed of ${su.pagesConsidered} candidates · outcome ${su.outcome}`);
      for (const d of su.degradationReasons) line(`  ! ${d}`);
      for (const s of su.pagesSkipped) line(`  ! skipped ${shortUrl(s.normalizedUrl)} — ${s.reason}`);

      for (const a of result.analyses) printAnalysis(a);

      hr('═');
      const counts = new Map<string, number>();
      for (const a of result.analyses) for (const o of a.opportunities) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
      line('OPPORTUNITY TOTALS');
      if (!counts.size) line('  (none)');
      for (const [type, n] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
        line(`  ${String(n).padStart(3)}  ${type}`);
      }
    }

    if (persist) {
      const res = await persistAnalyses(result.analyses);
      line('');
      line(`PERSISTED       ${res.created} created, ${res.updated} updated, ${res.pruned} pruned by retention`);
      line('                (SeoContentPageAnalysis only — no recommendation, CMS or catalog write)');
    }


    if (recommendationPreview) {
      const previews = await previewContentRecommendations(result.analyses);

      line('');
      hr('═');
      line('PHASE 6.2 — RECOMMENDATION PREVIEW');
      line('READ ONLY — no SeoRecommendation writes');
      hr('═');

      if (!previews.length) {
        line('  (no recommendation candidates)');
      }

      for (const preview of previews) {
        line(
          `  ${preview.action.toUpperCase().padEnd(10)} ${shortUrl(preview.normalizedUrl)}  ${preview.opportunityType}`,
        );
        line(
          `             priority ${preview.priority} · evidence ${preview.evidenceStrength}` +
            (preview.impact ? ` · impact ${preview.impact}` : ''),
        );
        line(`             ${preview.title}`);
        line(
          `             executability ${preview.executability.status}` +
            (preview.executability.supportedFields.length
              ? ` · ${preview.executability.supportedFields.join(', ')}`
              : ''),
        );
        line(`             approval ${preview.approvalPropensity}`);
        line(`             ${preview.approvalReason}`);
        line(`             ${preview.reason}`);
      }

      const counts = new Map<string, number>();
      const approvalCounts = new Map<string, number>();
      for (const preview of previews) {
        counts.set(preview.action, (counts.get(preview.action) ?? 0) + 1);
        approvalCounts.set(
          preview.approvalPropensity,
          (approvalCounts.get(preview.approvalPropensity) ?? 0) + 1,
        );
      }

      line('');
      line(
        `PREVIEW TOTALS  new ${counts.get('new') ?? 0} · update ${counts.get('update') ?? 0} · reopen ${counts.get('reopen') ?? 0} · suppressed ${counts.get('suppressed') ?? 0}`,
      );
      line(
        `APPROVAL       recommended ${approvalCounts.get('recommended_to_approve') ?? 0} · review ${approvalCounts.get('needs_review') ?? 0} · low urgency ${approvalCounts.get('low_urgency') ?? 0} · monitoring ${approvalCounts.get('monitoring') ?? 0}`,
      );
      line('                WRITES 0');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('content-analyze failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
