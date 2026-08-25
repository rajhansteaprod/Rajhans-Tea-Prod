import mongoose from 'mongoose';
import { gscConfig } from '../gsc.config';
import { seoConfig } from '../seo.config';
import { fingerprint, normalizeUrl } from '../seo.util';
import { OpportunityConfidence, OpportunityDraft, SeoJoinFacts } from '../gsc.types';
import { RecommendationImpact, RecommendationPriority } from '../seo.types';
import { AnalyzeInput, runAllAnalyzers } from './gsc.analyzers';
import { FetchedMetrics, buildSeoJoin, fetchGscMetrics, persistMetrics } from './gsc.sync.service';
import { SeoRecommendation } from '../models/seo-recommendation.model';
import { GscSyncRun, IGscSyncRunDoc } from '../models/gsc-sync-run.model';
import { GscSyncTrigger } from '../gsc.types';
import { sanitizeGscError } from '../gsc.util';
import { logger } from '../../../utils/logger';

const PRIORITY_ORDER: RecommendationPriority[] = ['low', 'medium', 'high'];
const recoFingerprint = (recommendationId: string, discriminator = '') => fingerprint(recommendationId, 'reco', discriminator);

/** Capped, configurable demand bonus. Kept SEPARATE from technical severity. */
export function demandBonus(impressions: number): number {
  if (!gscConfig.demandBoost.enabled || impressions <= 0) return 0;
  const b = gscConfig.demandBoost;
  return Math.round(Math.min(b.maxBonus, (impressions / b.impressionsForMax) * b.maxBonus));
}

/** Lift a base priority by demand, capped at maxPriorityLift. Never a critical jump. */
export function liftPriority(base: RecommendationPriority, bonus: number): { priority: RecommendationPriority; lifted: boolean } {
  const idx = PRIORITY_ORDER.indexOf(base);
  const levels = Math.min(gscConfig.demandBoost.maxPriorityLift, Math.floor(bonus / Math.max(1, gscConfig.demandBoost.maxBonus / 2)));
  const newIdx = Math.min(PRIORITY_ORDER.length - 1, idx + levels);
  return { priority: PRIORITY_ORDER[newIdx], lifted: newIdx > idx };
}

/** Opportunity score + confidence → recommendation priority/impact. Low confidence never presents as high. */
export function opportunityPriority(score: number, confidence: OpportunityConfidence): { priority: RecommendationPriority; impact: RecommendationImpact } {
  let priority: RecommendationPriority = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  if (confidence === 'low' && priority === 'high') priority = 'medium';
  const impact: RecommendationImpact = score >= 70 ? 'very-high' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { priority, impact };
}

/** The normalized hub URLs a demandful query should not have to rank via. */
export function hubNormalizedUrls(): Set<string> {
  return new Set(gscConfig.hubPaths.map((p) => normalizeUrl(`${seoConfig.baseUrl}${p}`)));
}

/** Pure: compute opportunities from fetched metrics + the SEO join. No persist. */
export function computeOpportunities(metrics: FetchedMetrics, seo: Map<string, SeoJoinFacts>): OpportunityDraft[] {
  const input: AnalyzeInput = {
    queryPage: metrics.queryPage,
    pageLatest: metrics.pageLatest,
    pagePrevious: metrics.pagePrevious,
    seo,
    hubNormalizedUrls: hubNormalizedUrls(),
    window: metrics.window,
    previousWindow: metrics.previousWindow,
  };
  return runAllAnalyzers(input).sort((a, b) => b.score - a.score);
}

/** Per-URL window impressions (page-level demand), from the latest window rollup. */
export function impressionsByUrl(metrics: FetchedMetrics): Map<string, number> {
  return new Map(metrics.pageLatest.map((p) => [p.normalizedUrl, p.impressions]));
}

export interface DemandBoostPreview {
  recommendationId: string;
  url: string;
  impressions: number;
  bonus: number;
  basePriority: RecommendationPriority;
  effectivePriority: RecommendationPriority;
  lifted: boolean;
}

/** In-memory demand-boost preview for existing open audit recs (dry-run reporting; no writes). */
export async function previewDemandBoost(metrics: FetchedMetrics): Promise<DemandBoostPreview[]> {
  const imprByUrl = impressionsByUrl(metrics);
  const recs = await SeoRecommendation.find({ status: 'open', source: { $ne: 'gsc' } }).select('recommendationId affectedUrls priority').lean().exec();
  const out: DemandBoostPreview[] = [];
  for (const r of recs) {
    let best = 0;
    let bestUrl = '';
    for (const u of r.affectedUrls || []) {
      const imp = imprByUrl.get(u) || 0;
      if (imp > best) { best = imp; bestUrl = u; }
    }
    const bonus = demandBonus(best);
    if (!bonus) continue;
    const { priority, lifted } = liftPriority(r.priority as RecommendationPriority, bonus);
    out.push({ recommendationId: r.recommendationId, url: bestUrl, impressions: best, bonus, basePriority: r.priority as RecommendationPriority, effectivePriority: priority, lifted });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

/**
 * Persist GSC opportunities as SeoRecommendations (source 'gsc') with an
 * independent NEW/RESOLVED lifecycle, and attach the capped demand bonus to
 * existing audit recs. Never touches audit recs' base severity/priority.
 */
export async function generateAndPersistOpportunities(
  runId: mongoose.Types.ObjectId,
  fetched?: FetchedMetrics,
): Promise<{ opportunities: number; demandBoosted: number }> {
  const metrics = fetched ?? (await fetchGscMetrics());
  const urls = new Set<string>([...metrics.queryPage.map((q) => q.normalizedUrl), ...metrics.pageLatest.map((p) => p.normalizedUrl)]);
  const seo = await buildSeoJoin(urls);
  const drafts = computeOpportunities(metrics, seo);

  const detected = new Map<string, OpportunityDraft>();
  for (const d of drafts) detected.set(recoFingerprint(`gsc-${d.type}`, d.key), d);

  for (const [fp, d] of detected) {
    const { priority, impact } = opportunityPriority(d.score, d.confidence);
    const common = {
      recommendationId: `gsc-${d.type}`,
      category: 'search-opportunity' as const,
      priority,
      impact,
      score: d.score,
      title: d.title,
      why: d.why,
      suggestedFix: d.suggestedFix,
      estimatedEffort: 'medium' as const,
      affectedUrls: [d.normalizedUrl],
      evidence: d.evidence,
      relatedCheckIds: (d.evidence.relatedIssueCheckIds as string[]) ?? [],
      automationLevel: 'recommend' as const,
      source: 'gsc' as const,
    };
    const existing = await SeoRecommendation.findOne({ fingerprint: fp }).exec();
    if (!existing) {
      await SeoRecommendation.create({ fingerprint: fp, ...common, status: 'open', firstSeenRunId: runId, lastSeenRunId: runId });
    } else {
      Object.assign(existing, common);
      existing.status = 'open';
      existing.resolvedRunId = null;
      existing.lastSeenRunId = runId;
      await existing.save();
    }
  }

  // Resolve GSC recs not regenerated this sync (scoped to source 'gsc').
  const openGsc = await SeoRecommendation.find({ status: 'open', source: 'gsc' }).exec();
  for (const r of openGsc) {
    if (detected.has(r.fingerprint)) continue;
    r.status = 'resolved';
    r.resolvedRunId = runId;
    r.lastSeenRunId = runId;
    await r.save();
  }

  // Attach capped demand bonus to existing audit recs (severity untouched).
  const imprByUrl = impressionsByUrl(metrics);
  const auditRecs = await SeoRecommendation.find({ status: 'open', source: { $ne: 'gsc' } }).exec();
  let demandBoosted = 0;
  for (const r of auditRecs) {
    let best = 0;
    for (const u of r.affectedUrls || []) best = Math.max(best, imprByUrl.get(u) || 0);
    const bonus = demandBonus(best);
    if (r.demandBonus !== bonus || r.demandImpressions !== best) {
      r.demandBonus = bonus;
      r.demandImpressions = best;
      await r.save();
    }
    if (bonus > 0) demandBoosted++;
  }

  logger.info({ runId: runId.toString(), opportunities: detected.size, demandBoosted }, 'GSC opportunities generated');
  return { opportunities: detected.size, demandBoosted };
}

/**
 * Full GSC sync orchestrator: one fetch → persist metrics → generate/diff
 * opportunities + attach demand boosts → finalize the GscSyncRun. Isolated with
 * sanitized errors; never leaks credentials, never affects the audit pipeline.
 */
export async function runGscSync(trigger: GscSyncTrigger): Promise<IGscSyncRunDoc> {
  const run = await GscSyncRun.create({ trigger, status: 'running', startedAt: new Date() });
  try {
    if (!gscConfig.enabled) throw new Error('GSC is not configured (site URL / credential absent)');
    const metrics = await fetchGscMetrics();
    const { pageRows, qpRows } = await persistMetrics(run._id, metrics);
    const { opportunities } = await generateAndPersistOpportunities(run._id, metrics);
    run.status = 'completed';
    run.dateRange = { start: metrics.backfill.start, end: metrics.backfill.end };
    run.pageRowsUpserted = pageRows;
    run.queryPageRowsUpserted = qpRows;
    run.opportunitiesDetected = opportunities;
    run.finishedAt = new Date();
    await run.save();
    logger.info({ runId: run._id.toString(), pageRows, qpRows, opportunities }, 'GSC sync completed');
    return run;
  } catch (err) {
    run.status = 'failed';
    run.error = sanitizeGscError(err); // sanitized — never credential material
    run.finishedAt = new Date();
    await run.save();
    logger.error({ runId: run._id.toString(), err: run.error }, 'GSC sync failed');
    return run;
  }
}
