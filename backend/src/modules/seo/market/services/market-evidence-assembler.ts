import { MappingKeywordEvidence, ClusterGscDemandEvidence, CandidateGscEvidence, UrlMapping } from '../market.types';
import { RelevanceTaxonomy, scoreBusinessRelevance } from '../relevance.taxonomy';
import { ClusterResult } from './clustering.engine';
import { GscEvidenceIndex } from './gsc-evidence-index';
import { classifyKeywordMetricAge } from './evidence-freshness.service';
import { ISearchKeywordMetricDoc } from '../models/search-keyword-metric.model';
import { marketConfig } from '../market.config';

/**
 * Live evidence assembly (4b.7, FROZEN plan v3). Pure, synchronous — every
 * DB read (latest metrics, GSC index) has already happened by the time these
 * run. Never invents a shape not already in `MappingKeywordEvidence`/
 * `OpportunityKeywordEvidence` (4b.4/4b.6) — those types are consumed
 * verbatim.
 */

export interface MappingKeywordEvidenceBuildResult {
  evidence: MappingKeywordEvidence[];
  degradationReasons: string[];
}

/**
 * fresh <=30d: metricsKnown=true, no degradation.
 * 31-90d: metricsKnown=true, ALWAYS records a stale-keyword-demand
 * degradation reason (age of evidence, independent of whether discovery ran).
 * >90d or no metric: demand=null (UNKNOWN, never a fabricated 0).
 */
function buildDemand(
  metric: ISearchKeywordMetricDoc | null,
  normalizedKeyword: string,
  now: Date,
): { demand: MappingKeywordEvidence['demand']; degradationReason: string | null } {
  const ageClass = classifyKeywordMetricAge(metric?.capturedAt ?? null, now);
  if (ageClass === 'fresh') {
    return {
      demand: { searchVolume: metric!.searchVolume, metricsKnown: true, source: metric!.provider, capturedAt: metric!.capturedAt.toISOString() },
      degradationReason: null,
    };
  }
  if (ageClass === 'stale-but-usable') {
    const ageDays = Math.floor((now.getTime() - metric!.capturedAt.getTime()) / 86400000);
    return {
      demand: { searchVolume: metric!.searchVolume, metricsKnown: true, source: metric!.provider, capturedAt: metric!.capturedAt.toISOString() },
      degradationReason: `stale-keyword-demand: "${normalizedKeyword}" used a ${ageDays}d-old metric (>${marketConfig.orchestrator.keywordFreshDays}d, <=${marketConfig.orchestrator.keywordStaleMaxDays}d)`,
    };
  }
  return { demand: null, degradationReason: null }; // 'too-old' or 'unknown' — UNKNOWN, never used
}

/**
 * businessRelevance is ALWAYS recomputed fresh via scoreBusinessRelevance()
 * with the run's one enriched taxonomy instance — never read from a
 * persisted (possibly stale) SearchKeyword.businessRelevance field.
 */
export function buildMappingKeywordEvidence(
  keywords: { keywordId: string; keyword: string; normalizedKeyword: string }[],
  latestMetricsByKeywordId: Map<string, ISearchKeywordMetricDoc | null>,
  taxonomy: RelevanceTaxonomy,
  now: Date,
): MappingKeywordEvidenceBuildResult {
  const degradationReasons: string[] = [];
  const evidence = keywords.map((k) => {
    const businessRelevance = scoreBusinessRelevance(k.keyword, taxonomy);
    const metric = latestMetricsByKeywordId.get(k.keywordId) ?? null;
    const { demand, degradationReason } = buildDemand(metric, k.normalizedKeyword, now);
    if (degradationReason) degradationReasons.push(degradationReason);
    return { keywordId: k.keywordId, keyword: k.keyword, normalizedKeyword: k.normalizedKeyword, businessRelevance, demand };
  });
  return { evidence, degradationReasons };
}

/** Cluster-wide GSC demand — full member set, unfiltered (4b.4 semantics, unchanged). */
export function buildClusterGscDemandEvidence(cluster: ClusterResult, gscIndex: GscEvidenceIndex): ClusterGscDemandEvidence {
  return gscIndex.getClusterDemandEvidence(cluster.members.map((m) => m.normalizedKeyword));
}

/**
 * Evidence for EXACTLY the confirmed matchedUrl — recomputed fresh against
 * the final (post-cannibalization-guard) mapping, never reused from
 * url-mapper.ts's internal ScoredCandidate[] and never substituted from
 * alternativeCandidates. null (not UNKNOWN-shaped) when there is no matchedUrl.
 */
export function buildMatchedPageGscEvidence(cluster: ClusterResult, mapping: UrlMapping, gscIndex: GscEvidenceIndex): CandidateGscEvidence | null {
  if (!mapping.matchedUrl) return null;
  return gscIndex.getCandidateEvidence(cluster.members.map((m) => m.normalizedKeyword), mapping.matchedUrl);
}
