import { SearchKeyword } from '../../models/search-keyword.model';
import { SearchKeywordMetric } from '../../models/search-keyword-metric.model';
import { normalizeKeyword } from '../../services/keyword-normalize';
import { marketConfig } from '../../market.config';
import { KeywordMetrics, Market } from '../../market.types';

export interface MetricsCacheResult {
  fresh: KeywordMetrics[];
  /** Original (non-normalized) keyword strings that need a fresh provider call. */
  stale: string[];
}

/**
 * Read-only freshness check against persisted SearchKeywordMetric rows, so a
 * recent metric is reused instead of paying for an equivalent call again
 * (requirement 8). This is a lookup helper for the future orchestrator (4b.3+)
 * that persists discovery/metrics — the 4b.2 validation script does NOT call
 * this, since it must write nothing to the database.
 */
export async function partitionByFreshness(
  keywords: string[],
  market: Market,
  provider = 'dataforseo',
  staleAfterDays = marketConfig.ttl.metricTtlDays,
): Promise<MetricsCacheResult> {
  const cutoff = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000);
  const fresh: KeywordMetrics[] = [];
  const stale: string[] = [];

  for (const kw of keywords) {
    const normalizedKeyword = normalizeKeyword(kw);
    const keywordDoc = await SearchKeyword.findOne({
      normalizedKeyword,
      'market.country': market.country,
      'market.language': market.language,
    })
      .lean()
      .exec();

    const metricDoc = keywordDoc
      ? await SearchKeywordMetric.findOne({ keywordId: keywordDoc._id, provider, capturedAt: { $gte: cutoff } })
          .sort({ capturedAt: -1 })
          .lean()
          .exec()
      : null;

    if (metricDoc) {
      fresh.push({
        keyword: kw,
        searchVolume: metricDoc.searchVolume ?? null,
        cpc: (metricDoc.cpc as KeywordMetrics['cpc']) ?? null,
        paidCompetition: (metricDoc.paidCompetition as KeywordMetrics['paidCompetition']) ?? null,
        paidCompetitionIndex: metricDoc.paidCompetitionIndex ?? null,
      });
    } else {
      stale.push(kw);
    }
  }

  return { fresh, stale };
}
