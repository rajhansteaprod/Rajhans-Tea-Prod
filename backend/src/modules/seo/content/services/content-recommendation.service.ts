import mongoose from 'mongoose';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { fingerprint } from '../../seo.util';
import {
  RecommendationCategory,
  RecommendationEffort,
  RecommendationImpact,
  ApprovalPropensity,
} from '../../seo.types';
import {
  ContentOpportunity,
  ContentOpportunityType,
  ContentPageAnalysis,
} from '../content.types';
import { OpportunityConfidence } from '../../gsc.types';

/**
 * Phase 6.2 — recommendation emission only.
 *
 * Converts already-computed Phase 6.1 findings into the existing
 * SeoRecommendation lifecycle. It performs no page mutation, no execution,
 * no paid calls and no LLM calls.
 */

const CONTENT_RECOMMENDATION_PREFIX = 'content-opportunity';

const recommendationIdFor = (type: ContentOpportunityType): string =>
  `${CONTENT_RECOMMENDATION_PREFIX}:${type}`;

const recoFingerprint = (
  recommendationId: string,
  discriminator: string,
): string => fingerprint(recommendationId, 'reco', discriminator);

function categoryFor(type: ContentOpportunityType): RecommendationCategory {
  switch (type) {
    case 'metadata-opportunity':
      return 'metadata';

    case 'internal-link-opportunity':
      return 'internal-linking';

    case 'missing-topic-coverage':
      return 'topical-authority';

    case 'high-impression-low-ctr':
    case 'striking-distance':
    case 'suspected-query-cannibalization':
    case 'type-compatibility-mismatch':
      return 'search-opportunity';

    case 'thin-content':
    case 'heading-structure-opportunity':
      return 'content';

    case 'insufficient-evidence':
      // This branch is structurally filtered before mapping.
      return 'content';
  }
}

function impactFor(
  priority: ContentOpportunity['priority'],
  evidenceStrength: OpportunityConfidence,
): RecommendationImpact {
  if (priority === 'high' && evidenceStrength === 'high') return 'very-high';
  if (priority === 'high') return 'high';
  if (priority === 'medium') return 'medium';
  return 'low';
}

function scoreFor(
  priority: ContentOpportunity['priority'],
  evidenceStrength: OpportunityConfidence,
): number {
  const priorityScore =
    priority === 'high' ? 70 :
    priority === 'medium' ? 45 :
    20;

  const evidenceScore =
    evidenceStrength === 'high' ? 20 :
    evidenceStrength === 'medium' ? 10 :
    0;

  return Math.min(100, priorityScore + evidenceScore);
}

function effortFor(type: ContentOpportunityType): RecommendationEffort {
  switch (type) {
    case 'metadata-opportunity':
      return 'small';

    case 'internal-link-opportunity':
    case 'heading-structure-opportunity':
    case 'thin-content':
    case 'high-impression-low-ctr':
    case 'striking-distance':
      return 'medium';

    case 'suspected-query-cannibalization':
    case 'missing-topic-coverage':
    case 'type-compatibility-mismatch':
      return 'large';

    case 'insufficient-evidence':
      return 'small';
  }
}

function titleFor(type: ContentOpportunityType): string {
  switch (type) {
    case 'high-impression-low-ctr':
      return 'Improve search-result click-through rate';
    case 'striking-distance':
      return 'Strengthen a striking-distance search opportunity';
    case 'suspected-query-cannibalization':
      return 'Review suspected search cannibalization';
    case 'thin-content':
      return 'Strengthen thin page content';
    case 'metadata-opportunity':
      return 'Improve page metadata';
    case 'heading-structure-opportunity':
      return 'Improve heading structure';
    case 'internal-link-opportunity':
      return 'Strengthen internal linking';
    case 'missing-topic-coverage':
      return 'Address missing topic coverage';
    case 'type-compatibility-mismatch':
      return 'Review page and search-intent compatibility';
    case 'insufficient-evidence':
      return 'Gather more SEO evidence';
  }
}

function suggestedFixFor(
  type: ContentOpportunityType,
  analysis: ContentPageAnalysis,
): string {
  const execution =
    analysis.executability.status === 'executable'
      ? `This page is executable through Phase 5 for: ${analysis.executability.supportedFields.join(', ') || 'supported fields'}.`
      : `This is currently ${analysis.executability.status}: ${analysis.executability.reason}`;

  switch (type) {
    case 'metadata-opportunity':
      return `Review and correct the affected metadata while preserving search intent. ${execution}`;

    case 'thin-content':
      return `Add useful, page-specific content that answers the intent of the page rather than padding word count. ${execution}`;

    case 'heading-structure-opportunity':
      return `Correct the editorial heading hierarchy without treating reusable UI components as page sections. ${execution}`;

    case 'internal-link-opportunity':
      return `Add contextually relevant internal links using descriptive anchor text. ${execution}`;

    case 'missing-topic-coverage':
      return `Add the missing topic only where it genuinely belongs on this page and matches demonstrated demand. ${execution}`;

    case 'high-impression-low-ctr':
      return `Review the search snippet and page-to-query alignment before changing metadata. ${execution}`;

    case 'striking-distance':
      return `Strengthen relevance and useful on-page coverage for the affected query set. ${execution}`;

    case 'suspected-query-cannibalization':
      return `Review competing Rajhans URLs for the same query intent before consolidating, redirecting, or retargeting anything. ${execution}`;

    case 'type-compatibility-mismatch':
      return `Review whether this page type is the right destination for the observed search intent before optimizing it further. ${execution}`;

    case 'insufficient-evidence':
      return 'Wait for sufficient evidence before taking action.';
  }
}

function emittedOpportunities(
  analysis: ContentPageAnalysis,
): ContentOpportunity[] {
  return analysis.opportunities.filter(
    (opportunity) => opportunity.type !== 'insufficient-evidence',
  );
}

export interface ContentRecommendationPersistenceResult {
  created: number;
  updated: number;
  reopened: number;
  resolved: number;
  fingerprints: string[];
}


export type ContentRecommendationPreviewAction =
  | 'new'
  | 'update'
  | 'reopen'
  | 'suppressed';

export interface ContentRecommendationPreview {
  normalizedUrl: string;
  opportunityType: ContentOpportunityType;
  recommendationId: string | null;
  fingerprint: string | null;
  title: string;
  priority: ContentOpportunity['priority'];
  evidenceStrength: OpportunityConfidence;
  impact: RecommendationImpact | null;
  executability: ContentPageAnalysis['executability'];
  action: ContentRecommendationPreviewAction;
  reason: string;
  approvalPropensity: ApprovalPropensity;
  approvalReason: string;
}

function approvalPropensityFor(
  analysis: ContentPageAnalysis,
  opportunity: ContentOpportunity,
): { propensity: ApprovalPropensity; reason: string } {
  if (opportunity.type === 'insufficient-evidence') {
    return {
      propensity: 'monitoring',
      reason: 'The evidence floor was not met, so there is nothing to approve yet.',
    };
  }

  // Unsupported/recommendation-only targets still require human implementation
  // or product/editorial judgment even when the finding itself is credible.
  if (analysis.executability.status !== 'executable') {
    return {
      propensity: 'needs_review',
      reason: `The finding is actionable, but the current executor status is ${analysis.executability.status}.`,
    };
  }

  // Strong deterministic metadata defects are safe candidates for owner approval.
  // Examples include repeated rendered title segments and audit-backed duplicate
  // metadata findings. This rule is based on evidence strength, not brand text.
  if (
    opportunity.type === 'metadata-opportunity' &&
    opportunity.evidenceStrength === 'high'
  ) {
    return {
      propensity: 'recommended_to_approve',
      reason: 'This is an executable metadata defect supported by high-strength deterministic evidence.',
    };
  }

  // Higher-priority, strongly supported executable findings can also rise to
  // the approve bucket once real data produces them.
  if (
    opportunity.priority !== 'low' &&
    opportunity.evidenceStrength !== 'low'
  ) {
    return {
      propensity: 'recommended_to_approve',
      reason: 'The finding is executable, materially prioritized, and supported by sufficient evidence.',
    };
  }

  // Low-priority executable guideline findings should not compete with stronger
  // defects for the owner’s attention.
  if (opportunity.priority === 'low') {
    return {
      propensity: 'low_urgency',
      reason: 'The finding is executable but low priority, so it can wait behind stronger opportunities.',
    };
  }

  return {
    propensity: 'needs_review',
    reason: 'The finding is credible but still benefits from human review before approval.',
  };
}

/**
 * READ-ONLY preview of what Phase 6.2 emission would do.
 *
 * No create/save/update/resolve calls. `insufficient-evidence` is deliberately
 * surfaced as suppressed so the owner can see that it was analysed but will
 * never become an approval item.
 */
export async function previewContentRecommendations(
  analyses: ContentPageAnalysis[],
): Promise<ContentRecommendationPreview[]> {
  const previews: ContentRecommendationPreview[] = [];
  const seen = new Set<string>();

  for (const analysis of analyses) {
    for (const opportunity of analysis.opportunities) {
      if (opportunity.type === 'insufficient-evidence') {
        previews.push({
          normalizedUrl: analysis.normalizedUrl,
          opportunityType: opportunity.type,
          recommendationId: null,
          fingerprint: null,
          title: 'No recommendation emitted',
          priority: opportunity.priority,
          evidenceStrength: opportunity.evidenceStrength,
          impact: null,
          executability: analysis.executability,
          action: 'suppressed',
          reason: 'Insufficient evidence is a monitoring state, not an approval recommendation.',
          approvalPropensity: 'monitoring',
          approvalReason: 'The evidence floor was not met, so there is nothing to approve yet.',
        });
        continue;
      }

      const recommendationId = recommendationIdFor(opportunity.type);
      const fp = recoFingerprint(recommendationId, opportunity.discriminator);

      // Defensive dedupe: preview exactly one action per persisted identity.
      if (seen.has(fp)) continue;
      seen.add(fp);

      const existing = await SeoRecommendation.findOne({ fingerprint: fp })
        .select('status')
        .lean()
        .exec();

      const action: ContentRecommendationPreviewAction =
        !existing
          ? 'new'
          : existing.status === 'resolved'
            ? 'reopen'
            : 'update';

      const approval = approvalPropensityFor(analysis, opportunity);

      previews.push({
        normalizedUrl: analysis.normalizedUrl,
        opportunityType: opportunity.type,
        recommendationId,
        fingerprint: fp,
        title: titleFor(opportunity.type),
        priority: opportunity.priority,
        evidenceStrength: opportunity.evidenceStrength,
        impact: impactFor(opportunity.priority, opportunity.evidenceStrength),
        executability: analysis.executability,
        action,
        reason:
          action === 'new'
            ? 'No recommendation with this stable fingerprint exists yet.'
            : action === 'reopen'
              ? 'The same recommendation existed previously but is currently resolved.'
              : 'The same recommendation is already open and would be refreshed with current evidence.',
        approvalPropensity: approval.propensity,
        approvalReason: approval.reason,
      });
    }
  }

  return previews;
}

/**
 * Upsert only. Human review state is deliberately preserved on updates/reopens.
 * A machine evidence refresh must never silently approve/reject a recommendation.
 */
export async function upsertContentRecommendations(
  runId: mongoose.Types.ObjectId,
  analyses: ContentPageAnalysis[],
): Promise<{
  created: number;
  updated: number;
  reopened: number;
  fingerprints: string[];
}> {
  let created = 0;
  let updated = 0;
  let reopened = 0;
  const fingerprints: string[] = [];

  for (const analysis of analyses) {
    for (const opportunity of emittedOpportunities(analysis)) {
      const recommendationId = recommendationIdFor(opportunity.type);
      const fp = recoFingerprint(recommendationId, opportunity.discriminator);
      fingerprints.push(fp);

      const approval = approvalPropensityFor(analysis, opportunity);

      const common = {
        recommendationId,
        category: categoryFor(opportunity.type),
        priority: opportunity.priority,
        impact: impactFor(opportunity.priority, opportunity.evidenceStrength),
        score: scoreFor(opportunity.priority, opportunity.evidenceStrength),
        title: titleFor(opportunity.type),
        why: opportunity.explanation,
        suggestedFix: suggestedFixFor(opportunity.type, analysis),
        estimatedEffort: effortFor(opportunity.type),
        affectedUrls: [analysis.normalizedUrl],
        evidence: {
          opportunityType: opportunity.type,
          evidenceStrength: opportunity.evidenceStrength,
          affectedQueries: opportunity.affectedQueries,
          evidenceRefs: opportunity.evidence,
          analyzerVersion: analysis.analyzerVersion,
          extractorVersion: analysis.extractorVersion,
          inputsHash: analysis.inputsHash,
          evidenceWindowKey: analysis.evidenceWindowKey,
          evidenceWindow: analysis.evidenceWindow,
          executability: analysis.executability,
          pageType: analysis.pageType,
          sourceRef: analysis.sourceRef,
        } as Record<string, unknown>,
        relatedCheckIds: [] as string[],
        automationLevel: 'recommend' as const,
        source: 'content' as const,
        demandBonus: 0,
        demandImpressions: analysis.searchPerformance.known
          ? analysis.searchPerformance.totals?.impressions ?? 0
          : 0,
        approvalPropensity: approval.propensity,
        approvalReason: approval.reason,
      };

      const existing = await SeoRecommendation.findOne({ fingerprint: fp }).exec();

      if (!existing) {
        await SeoRecommendation.create({
          ...common,
          fingerprint: fp,
          status: 'open',
          firstSeenRunId: runId,
          lastSeenRunId: runId,
        });
        created++;
        continue;
      }

      const wasResolved = existing.status === 'resolved';

      Object.assign(existing, common);
      existing.lastSeenRunId = runId;

      if (wasResolved) {
        existing.status = 'open';
        existing.resolvedRunId = null;
        reopened++;
      } else {
        updated++;
      }

      await existing.save();
    }
  }

  return { created, updated, reopened, fingerprints };
}

function evaluatedOpportunityTypes(
  analysis: ContentPageAnalysis,
): Set<ContentOpportunityType> {
  const suppressed = new Set(
    analysis.missingEvidence.flatMap(
      (missing) => missing.suppressedOpportunityTypes,
    ),
  );

  const all: ContentOpportunityType[] = [
    'high-impression-low-ctr',
    'striking-distance',
    'suspected-query-cannibalization',
    'thin-content',
    'metadata-opportunity',
    'heading-structure-opportunity',
    'internal-link-opportunity',
    'missing-topic-coverage',
    'type-compatibility-mismatch',
  ];

  return new Set(all.filter((type) => !suppressed.has(type)));
}

/**
 * Resolve only content recommendations for pages actually analysed in this
 * invocation, and only for opportunity types that were genuinely evaluable.
 *
 * This prevents evidence outages from being mistaken for issue resolution.
 */
export async function resolveMissingContentRecommendations(
  runId: mongoose.Types.ObjectId,
  analyses: ContentPageAnalysis[],
  detectedFingerprints: string[],
): Promise<{ resolved: number }> {
  const detected = new Set(detectedFingerprints);
  let resolved = 0;

  for (const analysis of analyses) {
    const evaluated = evaluatedOpportunityTypes(analysis);

    const open = await SeoRecommendation.find({
      status: 'open',
      source: 'content',
      affectedUrls: analysis.normalizedUrl,
    }).exec();

    for (const recommendation of open) {
      if (detected.has(recommendation.fingerprint)) continue;

      const opportunityType = (
        recommendation.evidence as { opportunityType?: ContentOpportunityType }
      )?.opportunityType;

      // Legacy/malformed content recommendation: do not guess.
      if (!opportunityType) continue;

      // Evidence was unavailable for this detector: preserve the open rec.
      if (!evaluated.has(opportunityType)) continue;

      recommendation.status = 'resolved';
      recommendation.resolvedRunId = runId;
      recommendation.lastSeenRunId = runId;
      await recommendation.save();
      resolved++;
    }
  }

  return { resolved };
}

export async function emitContentRecommendations(
  runId: mongoose.Types.ObjectId,
  analyses: ContentPageAnalysis[],
  opts: { allowResolution: boolean },
): Promise<ContentRecommendationPersistenceResult> {
  const upsert = await upsertContentRecommendations(runId, analyses);

  const resolution = opts.allowResolution
    ? await resolveMissingContentRecommendations(
        runId,
        analyses,
        upsert.fingerprints,
      )
    : { resolved: 0 };

  return {
    ...upsert,
    resolved: resolution.resolved,
  };
}
