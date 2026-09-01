import mongoose from 'mongoose';
import { SeoRecommendation, ISeoRecommendationDoc } from '../models/seo-recommendation.model';
import { SeoAuditRun } from '../models/seo-audit-run.model';
import { DetectedIssue, LinkResolution, PageObservation, RecommendationPriority } from '../seo.types';
import { fingerprint } from '../seo.util';
import { gscConfig } from '../gsc.config';
import { buildInboundCounts } from './crosspage.service';
import { generateDrafts, RecoContext } from './recommendation.generators';
import { scoreRecommendation } from './recommendation.scoring';

const recoFingerprint = (recommendationId: string, discriminator = '') =>
  fingerprint(recommendationId, 'reco', discriminator);

export interface RecommendationDiff {
  counts: { high: number; medium: number; low: number; highImpact: number; total: number };
  delta: { new: number; resolved: number; persistent: number };
}


export type RecommendationReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

/**
 * Human review mutation — review-only, never touches production SEO. Keyed by
 * the persisted Mongo `_id` (NOT `recommendationId`, which is not guaranteed
 * globally unique once fingerprint discriminators are involved). Only OPEN
 * recommendations may be reviewed; returns null (never throws) for an unknown
 * id, a resolved recommendation, or a malformed id string.
 */
export async function updateRecommendationReview(opts: {
  id: string;
  reviewStatus: RecommendationReviewStatus;
  reviewNote?: string | null;
  reviewedBy: string;
}) {
  if (!mongoose.isValidObjectId(opts.id)) return null;

  const rec = await SeoRecommendation.findOne({
    _id: opts.id,
    status: 'open',
  }).exec();

  if (!rec) return null;

  if (opts.reviewStatus === 'pending') {
    rec.reviewStatus = 'pending';
    rec.reviewNote = null;
    rec.reviewedAt = null;
    rec.reviewedBy = null;
  } else {
    rec.reviewStatus = opts.reviewStatus;
    rec.reviewNote = opts.reviewNote?.trim() || null;
    rec.reviewedAt = new Date();
    rec.reviewedBy = new mongoose.Types.ObjectId(opts.reviewedBy);
  }

  await rec.save();
  return rec;
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
        source: 'audit',
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

  // ── Resolve open AUDIT recommendations not regenerated this run ──
  // Strictly source-scoped: GSC and market recommendations have independent
  // lifecycles and must never be resolved by a technical audit run.
  if (allowResolution) {
    const open = await SeoRecommendation.find({ status: 'open', source: 'audit' }).exec();
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

export function toView(rec: ISeoRecommendationDoc, runId: string) {
  let state: 'new' | 'persistent' | 'resolved' = 'persistent';
  if (rec.status === 'resolved' && idEq(rec.resolvedRunId, runId)) state = 'resolved';
  else if (idEq(rec.firstSeenRunId, runId)) state = 'new';
  return {
    id: String(rec._id),
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
    // Phase 4 fields (GSC): source, confidence, and the demand boost — kept
    // distinct from technical priority. effectivePriority is the display priority
    // after the CAPPED demand lift; base priority (technical) is unchanged.
    source: rec.source ?? 'audit',
    confidence: (rec.evidence as { confidence?: string })?.confidence ?? null,
    demandImpressions: rec.demandImpressions ?? 0,
    demandBonus: rec.demandBonus ?? 0,
    effectivePriority: liftDisplayPriority(rec.priority, rec.demandBonus ?? 0),
    reviewStatus: rec.reviewStatus ?? 'pending',
    reviewNote: rec.reviewNote ?? null,
    reviewedAt: rec.reviewedAt ?? null,
    reviewedBy: rec.reviewedBy ? String(rec.reviewedBy) : null,
    state,
  };
}

/** Display-only priority lift from the capped demand bonus (never changes severity). */
function liftDisplayPriority(base: RecommendationPriority, bonus: number): RecommendationPriority {
  const order: RecommendationPriority[] = ['low', 'medium', 'high'];
  const levels = Math.min(gscConfig.demandBoost.maxPriorityLift, Math.floor(bonus / Math.max(1, gscConfig.demandBoost.maxBonus / 2)));
  return order[Math.min(order.length - 1, order.indexOf(base) + levels)];
}

const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

/** Recommendations report for a run (defaults to the latest completed run). */
export async function getRecommendationsReport(runIdArg?: string) {
  const run = runIdArg
    ? await SeoAuditRun.findById(runIdArg).lean().exec()
    : await SeoAuditRun.findOne({ status: { $in: ['completed', 'degraded'] } }).sort({ createdAt: -1 }).lean().exec();
  if (!run) return null;
  const runId = String(run._id);

  // All currently-open recommendations (audit + GSC). GSC recs are touched on GSC
  // syncs, not the audit run, so the board must not be scoped to lastSeenRunId.
  const openThisRun = await SeoRecommendation.find({ status: 'open' }).exec();
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
    // Phase 5.1 — human review counts over the currently open set. Never
    // fabricated: derived from the same `open` view rows as everything above.
    reviewSummary: {
      pending: open.filter((r) => r.reviewStatus === 'pending').length,
      approved: open.filter((r) => r.reviewStatus === 'approved').length,
      rejected: open.filter((r) => r.reviewStatus === 'rejected').length,
      needsChanges: open.filter((r) => r.reviewStatus === 'needs_changes').length,
    },
  };

  return { summary, recommendations: open, resolved: resolvedThisRun.map((r) => toView(r, runId)) };
}
