import {
  CandidateGscEvidence,
  ClusterGscDemandEvidence,
  Intent,
  MappingKeywordEvidence,
  MarketOpportunityDraft,
  MarketOpportunityEvidence,
  OpportunityKeywordEvidence,
  OpportunityScoreComponents,
  UrlMapping,
  UrlMappingBucket,
} from '../market.types';
import { ClusterResult } from './clustering.engine';
import { RelevanceTaxonomy, scoreBusinessRelevance, scoreCommercialIntent } from '../relevance.taxonomy';
import { anchorTermsOf } from '../relevance.taxonomy';
import { finalizeIntents } from './intent-classifier';
import { normalizeKeyword } from './keyword-normalize';
import { positionBucket } from '../../services/gsc.analyzers';
import { marketConfig } from '../market.config';

/**
 * Pure opportunity scoring (4b.6). Reads only already-computed 4b.1–4b.5
 * evidence — no API calls, no DB access, no mutation of any upstream contract.
 *
 * FROZEN design — see docs/phase4b-search-market-design.md and the approved
 * 4b.6 plan. Do not adjust weights/formulas without a new approval round.
 */

export interface OpportunityInput {
  cluster: ClusterResult;
  mapping: UrlMapping;
  memberEvidence: OpportunityKeywordEvidence[];
  clusterGscDemand: ClusterGscDemandEvidence;
  /** Only meaningful when mapping.matchedUrl is set (bucket B in practice —
   * C/D/E never have a matchedUrl in the current 4b.4 output shape). */
  matchedPageGsc: CandidateGscEvidence | null;
  /** MUST be the SAME enriched taxonomy instance used everywhere else in the
   * run (scoreCommercialIntent/finalizeIntents/anchorTermsOf/brand detection) —
   * never defaulted internally. */
  taxonomy: RelevanceTaxonomy;
}

const safe01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const band = (score: number): 'high' | 'medium' | 'low' => (score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low');

/** Builds 4b.6-local evidence from 4b.4's MappingKeywordEvidence — reuses the
 * already-computed businessRelevance verbatim; computes commercialIntent and
 * the navigational/branded flags FRESH via the same pure functions/taxonomy,
 * since MappingKeywordEvidence does not carry them. Never mutates the input. */
export function buildOpportunityKeywordEvidence(members: MappingKeywordEvidence[], taxonomy: RelevanceTaxonomy): OpportunityKeywordEvidence[] {
  return members.map((m) => {
    const commercialIntent = scoreCommercialIntent(m.keyword, taxonomy);
    const intents = finalizeIntents(m.keyword, taxonomy);
    const isNavigational = intents[0]?.intent === 'NAVIGATIONAL';
    const relevance = scoreBusinessRelevance(m.keyword, taxonomy);
    const isBranded = relevance.components.some((c) => c.dimension === 'rajhansEntity');
    return {
      keywordId: m.keywordId,
      keyword: m.keyword,
      normalizedKeyword: m.normalizedKeyword,
      businessRelevance: m.businessRelevance,
      commercialIntent,
      demand: m.demand,
      isNavigational,
      isBranded,
    };
  });
}

function eligibleGrowthMembersOf(members: OpportunityKeywordEvidence[]): OpportunityKeywordEvidence[] {
  return members.filter((m) => m.businessRelevance.band !== 'low' && !m.isNavigational && !m.isBranded);
}

function maxKnownVolumeOf(members: OpportunityKeywordEvidence[]): number | null {
  const known = members.filter((m) => m.demand?.metricsKnown && m.demand.searchVolume !== null).map((m) => m.demand!.searchVolume as number);
  return known.length ? Math.max(...known) : null;
}

function descriptiveTotalVolumeOf(members: OpportunityKeywordEvidence[]): number | null {
  const known = members.filter((m) => m.demand?.metricsKnown && m.demand.searchVolume !== null).map((m) => m.demand!.searchVolume as number);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

/** Meaningful external demand (>=100/mo, reused 4b.4 threshold) OR strong
 * first-party GSC evidence (>=50 impressions/28d, reused 4b.4 threshold). */
function hasMarketDemandEvidence(eligibleGrowthMembers: OpportunityKeywordEvidence[], clusterGscDemand: ClusterGscDemandEvidence): boolean {
  const maxVolume = maxKnownVolumeOf(eligibleGrowthMembers);
  const meaningfulDemand = maxVolume !== null && maxVolume >= marketConfig.mapping.newPageMinSearchVolume;
  const strongGsc = clusterGscDemand.evidenceKnown && (clusterGscDemand.impressions ?? 0) >= marketConfig.mapping.strongGscEvidenceMinImpressions;
  return meaningfulDemand || strongGsc;
}

/** Bucket/intent/actionability/relevance/demand eligibility — checked BEFORE
 * any scoring. Only B/C/D/E with real growth members and real market-demand
 * evidence are ever scored. */
export function eligibleForRecommendation(input: OpportunityInput): { eligible: boolean; reason: string } {
  const { mapping, cluster } = input;
  if (mapping.bucket === 'A_EXISTING_GOOD') return { eligible: false, reason: 'bucket A — page already good, nothing to recommend' };
  if (mapping.bucket === 'F_NOT_RELEVANT') return { eligible: false, reason: 'bucket F — not relevant' };
  if (mapping.bucket === 'G_ALREADY_COVERED') return { eligible: false, reason: 'bucket G — already covered by another cluster' };
  if (cluster.primaryIntent === 'NAVIGATIONAL') return { eligible: false, reason: 'navigational/branded cluster intent' };
  if (!mapping.actionable) return { eligible: false, reason: 'mapping.actionable=false — insufficient evidence' };

  const eligibleMembers = eligibleGrowthMembersOf(input.memberEvidence);
  if (eligibleMembers.length === 0) {
    return { eligible: false, reason: 'no eligible (non-low-relevance, non-navigational, non-branded) growth members' };
  }
  if (!hasMarketDemandEvidence(eligibleMembers, input.clusterGscDemand)) {
    return { eligible: false, reason: 'no market-demand evidence (neither >=100/mo external volume nor >=50 GSC impressions) — audit concern, not a market opportunity' };
  }
  return { eligible: true, reason: `bucket ${mapping.bucket} actionable with market-demand evidence` };
}

function categoryFor(bucket: UrlMappingBucket, primaryIntent: Intent | null): MarketOpportunityDraft['category'] | null {
  if (bucket === 'B_EXISTING_NEEDS_OPT') return 'existing-page-optimization';
  if (bucket === 'C_CONTENT_SUPPORT' || bucket === 'E_NEW_ARTICLE') return 'new-guide';
  if (bucket === 'D_NEW_LANDING') return primaryIntent === 'TRANSACTIONAL' || primaryIntent === 'COMMERCIAL_INVESTIGATION' ? 'commercial-opportunity' : 'new-landing-page';
  return null;
}

function recommendationIdFor(category: MarketOpportunityDraft['category']): string {
  switch (category) {
    case 'existing-page-optimization':
      return 'market-optimize';
    case 'new-guide':
      return 'market-new-guide';
    case 'new-landing-page':
      return 'market-new-landing';
    case 'commercial-opportunity':
      return 'market-commercial';
  }
}

/** Never uses an empty anchor list alone as identity — normalizedClusterLabel
 * is always part of the key. */
function topicKeyOf(cluster: ClusterResult, taxonomy: RelevanceTaxonomy): string {
  const anchors = [...anchorTermsOf(cluster.label, taxonomy)].sort();
  return `${cluster.primaryIntent ?? 'UNKNOWN'}::${normalizeKeyword(cluster.label)}::${anchors.join('|')}`;
}

function affectedUrlsFor(mapping: UrlMapping, category: MarketOpportunityDraft['category']): string[] {
  if (category === 'existing-page-optimization') return mapping.matchedUrl ? [mapping.matchedUrl] : [];
  if (category === 'new-guide' && mapping.bucket === 'C_CONTENT_SUPPORT') {
    const related = mapping.alternativeCandidates[0]?.url;
    return related ? [related] : [];
  }
  return []; // D/E: the proposed page does not exist — never invent a future URL
}

function titleFor(category: MarketOpportunityDraft['category'], label: string): string {
  switch (category) {
    case 'existing-page-optimization':
      return `Optimize existing page for "${label}"`;
    case 'new-guide':
      return `Create a supporting guide for "${label}"`;
    case 'new-landing-page':
      return `Evaluate a new landing page for "${label}"`;
    case 'commercial-opportunity':
      return `Evaluate a commercial landing page for "${label}"`;
  }
}

function suggestedFixFor(category: MarketOpportunityDraft['category'], label: string, mapping: UrlMapping): string {
  switch (category) {
    case 'existing-page-optimization':
      return `Expand and improve ${mapping.matchedUrl} around the validated "${label}" intent.`;
    case 'new-guide':
      return `Create a supporting guide for informational "${label}" queries.`;
    case 'new-landing-page':
      return `Evaluate a dedicated landing page for "${label}".`;
    case 'commercial-opportunity':
      return `Evaluate a dedicated commercial landing page for "${label}".`;
  }
}

function bandPosition(avgPosition: number): number {
  const b = positionBucket(avgPosition);
  if (b === '1-3') return 0.2;
  if (b === '4-10') return 1.0;
  if (b === '11-20') return 0.75;
  return 0.25;
}

function computeConfidence(opts: {
  bucket: UrlMappingBucket;
  hasMarketDemand: boolean;
  matchedPageGscKnown: boolean;
  relevanceBand: 'high' | 'medium' | 'low';
  metricsKnown: boolean;
  cannibalizationRisk: boolean;
}): 'low' | 'medium' | 'high' {
  let level: 'low' | 'medium' | 'high';
  if (opts.bucket === 'B_EXISTING_NEEDS_OPT') {
    if (opts.hasMarketDemand && opts.matchedPageGscKnown && opts.relevanceBand === 'high') level = 'high';
    else if (opts.hasMarketDemand && (!opts.matchedPageGscKnown || opts.relevanceBand === 'medium')) level = 'medium';
    else level = 'low';
  } else {
    if (opts.hasMarketDemand && opts.relevanceBand === 'high' && opts.metricsKnown) level = 'high';
    else if (opts.hasMarketDemand && (opts.relevanceBand === 'medium' || !opts.metricsKnown)) level = 'medium';
    else level = 'low';
  }
  if (opts.cannibalizationRisk && level === 'high') level = 'medium';
  return level;
}

/** Returns null when the opportunity is ineligible or lacks market-demand
 * evidence — never a fabricated low-score recommendation. */
export function scoreOpportunity(input: OpportunityInput): MarketOpportunityDraft | null {
  const elig = eligibleForRecommendation(input);
  if (!elig.eligible) return null;

  const { mapping, cluster, taxonomy } = input;
  const eligibleMembers = eligibleGrowthMembersOf(input.memberEvidence);
  const maxKnownVolume = maxKnownVolumeOf(eligibleMembers);
  const descriptiveTotalVolume = descriptiveTotalVolumeOf(eligibleMembers);
  const metricsKnown = maxKnownVolume !== null;
  const isB = mapping.bucket === 'B_EXISTING_NEEDS_OPT';

  const category = categoryFor(mapping.bucket, cluster.primaryIntent);
  if (!category) return null; // structurally unreachable given eligibility already filtered to B/C/D/E

  // ── searchDemand ──
  const searchDemand: OpportunityScoreComponents['searchDemand'] =
    maxKnownVolume !== null
      ? { value: safe01(Math.log10(1 + maxKnownVolume) / Math.log10(1 + marketConfig.opportunity.demandSaturationVolume)), available: true }
      : { value: 0, available: false };

  // ── businessRelevance ── (mean over eligible growth members only)
  const relevanceScore = eligibleMembers.length ? safe01(mean(eligibleMembers.map((m) => m.businessRelevance.score))) : 0;
  const businessRelevance: OpportunityScoreComponents['businessRelevance'] = { value: relevanceScore, available: eligibleMembers.length > 0 };
  const relevanceBand = band(relevanceScore);

  // ── commercialValue ── (no CPC in 4b.6)
  const commercialValue: OpportunityScoreComponents['commercialValue'] = eligibleMembers.length
    ? { value: safe01(mean(eligibleMembers.map((m) => m.commercialIntent.score))), available: true }
    : { value: 0, available: false };

  // ── gscVisibilityGap ── B: matched-page evidence. C/D/E: cluster-wide evidence.
  let observedRelevantImpressions: number | null = null;
  let gscKnownForGap = false;
  if (isB) {
    if (input.matchedPageGsc?.evidenceKnown) {
      observedRelevantImpressions = input.matchedPageGsc.impressions;
      gscKnownForGap = true;
    }
  } else if (input.clusterGscDemand.evidenceKnown) {
    observedRelevantImpressions = input.clusterGscDemand.impressions;
    gscKnownForGap = true;
  }
  const gscVisibilityGap: OpportunityScoreComponents['gscVisibilityGap'] =
    gscKnownForGap && maxKnownVolume !== null && observedRelevantImpressions !== null
      ? { value: safe01(1 - Math.min(1, observedRelevantImpressions / Math.max(1, maxKnownVolume))), available: true }
      : { value: 0, available: false };

  // ── rankingProximity ── B only, matched-page position only. Never cluster-wide.
  const matchedPageGscKnown = isB && !!input.matchedPageGsc?.evidenceKnown;
  const rankingProximity: OpportunityScoreComponents['rankingProximity'] =
    matchedPageGscKnown && input.matchedPageGsc!.avgPosition !== null
      ? { value: bandPosition(input.matchedPageGsc!.avgPosition as number), available: true }
      : { value: 0, available: false };

  // ── existingPageFit (B only) / contentGapStrength (C/D/E only) — mutually exclusive, never both ──
  const existingPageFit: OpportunityScoreComponents['existingPageFit'] = isB ? { value: safe01(mapping.matchScore), available: true } : { value: 0, available: false };
  const contentGapStrength: OpportunityScoreComponents['contentGapStrength'] = !isB ? { value: 1.0, available: true } : { value: 0, available: false };

  // ── effort (inverse) — derived ONLY from estimatedEffort, no hidden per-bucket values ──
  const estimatedEffort: 'medium' | 'large' = mapping.bucket === 'B_EXISTING_NEEDS_OPT' || mapping.bucket === 'C_CONTENT_SUPPORT' ? 'medium' : 'large';
  const effortInverseValue = estimatedEffort === 'medium' ? 0.6 : 0.3;
  const effortInverse: OpportunityScoreComponents['effortInverse'] = { value: effortInverseValue, available: true };

  const scoreComponents: OpportunityScoreComponents = {
    searchDemand,
    businessRelevance,
    commercialValue,
    gscVisibilityGap,
    rankingProximity,
    existingPageFit,
    contentGapStrength,
    effortInverse,
  };

  const w = marketConfig.opportunity.weights;
  const weighted: [number, { value: number; available: boolean }][] = [
    [w.searchDemand, searchDemand],
    [w.businessRelevance, businessRelevance],
    [w.commercialValue, commercialValue],
    [w.gscVisibilityGap, gscVisibilityGap],
    [w.rankingProximity, rankingProximity],
    [w.existingPageFit, existingPageFit],
    [w.contentGapStrength, contentGapStrength],
    [w.effortInverse, effortInverse],
  ];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [weight, comp] of weighted) {
    if (!comp.available) continue;
    weightedSum += weight * comp.value;
    weightTotal += weight;
  }
  let score = weightTotal > 0 ? safe01(weightedSum / weightTotal) * 100 : 0;

  const cannibalizationRisk = !!mapping.possibleCannibalizationRisk;
  if (cannibalizationRisk) score *= marketConfig.opportunity.cannibalizationPenaltyMultiplier;
  score = Math.round(score * 10) / 10;

  const confidence = computeConfidence({
    bucket: mapping.bucket,
    hasMarketDemand: true, // eligibility already guaranteed this
    matchedPageGscKnown,
    relevanceBand,
    metricsKnown,
    cannibalizationRisk,
  });

  const topicKey = topicKeyOf(cluster, taxonomy);
  const recommendationId = recommendationIdFor(category);
  const discriminator = isB ? `${mapping.matchedUrl}::${topicKey}` : `${category}::${topicKey}`;
  const affectedUrls = affectedUrlsFor(mapping, category);

  const evidence: MarketOpportunityEvidence = {
    clusterLabel: cluster.label,
    memberKeywords: cluster.members.map((m) => m.keyword),
    eligibleGrowthMemberKeywords: eligibleMembers.map((m) => m.keyword),
    primaryIntent: cluster.primaryIntent,
    businessRelevanceScore: eligibleMembers.length ? relevanceScore : null,
    demand: { maxKnownVolume, metricsKnown, descriptiveTotalVolume },
    clusterGsc: { impressions: input.clusterGscDemand.impressions, evidenceKnown: input.clusterGscDemand.evidenceKnown },
    matchedPageGsc: input.matchedPageGsc
      ? { impressions: input.matchedPageGsc.impressions, avgPosition: input.matchedPageGsc.avgPosition, evidenceKnown: input.matchedPageGsc.evidenceKnown }
      : null,
    mapping: { bucket: mapping.bucket, matchedUrl: mapping.matchedUrl, matchScore: mapping.matchScore },
    cannibalizationRisk,
    scoreComponents,
    confidence,
    relatedRecommendationIds: [],
  };

  return {
    recommendationId,
    discriminator,
    category,
    title: titleFor(category, cluster.label),
    why: elig.reason,
    suggestedFix: suggestedFixFor(category, cluster.label, mapping),
    score,
    confidence,
    affectedUrls,
    evidence,
  };
}
