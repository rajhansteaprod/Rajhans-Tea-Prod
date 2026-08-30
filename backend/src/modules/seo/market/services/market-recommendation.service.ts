import mongoose from 'mongoose';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { fingerprint } from '../../seo.util';
import { opportunityPriority } from '../../services/gsc.opportunity.service';
import { MarketOpportunityDraft } from '../market.types';

/**
 * Persistence for market-derived opportunities (4b.6) — mirrors the EXISTING
 * `gsc.opportunity.service.ts::generateAndPersistOpportunities()` pattern
 * exactly (fingerprint upsert, source-scoped resolution), reusing the exported
 * `opportunityPriority()` helper rather than duplicating its thresholds.
 *
 * CRITICAL: this file is a persistence-CAPABLE service, not a persistence-
 * ACTIVE one. `runId` is a real `SeoAuditRun`-referenced ObjectId required by
 * the existing SeoRecommendation schema (`firstSeenRunId`/`lastSeenRunId` are
 * schema-required, non-nullable) — 4b.6 does NOT fabricate one. No script or
 * bootstrap in this phase calls this function against a live database; that is
 * deferred until a future market-orchestration phase has a legitimate
 * persisted run identity to supply.
 *
 * Medoid/topicKey churn (documented, not silently accepted): if a later,
 * COMPLETE evaluation (allowResolution=true) no longer produces a fingerprint
 * that was previously open, that recommendation resolves normally via the
 * loop below, and a new one opens under the new fingerprint — this is
 * lifecycle churn, not duplicate-open accumulation. With allowResolution=false
 * (the only mode possible until activation), both could remain open
 * temporarily. No fuzzy identity matching is attempted here.
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
 * Fingerprint-idempotent upsert of market opportunities, source-scoped exactly
 * like the GSC path (`source:'gsc'` there, `source:'market'` here) — audit and
 * GSC lifecycles are never touched or cross-resolved by this function.
 */
export async function generateAndPersistMarketOpportunities(
  runId: mongoose.Types.ObjectId,
  drafts: MarketOpportunityDraft[],
  opts: { allowResolution: boolean },
): Promise<MarketPersistenceResult> {
  let created = 0;
  let updated = 0;
  let resolved = 0;
  const detected = new Map<string, MarketOpportunityDraft>();

  for (const d of drafts) {
    const fp = recoFingerprint(d.recommendationId, d.discriminator);
    detected.set(fp, d);
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

  // Resolve previously-open market recs not redetected THIS evaluation —
  // ONLY when the caller vouches the evaluation was complete (allowResolution).
  // Scoped to source:'market' — never touches 'audit'/'gsc' recommendations.
  if (opts.allowResolution) {
    const openMarket = await SeoRecommendation.find({ status: 'open', source: 'market' }).exec();
    for (const r of openMarket) {
      if (detected.has(r.fingerprint)) continue;
      r.status = 'resolved';
      r.resolvedRunId = runId;
      r.lastSeenRunId = runId;
      await r.save();
      resolved++;
    }
  }

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
