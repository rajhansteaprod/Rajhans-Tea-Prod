import mongoose from 'mongoose';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { fingerprint } from '../../seo.util';
import { opportunityPriority } from '../../services/gsc.opportunity.service';
import { MarketOpportunityDraft } from '../market.types';

/**
 * Persistence for market-derived opportunities — mirrors the EXISTING
 * `gsc.opportunity.service.ts::generateAndPersistOpportunities()` pattern
 * exactly (fingerprint upsert, source-scoped resolution), reusing the exported
 * `opportunityPriority()` helper rather than duplicating its thresholds.
 *
 * 4b.7 staged-recovery refactor (additive, zero behavior change): the upsert
 * and resolution phases are now separately exported primitives so the
 * orchestrator can durably transition `persistenceStage` around each phase
 * and resume safely after a crash. `generateAndPersistMarketOpportunities`
 * keeps its EXACT original signature/behavior as a thin wrapper composed of
 * the same two primitives — every existing 4b.6 test still exercises the same
 * code path and passes unmodified.
 */

const recoFingerprint = (recommendationId: string, discriminator = ''): string => fingerprint(recommendationId, 'reco', discriminator);

export interface MarketPersistenceResult {
  created: number;
  updated: number;
  resolved: number;
}

function estimatedEffortFor(draft: MarketOpportunityDraft): 'medium' | 'large' {
  const bucket = draft.evidence.mapping.bucket;
  return bucket === 'B_EXISTING_NEEDS_OPT' || bucket === 'C_CONTENT_SUPPORT' ? 'medium' : 'large';
}

/**
 * Fingerprint-idempotent upsert of exactly the given drafts. Returns the
 * fingerprints it touched — the orchestrator passes this same list (or, on
 * resume, the FROZEN `evaluationSnapshot.draftFingerprints`) into
 * `resolveMissingMarketOpportunities` rather than letting resolution
 * recompute its own detected set.
 */
export async function upsertMarketOpportunityDrafts(
  runId: mongoose.Types.ObjectId,
  drafts: MarketOpportunityDraft[],
): Promise<{ created: number; updated: number; fingerprints: string[] }> {
  let created = 0;
  let updated = 0;
  const fingerprints: string[] = [];

  for (const d of drafts) {
    const fp = recoFingerprint(d.recommendationId, d.discriminator);
    fingerprints.push(fp);
    const { priority, impact } = opportunityPriority(d.score, d.confidence);

    const common = {
      recommendationId: d.recommendationId,
      category: d.category,
      priority,
      impact,
      score: d.score,
      title: d.title,
      why: d.why,
      suggestedFix: d.suggestedFix,
      estimatedEffort: estimatedEffortFor(d),
      affectedUrls: d.affectedUrls,
      evidence: d.evidence as unknown as Record<string, unknown>,
      automationLevel: 'recommend' as const,
      source: 'market' as const,
    };

    const existing = await SeoRecommendation.findOne({ fingerprint: fp }).exec();
    if (!existing) {
      await SeoRecommendation.create({ ...common, fingerprint: fp, status: 'open', firstSeenRunId: runId, lastSeenRunId: runId });
      created++;
    } else {
      Object.assign(existing, common);
      existing.lastSeenRunId = runId;
      if (existing.status === 'resolved') {
        existing.status = 'open';
        existing.resolvedRunId = null;
      }
      await existing.save();
      updated++;
    }
  }

  return { created, updated, fingerprints };
}

/**
 * Resolve previously-open `source:'market'` recommendations whose fingerprint
 * is NOT in `frozenDetectedFingerprints` — a caller-supplied set, never
 * recomputed here. Scoped to `source:'market'` — never touches 'audit'/'gsc'.
 */
export async function resolveMissingMarketOpportunities(
  runId: mongoose.Types.ObjectId,
  frozenDetectedFingerprints: string[],
): Promise<{ resolved: number }> {
  const detected = new Set(frozenDetectedFingerprints);
  let resolved = 0;
  const openMarket = await SeoRecommendation.find({ status: 'open', source: 'market' }).exec();
  for (const r of openMarket) {
    if (detected.has(r.fingerprint)) continue;
    r.status = 'resolved';
    r.resolvedRunId = runId;
    r.lastSeenRunId = runId;
    await r.save();
    resolved++;
  }
  return { resolved };
}

/**
 * UNCHANGED public signature/behavior — a thin wrapper over the two
 * primitives above, preserved so every existing 4b.6 caller/test is unaffected.
 */
export async function generateAndPersistMarketOpportunities(
  runId: mongoose.Types.ObjectId,
  drafts: MarketOpportunityDraft[],
  opts: { allowResolution: boolean },
): Promise<MarketPersistenceResult> {
  const { created, updated, fingerprints } = await upsertMarketOpportunityDrafts(runId, drafts);
  const { resolved } = opts.allowResolution ? await resolveMissingMarketOpportunities(runId, fingerprints) : { resolved: 0 };
  return { created, updated, resolved };
}

/**
 * For B (existing-page-optimization) recommendations only — read-only,
 * informational cross-linking. No suppression, no cross-source resolution, no
 * shared fingerprint with the GSC lifecycle.
 */
export async function findRelatedGscRecommendationIds(matchedUrl: string): Promise<string[]> {
  const rows = await SeoRecommendation.find({ source: 'gsc', status: 'open', affectedUrls: matchedUrl }).select('recommendationId').lean().exec();
  return rows.map((r) => r.recommendationId);
}
