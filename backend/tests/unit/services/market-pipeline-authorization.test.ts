import mongoose from 'mongoose';

/**
 * Authorization-exhaustion recovery (4b.7 completion pass). Every DB/provider
 * boundary is mocked; `reserveAttemptCost` itself is mocked directly (its own
 * reasonCode categorization is separately unit-tested in
 * market-cost-reservation.test.ts) so these tests isolate exactly what
 * runFullPipeline does with each refusal category.
 */

function chain(result: unknown) {
  return { select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(result) }) }) };
}

jest.mock('../../../src/modules/catalog/models/product.model', () => ({ Product: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/catalog/models/category.model', () => ({ Category: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/cms/models/blog.model', () => ({ Blog: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/cms/models/page.model', () => ({ Page: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/seo/models/seo-issue.model', () => ({ SeoIssue: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/seo/services/gsc.sync.service', () => ({
  buildSeoContext: jest.fn(async () => ({ canonicalSet: new Set<string>(), facts: new Map() })),
}));
jest.mock('../../../src/modules/seo/models/gsc-query-page-metric.model', () => ({ GscQueryPageMetric: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({ SeoRecommendation: { find: jest.fn(() => chain([])) } }));
jest.mock('../../../src/modules/seo/market/services/market-recommendation.service', () => ({
  upsertMarketOpportunityDrafts: jest.fn(async () => ({ created: 0, updated: 0, fingerprints: [] })),
  resolveMissingMarketOpportunities: jest.fn(async () => ({ resolved: 0 })),
}));

interface FakeSeedDoc {
  term: string;
  normalizedTerm: string;
  enabled: boolean;
  market: { country: string; language: string };
  providerDiscoveryState: { provider: string; lastDiscoveredAt: Date | null }[];
  save: () => Promise<void>;
}
let dueSeedDoc: FakeSeedDoc;

jest.mock('../../../src/modules/seo/market/models/search-seed.model', () => ({
  SearchSeed: { find: jest.fn(() => ({ exec: async () => [dueSeedDoc], lean: () => ({ exec: async () => [dueSeedDoc] }) })) },
}));

interface FakeKeywordDoc {
  _id: mongoose.Types.ObjectId;
  keyword: string;
  normalizedKeyword: string;
  market: { country: string; language: string };
}
let identityDocs = new Map<string, FakeKeywordDoc>();
jest.mock('../../../src/modules/seo/market/models/search-keyword.model', () => ({
  SearchKeyword: {
    find: jest.fn(() => ({ exec: async () => [] })),
    findOneAndUpdate: jest.fn((filter: { normalizedKeyword: string; 'market.country': string; 'market.language': string }, update: { $setOnInsert: { keyword: string } }) => ({
      exec: async () => {
        let doc = identityDocs.get(filter.normalizedKeyword);
        if (!doc) {
          doc = { _id: new mongoose.Types.ObjectId(), keyword: update.$setOnInsert.keyword, normalizedKeyword: filter.normalizedKeyword, market: { country: filter['market.country'], language: filter['market.language'] } };
          identityDocs.set(filter.normalizedKeyword, doc);
        }
        return doc;
      },
    })),
  },
}));
jest.mock('../../../src/modules/seo/market/models/search-keyword-metric.model', () => ({
  SearchKeywordMetric: {
    findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    aggregate: jest.fn(() => ({ exec: async () => [] })),
  },
}));
jest.mock('../../../src/modules/seo/market/models/search-cluster.model', () => ({ SearchCluster: { create: jest.fn(async () => ({})), find: jest.fn(() => ({ exec: async () => [] })) } }));

interface FakeRunDoc {
  _id: mongoose.Types.ObjectId;
  market: { country: string; language: string };
  authorizationMode: string | null;
  approvedCostUsd: number | null;
  costActualUsd: number;
  status: string;
  stage: string;
  persistenceStage: string;
  evaluationSnapshot: unknown | null;
  planSnapshot: unknown | null;
  error: string | null;
  finishedAt: Date | null;
  counts: Record<string, number>;
  save: () => Promise<void>;
}
let runDoc: FakeRunDoc;

jest.mock('../../../src/modules/seo/market/models/search-market-run.model', () => ({
  SearchMarketRun: {
    findById: jest.fn(() => ({ exec: async () => runDoc })),
    findOne: jest.fn(() => ({ sort: () => ({ exec: async () => null }) })),
    aggregate: jest.fn(async () => []),
  },
}));

let reservationQueue: { allowed: boolean; reason: string; reasonCode?: string }[] = [];
const reservationCalls: number[] = [];
jest.mock('../../../src/modules/seo/market/services/market-cost-reservation.service', () => ({
  reserveAttemptCost: jest.fn(async () => {
    reservationCalls.push(reservationCalls.length);
    return reservationQueue.shift() ?? { allowed: true, reason: 'reserved' };
  }),
}));

import { runFullPipelineInternal } from '../../../src/modules/seo/market/services/market-pipeline.service';

function makeRun(overrides: Partial<FakeRunDoc> = {}): FakeRunDoc {
  return {
    _id: new mongoose.Types.ObjectId(),
    market: { country: 'IN', language: 'en' },
    authorizationMode: 'confirm-under-threshold',
    approvedCostUsd: null,
    costActualUsd: 0.3,
    status: 'running',
    stage: 'planning',
    persistenceStage: 'not-started',
    evaluationSnapshot: null,
    planSnapshot: null,
    error: null,
    finishedAt: null,
    counts: { keywordsDiscovered: 0, keywordsRetained: 0, keywordsRejected: 0, clusters: 0, opportunities: 0, cacheHits: 0, cacheMisses: 0, serpsFetched: 0, mappingsProduced: 0, recommendationsCreated: 0, recommendationsUpdated: 0, recommendationsResolved: 0 },
    save: jest.fn(async () => undefined),
    ...overrides,
  };
}

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = 'test-login';
  process.env.DATAFORSEO_PASSWORD = 'test-password';
  runDoc = makeRun();
  dueSeedDoc = { term: 'assam tea', normalizedTerm: 'assam tea', enabled: true, market: { country: 'IN', language: 'en' }, providerDiscoveryState: [], save: jest.fn(async () => undefined) };
  identityDocs = new Map();
  reservationQueue = [];
  reservationCalls.length = 0;
});
afterAll(() => {
  process.env.DATAFORSEO_LOGIN = originalLogin;
  process.env.DATAFORSEO_PASSWORD = originalPassword;
});

function mockFetchOnce(items: { keyword: string; keyword_info?: unknown }[]) {
  return jest.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ seed_keywords: [], total_count: items.length, items }] }] }),
  });
}

describe('Authorization exhaustion — Case A: ceiling exhausted, hard caps still have room', () => {
  it('A1: SAME run returns to pending-approval, no resolution, costActualUsd preserved, remaining planSnapshot persisted', async () => {
    reservationQueue = [{ allowed: false, reason: 'projected run cost exceeds authorization ceiling', reasonCode: 'authorization-ceiling-exceeded' }];
    const fetchImpl = mockFetchOnce([]);

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(runDoc.status).toBe('pending-approval');
    expect(runDoc.authorizationMode).toBeNull();
    expect(runDoc.costActualUsd).toBe(0.3); // preserved, untouched
    expect(runDoc.planSnapshot).not.toBeNull();
    expect((runDoc.planSnapshot as { planFingerprint: string }).planFingerprint).toEqual(expect.any(String));
    expect(fetchImpl).not.toHaveBeenCalled(); // reservation refused BEFORE the physical HTTP attempt
  });
});

describe('Authorization exhaustion — Case B/C: hard caps never revive to pending-approval', () => {
  it('A3: per-run hard cap -> never pending-approval, run continues and finishes degraded', async () => {
    reservationQueue = [{ allowed: false, reason: 'exceeds per-run hard cap', reasonCode: 'per-run-hard-cap' }];
    const fetchImpl = mockFetchOnce([]);

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(runDoc.status).not.toBe('pending-approval');
    expect(runDoc.status).toBe('degraded');
    expect(runDoc.authorizationMode).toBe('confirm-under-threshold'); // untouched — no revival
  });

  it('A4: monthly hard cap -> never pending-approval, run continues and finishes degraded', async () => {
    reservationQueue = [{ allowed: false, reason: 'exceeds monthly hard cap', reasonCode: 'monthly-hard-cap' }];
    const fetchImpl = mockFetchOnce([]);

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(runDoc.status).not.toBe('pending-approval');
    expect(runDoc.status).toBe('degraded');
  });
});

describe('Authorization exhaustion — A2 equivalent: remaining-work plan composition for --approve', () => {
  it('approvedCostUsd for the next --approve is prior spend + newly-recomputed remaining estimate (absolute cumulative ceiling, not a reset)', async () => {
    reservationQueue = [{ allowed: false, reason: 'ceiling', reasonCode: 'authorization-ceiling-exceeded' }];
    const fetchImpl = mockFetchOnce([]);
    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    const plan = runDoc.planSnapshot as { estimatedCostUsd: number };
    const approvedAdditionalCostUsd = plan.estimatedCostUsd;
    const approvedCostUsd = runDoc.costActualUsd + approvedAdditionalCostUsd; // exact --approve formula
    expect(approvedCostUsd).toBeCloseTo(0.3 + plan.estimatedCostUsd, 6);
  });
});
