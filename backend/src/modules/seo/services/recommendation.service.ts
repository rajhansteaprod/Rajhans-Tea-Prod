import mongoose from 'mongoose';
import { SeoRecommendation, ISeoRecommendationDoc } from '../models/seo-recommendation.model';
import { SeoAuditRun } from '../models/seo-audit-run.model';
import { DetectedIssue, LinkResolution, PageObservation, RecommendationPriority } from '../seo.types';
import { fingerprint } from '../seo.util';
import { buildInboundCounts } from './crosspage.service';
import { generateDrafts, RecoContext } from './recommendation.generators';
import { scoreRecommendation } from './recommendation.scoring';

const recoFingerprint = (recommendationId: string, discriminator = '') =>
  fingerprint(recommendationId, 'reco', discriminator);

export interface RecommendationDiff {
  counts: { high: number; medium: number; low: number; highImpact: number; total: number };
  delta: { new: number; resolved: number; persistent: number };
}

/**
 * Generate recommendations from a completed run's audit output, score them, and
 * reconcile against the persistent recommendation set — the same baseline-aware,
 * resolution-gated lifecycle the SeoIssue diff uses (NEW / PERSISTENT / RESOLVED).
 * Purely read-only w.r.t. production; only writes to the recommendation collection.
 */
export async function generateAndPersistRecommendations(opts: {
  runId: mongoose.Types.ObjectId;
  isBaseline: boolean;
  /** False on baseline OR degraded runs — never resolve recs we can't trust. */
  allowResolution: boolean;
  baseUrl: string;
  detected: DetectedIssue[];
  observations: PageObservation[];
  linkResolutions: Map<string, LinkResolution>;
}): Promise<RecommendationDiff> {
  const { runId, isBaseline, allowResolution, baseUrl, detected, observations, linkResolutions } = opts;

  const inbound = buildInboundCounts(observations, linkResolutions, baseUrl);
  const ctx: RecoContext = { baseUrl, detected, observations, inbound };
  const drafts = generateDrafts(ctx);

  // Score + fingerprint every draft (dedupe defensively).
  const detectedNow = new Map<string, ReturnType<typeof scoreRecommendation> & { draft: (typeof drafts)[number] }>();
  for (const draft of drafts) {
    const fp = recoFingerprint(draft.recommendationId, draft.discriminator ?? '');
    const scored = scoreRecommendation(draft.affectedUrls, baseUrl, draft.signals);
    detectedNow.set(fp, { ...scored, draft });
  }

  const counts = { high: 0, medium: 0, low: 0, highImpact: 0, total: 0 };
  for (const { priority, impact } of detectedNow.values()) {
    counts[priority]++;
    counts.total++;
    if (impact === 'very-high' || impact === 'high') counts.highImpact++;
  }

  let newCount = 0;
  let resolvedCount = 0;

  // ── Upsert every detected recommendation ──
  for (const [fp, { priority, impact, score, draft }] of detectedNow) {
    const existing = await SeoRecommendation.findOne({ fingerprint: fp }).exec();
    const common = {
      recommendationId: draft.recommendationId,
      category: draft.category,
      priority,
      impact,
      score,
      title: draft.title,
      why: draft.why,
      suggestedFix: draft.suggestedFix,
      estimatedEffort: draft.estimatedEffort,
      affectedUrls: draft.affectedUrls,
      evidence: draft.evidence,
      relatedCheckIds: draft.relatedCheckIds ?? [],
      automationLevel: 'recommend' as const,
    };
    if (!existing) {
      await SeoRecommendation.create({
        fingerprint: fp,
        ...common,
        status: 'open',
        firstSeenRunId: runId,
        lastSeenRunId: runId,
      });
      if (!isBaseline) newCount++;
    } else {
      const wasResolved = existing.status === 'resolved';
      Object.assign(existing, common);
      existing.status = 'open';
      if (wasResolved) {
        existing.resolvedRunId = null;
        if (!isBaseline) newCount++; // a re-opened recommendation counts as newly actionable
      }
      existing.lastSeenRunId = runId;
      await existing.save();
    }
  }

  // ── Resolve open recommendations not regenerated this run (coverage-gated) ──
  if (allowResolution) {
    const open = await SeoRecommendation.find({ status: 'open' }).exec();
    for (const rec of open) {
      if (detectedNow.has(rec.fingerprint)) continue;
      rec.status = 'resolved';
      rec.resolvedRunId = runId;
      rec.lastSeenRunId = runId;
      await rec.save();
      resolvedCount++;
    }
  }

  const persistent = counts.total - newCount;
  return { counts, delta: { new: newCount, resolved: resolvedCount, persistent: Math.max(persistent, 0) } };
}

const idEq = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);

function toView(rec: ISeoRecommendationDoc, runId: string) {
  let state: 'new' | 'persistent' | 'resolved' = 'persistent';
  if (rec.status === 'resolved' && idEq(rec.resolvedRunId, runId)) state = 'resolved';
  else if (idEq(rec.firstSeenRunId, runId)) state = 'new';
  return {
    recommendationId: rec.recommendationId,
    category: rec.category,
    priority: rec.priority,
    impact: rec.impact,
    score: rec.score,
    title: rec.title,
    why: rec.why,
    suggestedFix: rec.suggestedFix,
    estimatedEffort: rec.estimatedEffort,
    affectedUrls: rec.affectedUrls,
    evidence: rec.evidence,
    relatedCheckIds: rec.relatedCheckIds,
    automationLevel: rec.automationLevel,
    state,
  };
}

const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

/** Recommendations report for a run (defaults to the latest completed run). */
export async function getRecommendationsReport(runIdArg?: string) {
  const run = runIdArg
    ? await SeoAuditRun.findById(runIdArg).lean().exec()
    : await SeoAuditRun.findOne({ status: { $in: ['completed', 'degraded'] } }).sort({ createdAt: -1 }).lean().exec();
  if (!run) return null;
  const runId = String(run._id);

  const openThisRun = await SeoRecommendation.find({ lastSeenRunId: runId, status: 'open' }).exec();
  const resolvedThisRun = await SeoRecommendation.find({ resolvedRunId: runId, status: 'resolved' }).exec();

  const open = openThisRun.map((r) => toView(r, runId)).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.score - a.score);
  const summary = {
    runId,
    date: run.createdAt,
    high: open.filter((r) => r.priority === 'high').length,
    medium: open.filter((r) => r.priority === 'medium').length,
    low: open.filter((r) => r.priority === 'low').length,
    highImpact: open.filter((r) => r.impact === 'very-high' || r.impact === 'high').length,
    total: open.length,
    delta: {
      new: open.filter((r) => r.state === 'new').length,
      persistent: open.filter((r) => r.state === 'persistent').length,
      resolved: resolvedThisRun.length,
    },
  };

  return { summary, recommendations: open, resolved: resolvedThisRun.map((r) => toView(r, runId)) };
}
