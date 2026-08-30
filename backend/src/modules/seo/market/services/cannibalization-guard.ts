import { PageCandidate, UrlMapping } from '../market.types';
import { ClusterResult } from './clustering.engine';
import { RelevanceTaxonomy, anchorTermsOf, modifierEvidenceOf } from '../relevance.taxonomy';
import { COMMERCIAL_FAMILY, INFORMATIONAL_FAMILY, compatibleTypesFor, scoreCandidatePair } from './url-mapper';
import { marketConfig } from '../market.config';

/**
 * Pure, run-wide pass over every cluster's provisional `UrlMapping` — the ONLY
 * place `G_ALREADY_COVERED` is ever assigned. Runs after `url-mapper.ts` has
 * produced an initial A/B/C/D/E/F verdict for every cluster in the run.
 *
 * G is a STRONGER claim than an ordinary match (`gCoverageMinScore` = 0.70 >
 * `matchMinScore` = 0.55) and requires ALL of: compatible page type for the
 * weaker cluster, the weaker cluster's own coverage score clearing that higher
 * bar, compatible intent families, and no conflicting modifier evidence
 * (reusing 4b.3's exact three-case modifier semantics). Failing any of these
 * keeps the weaker cluster's own C/D/E/A/B verdict and attaches
 * `possibleCannibalizationRisk` instead.
 */

export interface CannibalizationEntry {
  cluster: ClusterResult;
  taxonomy: RelevanceTaxonomy;
  mapping: UrlMapping;
}

function intentFamily(cluster: ClusterResult): 'commercial' | 'informational' | 'other' {
  if (cluster.primaryIntent && COMMERCIAL_FAMILY.includes(cluster.primaryIntent)) return 'commercial';
  if (cluster.primaryIntent && INFORMATIONAL_FAMILY.includes(cluster.primaryIntent)) return 'informational';
  return 'other';
}

/** Exact 4b.3 modifier semantics — neither/one/both-disjoint/both-shared. */
function modifiersConflict(clusterA: ClusterResult, clusterB: ClusterResult, taxonomy: RelevanceTaxonomy): boolean {
  const modA = modifierEvidenceOf(clusterA.label, taxonomy);
  const modB = modifierEvidenceOf(clusterB.label, taxonomy);
  if (modA.size === 0 && modB.size === 0) return false; // neither has evidence -> unavailable, no conflict
  if (modA.size === 0 || modB.size === 0) return true; // exactly one has evidence -> real mismatch
  const inter = [...modA].filter((x) => modB.has(x)).length;
  const union = modA.size + modB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  return jaccard === 0; // both have evidence, fully disjoint -> conflict
}

function clusterTokensOf(cluster: ClusterResult): Set<string> {
  const tokens = new Set<string>();
  for (const m of cluster.members) for (const t of m.normalizedKeyword.split(/\s+/).filter(Boolean)) tokens.add(t);
  return tokens;
}

export function applyCannibalizationGuard(entries: CannibalizationEntry[], candidates: PageCandidate[]): UrlMapping[] {
  const candidateByUrl = new Map(candidates.map((c) => [c.canonicalUrl, c]));
  const groups = new Map<string, number[]>(); // matchedUrl -> entry indices
  entries.forEach((e, i) => {
    if ((e.mapping.bucket === 'A_EXISTING_GOOD' || e.mapping.bucket === 'B_EXISTING_NEEDS_OPT') && e.mapping.matchedUrl) {
      const arr = groups.get(e.mapping.matchedUrl) ?? [];
      arr.push(i);
      groups.set(e.mapping.matchedUrl, arr);
    }
  });

  const results: UrlMapping[] = entries.map((e) => e.mapping);

  for (const [url, indices] of groups) {
    if (indices.length < 2) continue;
    const candidate = candidateByUrl.get(url);
    if (!candidate) continue;

    let winnerIdx = indices[0];
    for (const i of indices) if (entries[i].mapping.matchScore > entries[winnerIdx].mapping.matchScore) winnerIdx = i;

    for (const i of indices) {
      if (i === winnerIdx) continue;
      const weaker = entries[i];
      const winner = entries[winnerIdx];

      // F_NOT_RELEVANT clusters never reach here anyway (they never got A/B), but guarded explicitly per spec.
      if (weaker.mapping.bucket === 'F_NOT_RELEVANT') continue;

      const weakerAnchors = anchorTermsOf(weaker.cluster.label, weaker.taxonomy);
      const weakerTokens = clusterTokensOf(weaker.cluster);
      const { matchScore: weakerCoverageScore } = scoreCandidatePair(weakerAnchors, weakerTokens, candidate);

      const typeCompatible = compatibleTypesFor(weaker.cluster, weaker.taxonomy).includes(candidate.pageType);
      const coverageOk = weakerCoverageScore >= marketConfig.mapping.gCoverageMinScore;
      const familiesCompatible = intentFamily(weaker.cluster) === intentFamily(winner.cluster);
      const noModifierConflict = !modifiersConflict(weaker.cluster, winner.cluster, weaker.taxonomy);

      if (typeCompatible && coverageOk && familiesCompatible && noModifierConflict) {
        results[i] = {
          ...weaker.mapping,
          bucket: 'G_ALREADY_COVERED',
          matchedUrl: url,
          matchedPageType: candidate.pageType,
          matchScore: weakerCoverageScore,
          actionable: false,
          evidenceStatus: 'not-applicable',
          reasons: [`covered by "${winner.cluster.label}" at ${url} (coverage score ${weakerCoverageScore.toFixed(2)} >= ${marketConfig.mapping.gCoverageMinScore})`],
        };
      } else {
        const failureReasons: string[] = [];
        if (!typeCompatible) failureReasons.push('winning page type is not compatible with this cluster\'s intent');
        if (!coverageOk) failureReasons.push(`coverage score ${weakerCoverageScore.toFixed(2)} < gCoverageMinScore ${marketConfig.mapping.gCoverageMinScore}`);
        if (!familiesCompatible) failureReasons.push('intent families differ (commercial vs informational)');
        if (!noModifierConflict) failureReasons.push('conflicting commercial-modifier evidence (different jobs)');
        results[i] = {
          ...weaker.mapping,
          possibleCannibalizationRisk: {
            competingClusterLabel: winner.cluster.label,
            sharedUrl: url,
            reason: `shares top-matching URL with "${winner.cluster.label}" but G was refused: ${failureReasons.join('; ')}`,
          },
        };
      }
    }
  }

  return results;
}
