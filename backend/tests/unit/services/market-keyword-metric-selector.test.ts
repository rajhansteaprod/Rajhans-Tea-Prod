import mongoose from 'mongoose';

let rows: { keywordId: mongoose.Types.ObjectId; provider: string; capturedAt: Date; searchVolume: number }[] = [];

jest.mock('../../../src/modules/seo/market/models/search-keyword-metric.model', () => ({
  SearchKeywordMetric: {
    aggregate: jest.fn((pipeline: unknown[]) => ({
      exec: async () => {
        const match = (pipeline[0] as { $match: { keywordId: { $in: mongoose.Types.ObjectId[] }; provider: string } }).$match;
        const ids = new Set(match.keywordId.$in.map(String));
        const filtered = rows.filter((r) => ids.has(String(r.keywordId)) && r.provider === match.provider);
        const byKeyword = new Map<string, typeof rows[0]>();
        for (const r of [...filtered].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())) {
          const key = String(r.keywordId);
          if (!byKeyword.has(key)) byKeyword.set(key, r);
        }
        return [...byKeyword.entries()].map(([_id, doc]) => ({ _id: new mongoose.Types.ObjectId(_id), doc }));
      },
    })),
  },
}));

import { loadLatestMetricsByKeywordIds } from '../../../src/modules/seo/market/services/keyword-metric-selector';

beforeEach(() => {
  rows = [];
});

describe('loadLatestMetricsByKeywordIds — bounded batch, AH', () => {
  it('returns exactly one newest same-provider metric per keyword, not all history', async () => {
    const kw1 = new mongoose.Types.ObjectId();
    const kw2 = new mongoose.Types.ObjectId();
    rows = [
      { keywordId: kw1, provider: 'dataforseo', capturedAt: new Date('2026-01-01'), searchVolume: 100 },
      { keywordId: kw1, provider: 'dataforseo', capturedAt: new Date('2026-06-01'), searchVolume: 500 }, // newest
      { keywordId: kw1, provider: 'dataforseo', capturedAt: new Date('2026-03-01'), searchVolume: 200 },
      { keywordId: kw2, provider: 'dataforseo', capturedAt: new Date('2026-02-01'), searchVolume: 50 },
    ];
    const result = await loadLatestMetricsByKeywordIds([kw1, kw2], 'dataforseo');
    expect(result.get(String(kw1))?.searchVolume).toBe(500);
    expect(result.get(String(kw2))?.searchVolume).toBe(50);
  });

  it('never mixes providers — a different-provider metric is invisible', async () => {
    const kw1 = new mongoose.Types.ObjectId();
    rows = [{ keywordId: kw1, provider: 'other-provider', capturedAt: new Date('2026-06-01'), searchVolume: 999 }];
    const result = await loadLatestMetricsByKeywordIds([kw1], 'dataforseo');
    expect(result.get(String(kw1))).toBeNull();
  });

  it('a keyword with no metric at all maps to null (UNKNOWN, never zero)', async () => {
    const kw1 = new mongoose.Types.ObjectId();
    const result = await loadLatestMetricsByKeywordIds([kw1], 'dataforseo');
    expect(result.get(String(kw1))).toBeNull();
    expect(result.has(String(kw1))).toBe(true);
  });

  it('empty keywordIds returns an empty map without querying', async () => {
    const result = await loadLatestMetricsByKeywordIds([], 'dataforseo');
    expect(result.size).toBe(0);
  });
});
