import mongoose from 'mongoose';
import { MarketOpportunityDraft } from '../../../src/modules/seo/market/market.types';

interface FakeDoc {
  fingerprint: string;
  status: 'open' | 'resolved';
  source: string;
  affectedUrls: string[];
  recommendationId: string;
  resolvedRunId: mongoose.Types.ObjectId | null;
  lastSeenRunId: mongoose.Types.ObjectId | null;
  firstSeenRunId: mongoose.Types.ObjectId | null;
  save: jest.Mock;
}

let store: FakeDoc[] = [];

function makeDoc(fields: Partial<FakeDoc>): FakeDoc {
  const doc: FakeDoc = {
    fingerprint: '', status: 'open', source: 'market', affectedUrls: [], recommendationId: '',
    resolvedRunId: null, lastSeenRunId: null, firstSeenRunId: null,
    save: jest.fn(async function (this: FakeDoc) { return this; }),
    ...fields,
  };
  return doc;
}

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findOne: jest.fn((query: { fingerprint: string }) => ({
      exec: async () => store.find((d) => d.fingerprint === query.fingerprint) ?? null,
    })),
    find: jest.fn((query: { status?: string; source?: string; affectedUrls?: string }) => ({
      exec: async () => store.filter((d) => (!query.status || d.status === query.status) && (!query.source || d.source === query.source) && (!query.affectedUrls || d.affectedUrls.includes(query.affectedUrls))),
      select: () => ({
        lean: () => ({
          exec: async () => store.filter((d) => (!query.status || d.status === query.status) && (!query.source || d.source === query.source) && (!query.affectedUrls || d.affectedUrls.includes(query.affectedUrls))),
        }),
      }),
    })),
    create: jest.fn(async (fields: Partial<FakeDoc>) => {
      const doc = makeDoc(fields);
      store.push(doc);
      return doc;
    }),
  },
}));

import { generateAndPersistMarketOpportunities, findRelatedGscRecommendationIds } from '../../../src/modules/seo/market/services/market-recommendation.service';

function draft(overrides: Partial<MarketOpportunityDraft> = {}): MarketOpportunityDraft {
  return {
    recommendationId: 'market-optimize',
    discriminator: 'https://rajhanstea.com/product/royal-darjeeling/::CATEGORY::darjeeling tea::darjeeling',
    category: 'existing-page-optimization',
    title: 'Optimize existing page for "darjeeling tea"',
    why: 'bucket B_EXISTING_NEEDS_OPT actionable with market-demand evidence',
    suggestedFix: 'Expand and improve the page.',
    score: 67.1,
    confidence: 'high',
    affectedUrls: ['https://rajhanstea.com/product/royal-darjeeling/'],
    evidence: {
      clusterLabel: 'darjeeling tea', memberKeywords: ['darjeeling tea'], eligibleGrowthMemberKeywords: ['darjeeling tea'],
      primaryIntent: 'CATEGORY', businessRelevanceScore: 0.95,
      demand: { maxKnownVolume: 500, metricsKnown: true, descriptiveTotalVolume: 500 },
      clusterGsc: { impressions: null, evidenceKnown: false },
      matchedPageGsc: { impressions: 100, avgPosition: 15, evidenceKnown: true },
      mapping: { bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://rajhanstea.com/product/royal-darjeeling/', matchScore: 0.7 },
      cannibalizationRisk: false,
      scoreComponents: {} as never,
      confidence: 'high', relatedRecommendationIds: [],
    },
    ...overrides,
  };
}

const runId1 = new mongoose.Types.ObjectId();
const runId2 = new mongoose.Types.ObjectId();

beforeEach(() => {
  store = [];
});

describe('generateAndPersistMarketOpportunities — lifecycle fields', () => {
  it('populates required firstSeenRunId/lastSeenRunId on create', async () => {
    await generateAndPersistMarketOpportunities(runId1, [draft()], { allowResolution: false });
    expect(store).toHaveLength(1);
    expect(store[0].firstSeenRunId).toBe(runId1);
    expect(store[0].lastSeenRunId).toBe(runId1);
    expect(store[0].source).toBe('market');
    expect(store[0].status).toBe('open');
  });

  it('is idempotent — the same semantic draft upserts to one document, not a duplicate', async () => {
    await generateAndPersistMarketOpportunities(runId1, [draft()], { allowResolution: false });
    await generateAndPersistMarketOpportunities(runId2, [draft()], { allowResolution: false });
    expect(store).toHaveLength(1);
    expect(store[0].lastSeenRunId).toBe(runId2);
  });
});

describe('generateAndPersistMarketOpportunities — resolution scoping/safety', () => {
  it('allowResolution=false never resolves stale recommendations', async () => {
    await generateAndPersistMarketOpportunities(runId1, [draft()], { allowResolution: false });
    await generateAndPersistMarketOpportunities(runId2, [], { allowResolution: false }); // no drafts this pass
    expect(store[0].status).toBe('open');
  });

  it('allowResolution=true resolves a market fingerprint missing from the new evaluation', async () => {
    await generateAndPersistMarketOpportunities(runId1, [draft()], { allowResolution: false });
    await generateAndPersistMarketOpportunities(runId2, [], { allowResolution: true });
    expect(store[0].status).toBe('resolved');
    expect(store[0].resolvedRunId).toBe(runId2);
  });

  it('resolution is source-scoped — a GSC recommendation is never touched by the market service', async () => {
    store.push(makeDoc({ fingerprint: 'gsc-fp', status: 'open', source: 'gsc', recommendationId: 'gsc-declining-page' }));
    await generateAndPersistMarketOpportunities(runId1, [], { allowResolution: true });
    expect(store.find((d) => d.source === 'gsc')!.status).toBe('open');
  });
});

describe('recommendation identity — two distinct clusters on the same URL', () => {
  it('produces two separate documents when discriminators differ', async () => {
    const a = draft({ discriminator: 'urlA::CATEGORY::assam tea retail::assam' });
    const b = draft({ discriminator: 'urlA::TRANSACTIONAL::bulk assam tea supplier::assam|tea supplier' });
    await generateAndPersistMarketOpportunities(runId1, [a, b], { allowResolution: false });
    expect(store).toHaveLength(2);
  });
});

describe('findRelatedGscRecommendationIds', () => {
  it('finds open GSC recs for the same URL without suppressing or resolving them', async () => {
    store.push(makeDoc({ fingerprint: 'gsc-fp', status: 'open', source: 'gsc', recommendationId: 'gsc-striking-distance', affectedUrls: ['https://rajhanstea.com/product/royal-darjeeling/'] }));
    const related = await findRelatedGscRecommendationIds('https://rajhanstea.com/product/royal-darjeeling/');
    expect(related).toEqual(['gsc-striking-distance']);
    expect(store[0].status).toBe('open'); // untouched
  });

  it('returns empty when no related GSC recommendation exists', async () => {
    const related = await findRelatedGscRecommendationIds('https://rajhanstea.com/product/none/');
    expect(related).toEqual([]);
  });
});
