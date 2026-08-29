import { KeywordDemandResult, KeywordMetrics } from '../../market.types';
import { DataForSeoKeywordIdeasResultWrapper, DataForSeoKeywordInfo, DataForSeoSearchVolumeItem, DataForSeoTaskResponse } from './dataforseo.types';

/**
 * Raw → normalized mapping. UNKNOWN ≠ 0 (refinement 9): only fields DataForSEO
 * documents as null/absent become null here. A documented real `0` (e.g. genuinely
 * zero search volume) is preserved as `0`, never coerced to null or vice versa.
 * CPC / paidCompetition are PAID-advertiser signals — never organic difficulty.
 */
const toCompetitionLevel = (v?: 'LOW' | 'MEDIUM' | 'HIGH' | null): 'low' | 'medium' | 'high' | null =>
  v ? (v.toLowerCase() as 'low' | 'medium' | 'high') : null;

function mapMetricFields(info: DataForSeoKeywordInfo | DataForSeoSearchVolumeItem | null | undefined): Omit<KeywordMetrics, 'keyword'> {
  const searchVolume = info?.search_volume === null || info?.search_volume === undefined ? null : info.search_volume;
  const cpc = info?.cpc === null || info?.cpc === undefined ? null : { value: info.cpc, currency: 'USD' };
  const paidCompetitionIndex = info?.competition === null || info?.competition === undefined ? null : info.competition;
  const paidCompetition = toCompetitionLevel(info?.competition_level ?? null);
  return { searchVolume, cpc, paidCompetition, paidCompetitionIndex };
}

/**
 * Real Keyword Ideas response shape: tasks[0].result[0].items[] — `result` is a
 * one-element array holding a WRAPPER object (seed_keywords/total_count/items),
 * not the keyword items directly. Reading `result[]` as if it were the items
 * array (the 4b.2 bug) silently drops every real response.
 */
export function mapKeywordIdeasResponse(resp: DataForSeoTaskResponse<DataForSeoKeywordIdeasResultWrapper>): { results: KeywordDemandResult[] } {
  const wrapper = resp.tasks?.[0]?.result?.[0] ?? null;
  const items = (wrapper?.items ?? []).filter((it): it is NonNullable<typeof it> => !!it && !!it.keyword);
  const results: KeywordDemandResult[] = items.map((it) => ({
    keyword: it.keyword,
    sourceKeywordId: null,
    inlineMetrics: it.keyword_info ? { keyword: it.keyword, ...mapMetricFields(it.keyword_info) } : null,
  }));
  return { results };
}

export function mapSearchVolumeResponse(resp: DataForSeoTaskResponse<DataForSeoSearchVolumeItem>): KeywordMetrics[] {
  const items = (resp.tasks?.[0]?.result ?? []).filter((it): it is DataForSeoSearchVolumeItem => !!it && !!it.keyword);
  return items.map((it) => ({ keyword: it.keyword, ...mapMetricFields(it) }));
}

/** Split into provider-sized batches (e.g. DataForSEO's 200-seeds-per-task cap).
 * Generic chunking — no provider-specific concept beyond the max size number. */
export function chunk<T>(items: T[], maxSize: number): T[][] {
  if (maxSize <= 0) throw new Error('chunk: maxSize must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += maxSize) out.push(items.slice(i, i + maxSize));
  return out;
}

/** Keywords requested but absent from the provider's response = UNKNOWN metrics,
 * NOT rejected (refinement/requirement 7) and NOT zero. Caller classifies these
 * as `unknownMetrics`, distinct from `keywordsRejected` (intentional filtering). */
export function diffMissingMetrics(requested: string[], results: KeywordMetrics[]): string[] {
  const returned = new Set(results.map((r) => r.keyword));
  return requested.filter((k) => !returned.has(k));
}
