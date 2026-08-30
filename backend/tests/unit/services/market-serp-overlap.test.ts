import { SerpOverlapCache } from '../../../src/modules/seo/market/services/serp-overlap.provider';
import { clusterKeywords } from '../../../src/modules/seo/market/services/clustering.engine';
import { Market, SerpProvider, SerpResult } from '../../../src/modules/seo/market/market.types';

const market: Market = { country: 'IN', language: 'en' };

function fakeResult(keyword: string, urls: string[]): SerpResult {
  return { keyword, topUrls: urls, topDomains: urls.map((u) => new URL(u).hostname), resultTypes: ['organic'], features: [], retrievedAt: '2026-01-01T00:00:00Z' };
}

describe('SerpOverlapCache — dedup and caching', () => {
  it('fetches a given keyword at most once even when requested many times', async () => {
    const getSerp = jest.fn().mockResolvedValue(fakeResult('assam tea', ['https://a.com/', 'https://b.com/', 'https://c.com/', 'https://d.com/', 'https://e.com/']));
    const provider: SerpProvider = { id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }), getSerp };
    const cache = new SerpOverlapCache();

    await Promise.all(Array.from({ length: 10 }, () => cache.getOrFetch('assam tea', market, provider)));

    expect(getSerp).toHaveBeenCalledTimes(1);
  });

  it('fetchAll deduplicates the same normalized keyword across the whole batch', async () => {
    const getSerp = jest.fn().mockResolvedValue(fakeResult('assam tea', ['https://a.com/']));
    const provider: SerpProvider = { id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }), getSerp };
    const cache = new SerpOverlapCache();

    await cache.fetchAll(['assam tea', 'Assam Tea', ' assam tea '], market, provider);

    expect(getSerp).toHaveBeenCalledTimes(1);
  });

  it('a failed fetch does not permanently poison the keyword — it can be retried later in the same run', async () => {
    const getSerp = jest.fn().mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce(fakeResult('assam tea', ['https://a.com/']));
    const provider: SerpProvider = { id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }), getSerp };
    const cache = new SerpOverlapCache();

    const first = await cache.getOrFetch('assam tea', market, provider);
    expect(first).toBeNull();
    const second = await cache.getOrFetch('assam tea', market, provider);
    expect(second).not.toBeNull();
    expect(getSerp).toHaveBeenCalledTimes(2);
  });
});

describe('SerpOverlapCache.asOverlapProvider — UNKNOWN vs real zero', () => {
  it('returns null (UNKNOWN) when a keyword was never fetched', () => {
    const cache = new SerpOverlapCache();
    const overlap = cache.asOverlapProvider(market);
    expect(overlap.getPairEvidence('assam tea', 'darjeeling tea')).toBeNull();
  });

  it('returns null (UNKNOWN) when a SERP has fewer than minValidOrganicResults', async () => {
    const provider: SerpProvider = {
      id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }),
      getSerp: async (kw) => fakeResult(kw, ['https://a.com/', 'https://b.com/']), // only 2, below the floor of 5
    };
    const cache = new SerpOverlapCache();
    await cache.fetchAll(['assam tea', 'darjeeling tea'], market, provider);
    expect(cache.asOverlapProvider(market).getPairEvidence('assam tea', 'darjeeling tea')).toBeNull();
  });

  it('returns a real score of 0 for two valid, fully-checked SERPs with no overlap', async () => {
    const provider: SerpProvider = {
      id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }),
      getSerp: async (kw) =>
        kw === 'assam tea'
          ? fakeResult(kw, ['https://a1.com/', 'https://a2.com/', 'https://a3.com/', 'https://a4.com/', 'https://a5.com/'])
          : fakeResult(kw, ['https://b1.com/', 'https://b2.com/', 'https://b3.com/', 'https://b4.com/', 'https://b5.com/']),
    };
    const cache = new SerpOverlapCache();
    await cache.fetchAll(['assam tea', 'darjeeling tea'], market, provider);
    const evidence = cache.asOverlapProvider(market).getPairEvidence('assam tea', 'darjeeling tea');
    expect(evidence).not.toBeNull();
    expect(evidence!.score).toBe(0);
  });

  it('computes the exact 0.70/0.30 weighted overlap formula', async () => {
    const provider: SerpProvider = {
      id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }),
      getSerp: async (kw) =>
        kw === 'assam tea'
          ? fakeResult(kw, ['https://shared1.com/', 'https://shared2.com/', 'https://c.com/', 'https://d.com/', 'https://e.com/'])
          : fakeResult(kw, ['https://shared1.com/', 'https://shared2.com/', 'https://f.com/', 'https://g.com/', 'https://h.com/']),
    };
    const cache = new SerpOverlapCache();
    await cache.fetchAll(['assam tea', 'assam ctc tea'], market, provider);
    const evidence = cache.asOverlapProvider(market).getPairEvidence('assam tea', 'assam ctc tea')!;
    // urlOverlap = 2/5 = 0.4; domainOverlap = 2/5 = 0.4 (domains derived 1:1 from these URLs)
    expect(evidence.score).toBeCloseTo(0.7 * 0.4 + 0.3 * 0.4, 6);
  });
});

describe('integration with clustering.engine.ts (unchanged) — strengthens but never bypasses the anchor gate', () => {
  function highOverlapProvider(sharedCount: number): SerpProvider {
    const shared = Array.from({ length: sharedCount }, (_, i) => `https://shared${i}.com/`);
    const filler = (n: number) => Array.from({ length: n }, (_, i) => `https://filler${i}.com/`);
    return {
      id: 'fake', kind: 'serp', isConfigured: () => true, estimateCost: () => ({ usd: 0.002, unknown: false }),
      getSerp: async (kw) => fakeResult(kw, [...shared, ...filler(5 - sharedCount)]),
    };
  }

  it('real SERP evidence strengthens an already-passing cluster (assam tea + assam ctc tea)', async () => {
    const cache = new SerpOverlapCache();
    const provider = highOverlapProvider(5);
    await cache.fetchAll(['assam tea', 'assam ctc tea'], market, provider);
    const withSerp = clusterKeywords({
      keywords: [{ keywordId: '1', keyword: 'assam tea', normalizedKeyword: 'assam tea' }, { keywordId: '2', keyword: 'assam ctc tea', normalizedKeyword: 'assam ctc tea' }],
      serpOverlap: cache.asOverlapProvider(market),
    });
    expect(withSerp.clusters).toHaveLength(1);
    const member = withSerp.clusters[0].members.find((m) => m.keyword === 'assam ctc tea')!;
    expect(member.reasons.some((r) => r.signal === 'serp' && r.score === 1)).toBe(true);
  });

  it('even a synthetic score of 1.0 does NOT merge assam tea + darjeeling tea (anchor gate absolute)', async () => {
    const cache = new SerpOverlapCache();
    const provider = highOverlapProvider(5); // fully overlapping fake SERPs
    await cache.fetchAll(['assam tea', 'darjeeling tea'], market, provider);
    const withSerp = clusterKeywords({
      keywords: [{ keywordId: '1', keyword: 'assam tea', normalizedKeyword: 'assam tea' }, { keywordId: '2', keyword: 'darjeeling tea', normalizedKeyword: 'darjeeling tea' }],
      serpOverlap: cache.asOverlapProvider(market),
    });
    expect(withSerp.clusters).toHaveLength(2); // still separate — matches the existing 4b.3 regression test
  });
});
