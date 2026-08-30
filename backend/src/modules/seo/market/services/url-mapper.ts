import { Intent, MappingKeywordEvidence, PageCandidate, PageType, UrlMapping, UrlMappingAlternative, UrlMappingBucket } from '../market.types';
import { ClusterResult } from './clustering.engine';
import { RelevanceTaxonomy } from '../relevance.taxonomy';
import { anchorTermsOf, modifierEvidenceOf } from '../relevance.taxonomy';
import { marketConfig } from '../market.config';
import { GscEvidenceIndex } from './gsc-evidence-index';

/**
 * Pure URL mapper (4b.4). Touches no database — receives everything it needs:
 * a cluster + its member evidence, the full `PageCandidate[]` pool (built by
 * `page-candidate.builder.ts`), and a pre-built `GscEvidenceIndex` (built by
 * `gsc-evidence-index.ts`). `cannibalization-guard.ts` runs AFTER this, across
 * every cluster in a run, and is the only place `G_ALREADY_COVERED` is assigned.
 */

export interface MappingClusterInput {
  cluster: ClusterResult; // verbatim 4b.3 output — never mutated
  memberEvidence: MappingKeywordEvidence[]; // parallel to cluster.members, keyed by keywordId
  taxonomy: RelevanceTaxonomy; // MUST be the same enriched instance used everywhere else in the run
}

const INFORMATIONAL_FAMILY: Intent[] = ['INFORMATIONAL', 'HOW_TO', 'COMPARISON', 'PROBLEM_NEED'];
const COMMERCIAL_FAMILY: Intent[] = ['TRANSACTIONAL', 'COMMERCIAL_INVESTIGATION', 'CATEGORY'];

const TYPE_COMPATIBILITY: Partial<Record<Intent, PageType[]>> = {
  TRANSACTIONAL: ['product', 'category'],
  COMMERCIAL_INVESTIGATION: ['product', 'category'],
  CATEGORY: ['category', 'product'],
  INFORMATIONAL: ['blog', 'static'],
  HOW_TO: ['blog', 'static'],
  COMPARISON: ['blog', 'static'],
  PROBLEM_NEED: ['blog', 'static'],
  // NAVIGATIONAL handled specially — see navigationalCompatibleTypes()
};

const safe01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function overlapCoefficient(a: Set<string>, b: Set<string>): { coefficient: number; intersectionSize: number } {
  if (a.size === 0 || b.size === 0) return { coefficient: 0, intersectionSize: 0 };
  const intersectionSize = [...a].filter((x) => b.has(x)).length;
  return { coefficient: safe01(intersectionSize / Math.min(a.size, b.size)), intersectionSize };
}
function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : safe01(inter / union);
}

// The two static brand-level rajhansEntity terms present even in an unenriched
// BASE_TAXONOMY. NOTE: 4b.1's `source: 'inventory'|'taxonomy'` tag on a
// scoreBusinessRelevance() component does NOT reliably distinguish "matched a
// specific inventory product name" from "matched the generic brand term" (it
// flags 'inventory' whenever the match is in the rajhansEntity dimension at
// all, once any inventory entity has been merged in) — so navigational routing
// checks membership against this taxonomy's specific (non-static) rajhansEntity
// terms directly, rather than relying on that tag.
const STATIC_BRAND_TERMS = new Set(['rajhans', 'rajhans tea']);

/** Brand-only navigational -> home; a specific inventory product-name anchor -> that product only. */
function navigationalCompatibleTypes(cluster: ClusterResult, taxonomy: RelevanceTaxonomy): PageType[] {
  const label = cluster.label.toLowerCase();
  const specificProductMatch = taxonomy.core.rajhansEntity.some((t) => !STATIC_BRAND_TERMS.has(t.term) && label.includes(t.term));
  return specificProductMatch ? ['product'] : ['home'];
}

function compatibleTypesFor(cluster: ClusterResult, taxonomy: RelevanceTaxonomy): PageType[] {
  if (cluster.primaryIntent === 'NAVIGATIONAL') return navigationalCompatibleTypes(cluster, taxonomy);
  return (cluster.primaryIntent && TYPE_COMPATIBILITY[cluster.primaryIntent]) ?? [];
}

export interface ScoredCandidate {
  candidate: PageCandidate;
  matchScore: number;
  anchorIntersectionSize: number;
  gscEvidence: ReturnType<GscEvidenceIndex['getCandidateEvidence']>;
}

const GSC_STATE_RANK: Record<string, number> = { WINNING: 3, STRIKING_DISTANCE: 2, EMERGING: 1, UNKNOWN: 0 };

/** Exported for cannibalization-guard.ts — the SAME scoring math, pure (no GSC), so a
 * weaker cluster's coverage of the winning URL is judged identically to how it was scored here. */
export function scoreCandidatePair(clusterAnchors: Set<string>, clusterTokens: Set<string>, candidate: PageCandidate): { matchScore: number; anchorIntersectionSize: number } {
  const { coefficient, intersectionSize } = overlapCoefficient(clusterAnchors, new Set(candidate.anchors));
  const lexical = jaccard(clusterTokens, new Set(candidate.normalizedTerms));
  const w = marketConfig.mapping.matchWeights;
  return { matchScore: safe01(w.anchor * coefficient + w.lexical * lexical), anchorIntersectionSize: intersectionSize };
}

function clusterTokensOf(cluster: ClusterResult): Set<string> {
  const tokens = new Set<string>();
  for (const m of cluster.members) for (const t of m.normalizedKeyword.split(/\s+/).filter(Boolean)) tokens.add(t);
  return tokens;
}

function scoreAndRank(cluster: ClusterResult, taxonomy: RelevanceTaxonomy, pool: PageCandidate[], memberKeywords: string[], gscIndex: GscEvidenceIndex): ScoredCandidate[] {
  const clusterAnchors = anchorTermsOf(cluster.label, taxonomy);
  const clusterTokens = clusterTokensOf(cluster);
  const scored: ScoredCandidate[] = pool.map((candidate) => {
    const { matchScore, anchorIntersectionSize } = scoreCandidatePair(clusterAnchors, clusterTokens, candidate);
    const gscEvidence = gscIndex.getCandidateEvidence(memberKeywords, candidate.canonicalUrl);
    return { candidate, matchScore, anchorIntersectionSize, gscEvidence };
  });
  scored.sort((a, b) => {
    if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
    if (a.anchorIntersectionSize !== b.anchorIntersectionSize) return b.anchorIntersectionSize - a.anchorIntersectionSize;
    const rankDiff = GSC_STATE_RANK[b.gscEvidence.state] - GSC_STATE_RANK[a.gscEvidence.state];
    if (rankDiff !== 0) return rankDiff;
    if (a.candidate.canonicalUrl.length !== b.candidate.canonicalUrl.length) return a.candidate.canonicalUrl.length - b.candidate.canonicalUrl.length;
    return a.candidate.canonicalUrl.localeCompare(b.candidate.canonicalUrl);
  });
  return scored;
}

function toAlternatives(scored: ScoredCandidate[]): UrlMappingAlternative[] {
  return scored.slice(0, marketConfig.mapping.maxAlternativeCandidates).map((s) => ({
    url: s.candidate.canonicalUrl,
    pageType: s.candidate.pageType,
    score: s.matchScore,
    reason: `${s.anchorIntersectionSize} shared anchor(s)`,
  }));
}

export function mapClusterToUrl(input: MappingClusterInput, candidates: PageCandidate[], gscIndex: GscEvidenceIndex): UrlMapping {
  const { cluster, memberEvidence, taxonomy } = input;
  const memberKeywords = cluster.members.map((m) => m.normalizedKeyword);

  // 1) F check — business relevance ONLY, conservative "ALL usable members low".
  const usable = memberEvidence.length > 0 ? memberEvidence : [];
  if (usable.length > 0 && usable.every((m) => m.businessRelevance.band === 'low')) {
    return {
      bucket: 'F_NOT_RELEVANT',
      matchedUrl: null,
      matchedPageType: null,
      matchScore: 0,
      confidence: safe01(1 - Math.max(...usable.map((m) => m.businessRelevance.score))),
      reasons: [`all ${usable.length} member(s) scored business-relevance band 'low'`],
      actionable: false,
      evidenceStatus: 'not-applicable',
      alternativeCandidates: [],
    };
  }

  const indexableCandidates = candidates.filter((c) => c.indexable);
  const compatibleTypes = compatibleTypesFor(cluster, taxonomy);
  const compatiblePool = indexableCandidates.filter((c) => compatibleTypes.includes(c.pageType));
  const compatibleScored = scoreAndRank(cluster, taxonomy, compatiblePool, memberKeywords, gscIndex);
  const best = compatibleScored[0];

  // 2/3) Compatible candidate clears the bar → A or B.
  if (best && best.matchScore >= marketConfig.mapping.matchMinScore) {
    return existingPageMapping(best, toAlternatives(compatibleScored.slice(1)));
  }

  // 4) Structural bucket (C/D/E) — anchor-matched page of ANY type (unrestricted
  // by the compatibility filter) decides C vs E for informational clusters.
  const anyTypeScored = scoreAndRank(cluster, taxonomy, indexableCandidates, memberKeywords, gscIndex);
  const anyTypeBest = anyTypeScored[0];
  const informationalFamily = cluster.primaryIntent !== null && INFORMATIONAL_FAMILY.includes(cluster.primaryIntent);

  let bucket: UrlMappingBucket;
  let whyExistingPageInsufficient: string;
  if (informationalFamily && anyTypeBest && anyTypeBest.anchorIntersectionSize > 0) {
    bucket = 'C_CONTENT_SUPPORT';
    whyExistingPageInsufficient = `no blog/guide covers this informational demand; closest related page is ${anyTypeBest.candidate.pageType} ${anyTypeBest.candidate.canonicalUrl}, which is not itself informational content`;
  } else if (informationalFamily) {
    bucket = 'E_NEW_ARTICLE';
    whyExistingPageInsufficient = 'no existing page of any type shares a specific anchor with this informational cluster';
  } else {
    bucket = 'D_NEW_LANDING';
    whyExistingPageInsufficient = compatiblePool.length === 0
      ? 'no product/category page exists for this cluster\'s anchor at all'
      : `closest compatible page scored ${(best?.matchScore ?? 0).toFixed(2)}, below matchMinScore ${marketConfig.mapping.matchMinScore}`;
  }

  // 5) Evidence sufficiency (§3) — applied to the structural bucket, never changes it.
  const knownVolumes = memberEvidence.filter((m) => m.demand?.metricsKnown && m.demand.searchVolume !== null).map((m) => m.demand!.searchVolume as number);
  const maxKnownVolume = knownVolumes.length ? Math.max(...knownVolumes) : null;
  const descriptiveTotalVolume = knownVolumes.length ? knownVolumes.reduce((a, b) => a + b, 0) : null;
  const hasMeaningfulDemand = maxKnownVolume !== null && maxKnownVolume >= marketConfig.mapping.newPageMinSearchVolume;

  const clusterDemand = gscIndex.getClusterDemandEvidence(memberKeywords);
  const hasStrongGsc = clusterDemand.evidenceKnown && (clusterDemand.impressions ?? 0) >= marketConfig.mapping.strongGscEvidenceMinImpressions;

  const sufficient = hasMeaningfulDemand || hasStrongGsc;
  const reasons: string[] = [whyExistingPageInsufficient];
  reasons.push(
    maxKnownVolume !== null
      ? `max known member search volume ${maxKnownVolume}/mo (descriptive total ${descriptiveTotalVolume}, not used as authoritative demand)`
      : 'no member search-volume metrics known (UNKNOWN, not zero)',
  );
  reasons.push(clusterDemand.evidenceKnown ? `first-party GSC: ${clusterDemand.impressions} impressions across matched queries` : 'no first-party GSC rows found for this cluster\'s queries (UNKNOWN)');

  return {
    bucket,
    matchedUrl: null,
    matchedPageType: null,
    matchScore: anyTypeBest?.matchScore ?? 0,
    confidence: sufficient ? 0.6 : 0.3,
    reasons,
    actionable: sufficient,
    evidenceStatus: sufficient ? 'sufficient' : 'insufficient',
    whyExistingPageInsufficient,
    alternativeCandidates: toAlternatives(anyTypeScored),
  };
}

function existingPageMapping(best: ScoredCandidate, alternatives: UrlMappingAlternative[]): UrlMapping {
  const candidate = best.candidate;
  const reasons: string[] = [
    `matched ${candidate.pageType} ${candidate.canonicalUrl} (score ${best.matchScore.toFixed(2)}, ${best.anchorIntersectionSize} shared anchor(s))`,
    ...candidate.healthReasons,
  ];

  if (candidate.pageHealth === 'UNKNOWN') {
    reasons.push('page health could not be determined (no snapshot / fetch failure) — defaulted to B shape pending verification, not a confirmed deficiency');
    return {
      bucket: 'B_EXISTING_NEEDS_OPT',
      matchedUrl: candidate.canonicalUrl,
      matchedPageType: candidate.pageType,
      matchScore: best.matchScore,
      confidence: 0.3,
      reasons,
      actionable: false,
      evidenceStatus: 'insufficient',
      alternativeCandidates: alternatives,
    };
  }

  reasons.push(best.gscEvidence.evidenceKnown ? `GSC: ${best.gscEvidence.state}, ${best.gscEvidence.impressions} impressions` : 'GSC: UNKNOWN (no matching rows for this candidate)');

  // pageHealth GOOD -> A; NEEDS_OPT -> B. (No confirmed-negative GSC state remains
  // in 4b.4's narrowed vocabulary — DECLINING/NO_VISIBILITY are never asserted —
  // so GSC evidence never downgrades a GOOD page here; see approved guard 1.)
  const bucket: UrlMappingBucket = candidate.pageHealth === 'GOOD' ? 'A_EXISTING_GOOD' : 'B_EXISTING_NEEDS_OPT';
  return {
    bucket,
    matchedUrl: candidate.canonicalUrl,
    matchedPageType: candidate.pageType,
    matchScore: best.matchScore,
    confidence: safe01(0.5 + best.matchScore * 0.5),
    reasons,
    actionable: true,
    evidenceStatus: 'not-applicable',
    alternativeCandidates: alternatives,
  };
}

export { modifierEvidenceOf, compatibleTypesFor, INFORMATIONAL_FAMILY, COMMERCIAL_FAMILY };
