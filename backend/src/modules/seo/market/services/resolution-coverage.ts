import { normalizeKeyword } from './keyword-normalize';
import { MemberCoverageStatus } from './active-keyword-universe';

/**
 * Resolution-coverage safety (4b.7, FROZEN plan v3). Proves that every
 * currently-open `source:'market'` recommendation received a real current-run
 * verdict before `allowResolution` may ever be true — otherwise a topic that
 * simply aged out of the active window could be silently resolved as if it
 * had been re-evaluated and found gone.
 */

export interface RecommendationCoverageInput {
  fingerprint: string;
  memberKeywords: string[] | null | undefined; // from the persisted evidence.memberKeywords
}
export type RecommendationCoverageStatus = 'reevaluated' | 'explicitly-ineligible' | 'unresolved-coverage';
export interface RecommendationCoverageResult {
  fingerprint: string;
  status: RecommendationCoverageStatus;
  reason: string;
}

/**
 * `memberVerdicts` is keyed by normalizedKeyword and MUST come from
 * `buildActiveKeywordUniverse()`'s `carryForwardVerdicts` for this same run —
 * never recomputed independently here (single source of truth for "what
 * happened to this keyword this run").
 */
export function computeResolutionCoverage(
  recommendations: RecommendationCoverageInput[],
  memberVerdicts: Map<string, MemberCoverageStatus>,
): RecommendationCoverageResult[] {
  return recommendations.map((r) => {
    const members = (r.memberKeywords ?? []).map(normalizeKeyword).filter(Boolean);
    if (members.length === 0) {
      return { fingerprint: r.fingerprint, status: 'unresolved-coverage', reason: 'persisted memberKeywords missing/empty' };
    }
    const statuses = members.map((nk) => memberVerdicts.get(nk) ?? 'unresolved');
    if (statuses.some((s) => s === 'unresolved')) {
      return { fingerprint: r.fingerprint, status: 'unresolved-coverage', reason: 'one or more members could not be evaluated this run' };
    }
    if (statuses.every((s) => s === 'explicitly-ineligible')) {
      return { fingerprint: r.fingerprint, status: 'explicitly-ineligible', reason: 'every member is currently hard-negative or low-relevance' };
    }
    return { fingerprint: r.fingerprint, status: 'reevaluated', reason: 'at least one member participated in final clustering; any remainder explicitly ineligible' };
  });
}

/** allowResolution may be true only when every open recommendation has real coverage. */
export function allOpenRecommendationsCovered(results: RecommendationCoverageResult[]): boolean {
  return results.every((r) => r.status !== 'unresolved-coverage');
}
