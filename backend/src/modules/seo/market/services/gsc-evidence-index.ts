import { GscQueryPageMetric } from '../../models/gsc-query-page-metric.model';
import { resolveGscUrl } from '../../services/gsc.join';
import { positionBucket } from '../../services/gsc.analyzers';
import { gscConfig } from '../../gsc.config';
import { marketConfig } from '../market.config';
import { CandidateGscEvidence, CandidateGscState, ClusterGscDemandEvidence } from '../market.types';
import { normalizeKeyword } from './keyword-normalize';

/**
 * ONE bounded, read-only Mongo read for the whole run — never one query per
 * (cluster, candidate) pair. Rows are canonicalized via the EXISTING
 * `resolveGscUrl()` and indexed in memory; `CandidateGscEvidence`/
 * `ClusterGscDemandEvidence` lookups afterward touch no database.
 *
 * State vocabulary is deliberately narrower than the (unimplemented)
 * `GscOverlay.state`: no `NO_VISIBILITY` (absence of rows is not proof of zero
 * visibility) and no `DECLINING` (would require a genuine two-window
 * per-candidate comparison this phase does not build — omitted rather than
 * asserted unsupported, per the approved plan).
 */

interface Accumulated {
  impressions: number;
  clicks: number;
  positionWeightedSum: number; // Σ(position × impressions), for an impression-weighted average
}

export class GscEvidenceIndex {
  private readonly byQueryUrl = new Map<string, Accumulated>();
  private readonly byQuery = new Map<string, { impressions: number }>();

  add(normalizedQuery: string, canonicalUrl: string, impressions: number, clicks: number, position: number): void {
    const key = `${normalizedQuery}|${canonicalUrl}`;
    const existing = this.byQueryUrl.get(key) ?? { impressions: 0, clicks: 0, positionWeightedSum: 0 };
    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.positionWeightedSum += position * impressions;
    this.byQueryUrl.set(key, existing);

    const q = this.byQuery.get(normalizedQuery) ?? { impressions: 0 };
    q.impressions += impressions;
    this.byQuery.set(normalizedQuery, q);
  }

  /** Candidate-URL-specific evidence — "do THESE queries get impressions for THIS URL?" */
  getCandidateEvidence(memberKeywords: string[], candidateUrl: string): CandidateGscEvidence {
    let impressions = 0;
    let clicks = 0;
    let positionWeightedSum = 0;
    const matchedKeywords: string[] = [];
    for (const nk of new Set(memberKeywords.map(normalizeKeyword))) {
      const entry = this.byQueryUrl.get(`${nk}|${candidateUrl}`);
      if (entry) {
        impressions += entry.impressions;
        clicks += entry.clicks;
        positionWeightedSum += entry.positionWeightedSum;
        matchedKeywords.push(nk);
      }
    }
    if (matchedKeywords.length === 0) {
      return { state: 'UNKNOWN', impressions: null, clicks: null, avgPosition: null, matchedKeywords: [], evidenceKnown: false };
    }
    const avgPosition = impressions > 0 ? positionWeightedSum / impressions : null;
    const state = classifyState(impressions, avgPosition);
    return { state, impressions, clicks, avgPosition, matchedKeywords, evidenceKnown: true };
  }

  /** Cluster-wide demand evidence (no candidate URL) — for D/E evidence
   * sufficiency ONLY. Never used as candidate-specific ranking evidence. */
  getClusterDemandEvidence(memberKeywords: string[]): ClusterGscDemandEvidence {
    let impressions = 0;
    const matchedKeywords: string[] = [];
    for (const nk of new Set(memberKeywords.map(normalizeKeyword))) {
      const entry = this.byQuery.get(nk);
      if (entry) {
        impressions += entry.impressions;
        matchedKeywords.push(nk);
      }
    }
    if (matchedKeywords.length === 0) return { impressions: null, evidenceKnown: false, matchedKeywords: [] };
    return { impressions, evidenceKnown: true, matchedKeywords };
  }
}

function classifyState(impressions: number, avgPosition: number | null): CandidateGscState {
  if (impressions < marketConfig.mapping.strongGscEvidenceMinImpressions) return 'EMERGING'; // low-confidence real data
  if (avgPosition === null) return 'EMERGING';
  const bucket = positionBucket(avgPosition); // reused from gsc.analyzers.ts
  if (bucket === '1-3') return 'WINNING';
  if (bucket === '4-10' || bucket === '11-20') return 'STRIKING_DISTANCE'; // == position in [4,20], analyzeStrikingDistance's own range
  return 'EMERGING';
}

/** Builds the index from ONE bounded read over the current opportunity window. */
export async function loadGscEvidenceIndex(canonicalSet: Set<string>, windowDays = gscConfig.opportunityWindowDays): Promise<GscEvidenceIndex> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await GscQueryPageMetric.find({ periodEnd: { $gte: windowStart } })
    .select('query page clicks impressions position')
    .lean()
    .exec();

  const index = new GscEvidenceIndex();
  const resolutionCache = new Map<string, string | null>();
  for (const row of rows) {
    let canonicalUrl = resolutionCache.get(row.page);
    if (canonicalUrl === undefined) {
      const resolved = resolveGscUrl(row.page, canonicalSet);
      canonicalUrl = resolved.joined ? resolved.canonicalUrl : null;
      resolutionCache.set(row.page, canonicalUrl);
    }
    if (!canonicalUrl) continue; // unresolved/non-canonical rows never become evidence for a Rajhans URL
    index.add(normalizeKeyword(row.query), canonicalUrl, row.impressions, row.clicks, row.position);
  }
  return index;
}
