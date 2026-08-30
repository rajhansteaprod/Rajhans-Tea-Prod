import mongoose from 'mongoose';
import { SearchKeywordMetric, ISearchKeywordMetricDoc } from '../models/search-keyword-metric.model';

/**
 * Bounded batch latest-metric loader (4b.7). ONE aggregation for the whole
 * requested keyword set — never N queries, never materializes a keyword's
 * full metric history into the application layer. Same-provider only; no
 * averaging/summing across snapshots; newest `capturedAt` wins per keyword.
 * Keywords with no matching metric map to `null` — UNKNOWN, never zero.
 */
export async function loadLatestMetricsByKeywordIds(
  keywordIds: mongoose.Types.ObjectId[],
  provider: string,
): Promise<Map<string, ISearchKeywordMetricDoc | null>> {
  const result = new Map<string, ISearchKeywordMetricDoc | null>();
  for (const id of keywordIds) result.set(String(id), null);
  if (keywordIds.length === 0) return result;

  const rows = await SearchKeywordMetric.aggregate([
    { $match: { keywordId: { $in: keywordIds }, provider } },
    { $sort: { keywordId: 1, capturedAt: -1 } },
    { $group: { _id: '$keywordId', doc: { $first: '$$ROOT' } } },
  ]).exec();

  for (const row of rows as { _id: mongoose.Types.ObjectId; doc: ISearchKeywordMetricDoc }[]) {
    result.set(String(row._id), row.doc);
  }
  return result;
}
