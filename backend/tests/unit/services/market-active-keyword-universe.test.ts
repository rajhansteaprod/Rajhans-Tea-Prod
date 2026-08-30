import mongoose from 'mongoose';

interface FakeDoc {
  _id: mongoose.Types.ObjectId;
  keyword: string;
  normalizedKeyword: string;
  market: { country: string; language: string };
  discoveredAt: Date | null;
  lastCheckedAt: Date | null;
}

let docs: FakeDoc[] = [];

jest.mock('../../../src/modules/seo/market/models/search-keyword.model', () => ({
  SearchKeyword: {
    findOneAndUpdate: jest.fn((filter: { normalizedKeyword: string; 'market.country': string; 'market.language': string }, update: { $setOnInsert: Partial<FakeDoc> }) => ({
      exec: async () => {
        let doc = docs.find((d) => d.normalizedKeyword === filter.normalizedKeyword && d.market.country === filter['market.country'] && d.market.language === filter['market.language']);
        if (!doc) {
          doc = {
            _id: new mongoose.Types.ObjectId(),
            keyword: update.$setOnInsert.keyword!,
            normalizedKeyword: filter.normalizedKeyword,
            market: { country: filter['market.country'], language: filter['market.language'] },
            discoveredAt: new Date(),
            lastCheckedAt: null,
          };
          docs.push(doc);
        }
        return doc;
      },
    })),
  },
}));

import { ensureKeywordIdentities, buildActiveKeywordUniverse } from '../../../src/modules/seo/market/services/active-keyword-universe';
import { BASE_TAXONOMY } from '../../../src/modules/seo/market/relevance.taxonomy';
import { ISearchKeywordDoc } from '../../../src/modules/seo/market/models/search-keyword.model';

const NOW = new Date('2026-08-30T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);
const market = { country: 'IN', language: 'en' };

beforeEach(() => {
  docs = [];
});

function fakeCached(keyword: string, opts: Partial<FakeDoc> = {}): ISearchKeywordDoc {
  const doc: FakeDoc = { _id: new mongoose.Types.ObjectId(), keyword, normalizedKeyword: keyword, market, discoveredAt: null, lastCheckedAt: null, ...opts };
  return doc as unknown as ISearchKeywordDoc;
}

describe('ensureKeywordIdentities — the only DB-touching step', () => {
  it('upserts identities for seeds, discovery, and carry-forward keywords, deduped', async () => {
    const map = await ensureKeywordIdentities({
      seeds: [{ term: 'assam tea', normalizedTerm: 'assam tea', type: 'region', sourceRef: null }],
      discoveryKeywords: ['Darjeeling Tea'],
      carryForwardKeywords: ['assam tea'], // same normalized as a seed — deduped, not double-created
      market,
    });
    expect(map.size).toBe(2);
    expect(map.get('assam tea')?.keyword).toBe('assam tea');
    expect(map.get('darjeeling tea')?.keyword).toBe('Darjeeling Tea');
    expect(docs).toHaveLength(2); // no duplicate row for the shared normalized term
  });
});

describe('buildActiveKeywordUniverse — correction #1: relevance is a hard gate, demand never overrides it', () => {
  it('P/Y: low-relevance keyword with huge implied demand is excluded from discovery AND cache', () => {
    const lowRelevanceTerm = 'coffee beans'; // hard-negative in BASE_TAXONOMY -> definitely excluded
    const identityMap = new Map([[lowRelevanceTerm, fakeCached(lowRelevanceTerm)]]);
    const cachedDoc = fakeCached(lowRelevanceTerm, { discoveredAt: daysAgo(5) });
    const resultDiscovery = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [lowRelevanceTerm], cachedKeywords: [], carryForwardKeywords: [],
      keywordIdentityMap: identityMap, taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(resultDiscovery.active).toHaveLength(0);

    const resultCache = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [cachedDoc], carryForwardKeywords: [],
      keywordIdentityMap: new Map([[lowRelevanceTerm, cachedDoc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(resultCache.active).toHaveLength(0);
  });

  it('genuinely low-relevance (band=low, not hard-negative) plain keyword is excluded regardless of any demand signal', () => {
    const term = 'random unrelated phrase';
    const doc = fakeCached(term, { discoveredAt: daysAgo(1) });
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [term], cachedKeywords: [], carryForwardKeywords: [],
      keywordIdentityMap: new Map([[term, doc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.active).toHaveLength(0);
  });
});

describe('buildActiveKeywordUniverse — O: cache recency bound (90d)', () => {
  it('a relevant cached keyword last touched 91 days ago is excluded (retained in DB, excluded from active)', () => {
    const doc = fakeCached('assam tea', { discoveredAt: daysAgo(200), lastCheckedAt: daysAgo(91) });
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [doc], carryForwardKeywords: [],
      keywordIdentityMap: new Map([['assam tea', doc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.active).toHaveLength(0);
  });

  it('a relevant cached keyword checked 89 days ago is active', () => {
    const doc = fakeCached('assam tea', { discoveredAt: daysAgo(200), lastCheckedAt: daysAgo(89) });
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [doc], carryForwardKeywords: [],
      keywordIdentityMap: new Map([['assam tea', doc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.active).toHaveLength(1);
    expect(result.active[0].origin).toBe('cache');
  });
});

describe('buildActiveKeywordUniverse — carry-forward coverage (AD/AE/AF)', () => {
  it('AD: relevant carry-forward keyword bypasses the 90d age exclusion', () => {
    const doc = fakeCached('assam tea', { discoveredAt: daysAgo(400), lastCheckedAt: daysAgo(400) });
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [], carryForwardKeywords: ['assam tea'],
      keywordIdentityMap: new Map([['assam tea', doc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.active).toHaveLength(1);
    expect(result.active[0].origin).toBe('carry-forward');
    expect(result.carryForwardVerdicts.get('assam tea')).toBe('participated');
  });

  it('AE: low-relevance carry-forward keyword is explicitly-ineligible and does NOT enter clustering', () => {
    const doc = fakeCached('random unrelated phrase', { discoveredAt: daysAgo(400) });
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [], carryForwardKeywords: ['random unrelated phrase'],
      keywordIdentityMap: new Map([['random unrelated phrase', doc]]), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.active).toHaveLength(0);
    expect(result.carryForwardVerdicts.get('random unrelated phrase')).toBe('explicitly-ineligible');
  });

  it('AF: carry-forward keyword with no resolvable identity is unresolved, not silently dropped', () => {
    const result = buildActiveKeywordUniverse({
      seeds: [], discoveryKeywords: [], cachedKeywords: [], carryForwardKeywords: ['never seen before'],
      keywordIdentityMap: new Map(), taxonomy: BASE_TAXONOMY, now: NOW,
    });
    expect(result.carryForwardVerdicts.get('never seen before')).toBe('unresolved');
  });
});

describe('buildActiveKeywordUniverse — precedence and dedup', () => {
  it('seeds take precedence over discovery/cache for the same normalized term (first-writer-wins, single entry)', () => {
    const doc = fakeCached('assam tea');
    const result = buildActiveKeywordUniverse({
      seeds: [{ term: 'assam tea', normalizedTerm: 'assam tea', type: 'region', sourceRef: null }],
      discoveryKeywords: ['assam tea'],
      cachedKeywords: [doc],
      carryForwardKeywords: [],
      keywordIdentityMap: new Map([['assam tea', doc]]),
      taxonomy: BASE_TAXONOMY,
      now: NOW,
    });
    expect(result.active).toHaveLength(1);
    expect(result.active[0].origin).toBe('seed');
  });
});
