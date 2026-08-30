import mongoose from 'mongoose';

/**
 * Integration-style tests for runFullPipeline() (4b.7). All DB/provider
 * boundaries are mocked — no real DataForSEO call, no production DB write.
 * DATAFORSEO_LOGIN/PASSWORD are left UNSET so both providers report
 * isConfigured()=false; this is a deliberate choice for THIS suite: it
 * exercises the full real composition (universe -> clustering -> mapping ->
 * scoring -> snapshot -> staged persistence) with zero network surface,
 * while the provider seam itself (real discovery/SERP attempt gating) is
 * already covered by the dedicated seam unit tests.
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

let seedsOverride: (() => Promise<unknown[]>) | null = null;
jest.mock('../../../src/modules/seo/market/services/seed.engine', () => {
  const actual = jest.requireActual('../../../src/modules/seo/market/services/seed.engine');
  return { ...actual, generateSeeds: jest.fn(async (...args: unknown[]) => (seedsOverride ? seedsOverride() : actual.generateSeeds(...args))) };
});

interface FakeRunDoc {
  _id: mongoose.Types.ObjectId;
  market: { country: string; language: string };
  authorizationMode: string | null;
  costActualUsd: number;
  status: string;
  stage: string;
  persistenceStage: string;
  evaluationSnapshot: unknown | null;
  degradedReason: string | null;
  error: string | null;
  finishedAt: Date | null;
  counts: Record<string, number>;
  save: () => Promise<void>;
}

let runDoc: FakeRunDoc;
let seedDocs: unknown[] = [];
let cachedKeywordDocs: { _id: mongoose.Types.ObjectId; keyword: string; normalizedKeyword: string; market: { country: string; language: string }; discoveredAt: Date | null; lastCheckedAt: Date | null; hardNegative: boolean; serpSnapshot: null }[] = [];
let openRecommendations: { fingerprint: string; evidence: { memberKeywords?: string[] } }[] = [];
let identityDocs = new Map<string, { _id: mongoose.Types.ObjectId; keyword: string; normalizedKeyword: string; market: { country: string; language: string } }>();
let baselineRun: unknown = null;
let baselineClusters: unknown[] = [];
let createdClusters: Record<string, unknown>[] = [];
let upsertCalls: unknown[] = [];
let resolveCalls: unknown[] = [];

function makeRun(overrides: Partial<FakeRunDoc> = {}): FakeRunDoc {
  return {
    _id: new mongoose.Types.ObjectId(),
    market: { country: 'IN', language: 'en' },
    authorizationMode: 'confirm-under-threshold',
    costActualUsd: 0,
    status: 'running',
    stage: 'planning',
    persistenceStage: 'not-started',
    evaluationSnapshot: null,
    degradedReason: null,
    error: null,
    finishedAt: null,
    counts: { keywordsDiscovered: 0, keywordsRetained: 0, keywordsRejected: 0, clusters: 0, opportunities: 0, cacheHits: 0, cacheMisses: 0, serpsFetched: 0, mappingsProduced: 0, recommendationsCreated: 0, recommendationsUpdated: 0, recommendationsResolved: 0 },
    save: jest.fn(async function (this: FakeRunDoc) { /* no-op: mutation already applied in place */ }),
    ...overrides,
  };
}

jest.mock('../../../src/modules/seo/market/models/search-market-run.model', () => ({
  SearchMarketRun: {
    findById: jest.fn(() => ({ exec: async () => runDoc })),
    findOne: jest.fn(() => ({ sort: () => ({ exec: async () => baselineRun }) })),
    aggregate: jest.fn(async () => []),
  },
}));

jest.mock('../../../src/modules/seo/market/models/search-seed.model', () => ({
  SearchSeed: { find: jest.fn(() => ({ exec: async () => seedDocs })) },
}));

jest.mock('../../../src/modules/seo/market/models/search-keyword.model', () => ({
  SearchKeyword: {
    find: jest.fn(() => ({ exec: async () => cachedKeywordDocs })),
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

jest.mock('../../../src/modules/seo/market/models/search-cluster.model', () => ({
  SearchCluster: {
    create: jest.fn(async (doc: Record<string, unknown>) => {
      createdClusters.push(doc);
      return { ...doc, _id: new mongoose.Types.ObjectId() };
    }),
    find: jest.fn(() => ({ exec: async () => baselineClusters })),
  },
}));

jest.mock('../../../src/modules/seo/market/models/search-keyword-metric.model', () => ({
  SearchKeywordMetric: {
    findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
    aggregate: jest.fn(() => ({ exec: async () => [] })),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    find: jest.fn(() => chain(openRecommendations)),
  },
}));

jest.mock('../../../src/modules/seo/market/services/market-recommendation.service', () => ({
  upsertMarketOpportunityDrafts: jest.fn(async (_runId: unknown, drafts: unknown[]) => {
    upsertCalls.push(drafts);
    const fingerprints = (drafts as { recommendationId: string; discriminator: string }[]).map((d) => `${d.recommendationId}::reco::${d.discriminator}`);
    return { created: drafts.length, updated: 0, fingerprints };
  }),
  resolveMissingMarketOpportunities: jest.fn(async (_runId: unknown, fingerprints: string[]) => {
    resolveCalls.push(fingerprints);
    return { resolved: 0 };
  }),
}));

import { runFullPipeline } from '../../../src/modules/seo/market/services/market-pipeline.service';

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  runDoc = makeRun();
  seedsOverride = null;
  seedDocs = [];
  cachedKeywordDocs = [];
  openRecommendations = [];
  identityDocs = new Map();
  baselineRun = null;
  baselineClusters = [];
  createdClusters = [];
  upsertCalls = [];
  resolveCalls = [];
});
afterAll(() => {
  process.env.DATAFORSEO_LOGIN = originalLogin;
  process.env.DATAFORSEO_PASSWORD = originalPassword;
});

function cachedKeyword(keyword: string, opts: Partial<(typeof cachedKeywordDocs)[number]> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    keyword,
    normalizedKeyword: keyword,
    market: { country: 'IN', language: 'en' },
    discoveredAt: new Date(),
    lastCheckedAt: null,
    hardNegative: false,
    serpSnapshot: null,
    ...opts,
  };
}

describe('runFullPipeline — no discovery due, complete evaluation (scenario 1)', () => {
  it('reaches status=completed, persistenceStage=done, and upserts+resolves using the frozen snapshot', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('darjeeling tea')];

    await runFullPipeline(runDoc._id);

    expect(runDoc.status).toBe('completed');
    expect(runDoc.persistenceStage).toBe('done');
    expect(runDoc.stage).toBe('finished');
    expect(runDoc.evaluationSnapshot).not.toBeNull();
    expect(upsertCalls).toHaveLength(1);
    expect(resolveCalls).toHaveLength(1); // allowResolution=true on a completed run
  });

  it('only FINAL clusters are ever persisted as SearchCluster docs — never a preliminary pass', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea')];
    await runFullPipeline(runDoc._id);
    // exactly one SearchCluster.create per final cluster; no separate "preliminary" persistence call exists in the implementation at all
    expect(createdClusters.length).toBeGreaterThan(0);
    for (const c of createdClusters) expect(c.runId).toBe(runDoc._id);
  });

  it('stableClusterId is persisted on SearchCluster but never appears in a recommendation discriminator (4b.6 topicKey untouched)', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea')];
    await runFullPipeline(runDoc._id);
    for (const c of createdClusters) expect(typeof c.stableClusterId).toBe('string');
    const stableIds = createdClusters.map((c) => c.stableClusterId as string);
    for (const drafts of upsertCalls as { discriminator: string }[][]) {
      for (const d of drafts) {
        for (const sid of stableIds) expect(d.discriminator.includes(sid)).toBe(false);
      }
    }
  });
});

describe('runFullPipeline — resolution coverage gates resolution', () => {
  it('missing/malformed memberKeywords on an open recommendation -> unresolved-coverage -> degraded, resolution NOT attempted', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea')];
    openRecommendations = [{ fingerprint: 'legacy-fp-1', evidence: {} }]; // memberKeywords missing

    await runFullPipeline(runDoc._id);

    expect(runDoc.status).toBe('degraded');
    // persistenceStage still reaches 'done' (upsert work is always allowed on a
    // degraded run), but the RESOLVE step itself was never invoked.
    expect(runDoc.persistenceStage).toBe('done');
    expect(resolveCalls).toHaveLength(0);
  });

  it('an open recommendation whose member is still relevant and active is reevaluated -> coverage complete -> resolution proceeds', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea')];
    openRecommendations = [{ fingerprint: 'legacy-fp-2', evidence: { memberKeywords: ['assam tea'] } }];

    await runFullPipeline(runDoc._id);

    expect(runDoc.status).toBe('completed');
    expect(resolveCalls).toHaveLength(1);
  });
});

describe('runFullPipeline — resume case B: evaluationSnapshot already frozen', () => {
  it('never recomputes evidence/clustering — resumes staged persistence from the frozen snapshot only', async () => {
    const frozenDrafts = [{ recommendationId: 'market-optimize', discriminator: 'url::CATEGORY::assam tea::assam' }];
    runDoc = makeRun({
      persistenceStage: 'upserting',
      evaluationSnapshot: {
        version: 1, generatedAt: new Date(), draftFingerprints: ['market-optimize::reco::url::CATEGORY::assam tea::assam'], draftCount: 1,
        snapshotHash: 'irrelevant', drafts: frozenDrafts, evaluationOutcome: 'completed', allowResolution: true, degradationReasons: [],
      },
    });

    await runFullPipeline(runDoc._id);

    expect(createdClusters).toHaveLength(0); // no clustering/mapping/persistence of clusters happened
    expect(upsertCalls).toEqual([frozenDrafts]); // exact frozen drafts, not recomputed
    expect(resolveCalls).toEqual([['market-optimize::reco::url::CATEGORY::assam tea::assam']]); // exact frozen fingerprint set
    expect(runDoc.status).toBe('completed');
    expect(runDoc.persistenceStage).toBe('done');
  });

  it('resuming from persistenceStage=resolving retries resolution directly, without re-upserting', async () => {
    const frozenDrafts = [{ recommendationId: 'market-optimize', discriminator: 'd1' }];
    runDoc = makeRun({
      persistenceStage: 'resolving',
      evaluationSnapshot: { version: 1, generatedAt: new Date(), draftFingerprints: ['fp1'], draftCount: 1, snapshotHash: 'x', drafts: frozenDrafts, evaluationOutcome: 'completed', allowResolution: true, degradationReasons: [] },
    });

    await runFullPipeline(runDoc._id);

    expect(upsertCalls).toHaveLength(0);
    expect(resolveCalls).toEqual([['fp1']]);
    expect(runDoc.status).toBe('completed');
  });

  it('a degraded frozen snapshot never resolves, even on resume', async () => {
    runDoc = makeRun({
      persistenceStage: 'upserted',
      evaluationSnapshot: { version: 1, generatedAt: new Date(), draftFingerprints: [], draftCount: 0, snapshotHash: 'x', drafts: [], evaluationOutcome: 'degraded', allowResolution: false, degradationReasons: ['x'] },
    });

    await runFullPipeline(runDoc._id);

    expect(resolveCalls).toHaveLength(0);
    expect(runDoc.status).toBe('degraded');
    expect(runDoc.persistenceStage).toBe('done');
  });
});

describe('runFullPipeline — zero opportunities is a valid completed outcome (scenario 13)', () => {
  it('no cached keywords produce a scoreable opportunity, but the run still completes and an empty fingerprint set may resolve stale recommendations', async () => {
    // A single generic, low-relevance-free but non-actionable keyword: relevant enough to
    // cluster, but with no market-demand evidence -> scoreOpportunity() legitimately returns null.
    cachedKeywordDocs = [cachedKeyword('rajhans tea')];
    openRecommendations = [{ fingerprint: 'stale-fp', evidence: { memberKeywords: ['some other now-gone topic'] } }];
    // 'some other now-gone topic' resolves to a fresh low-relevance identity -> explicitly-ineligible -> covered.

    await runFullPipeline(runDoc._id);

    expect(runDoc.status).toBe('completed');
    expect(resolveCalls).toHaveLength(1);
  });
});

describe('runFullPipeline — no active keywords is a fatal condition, not a silent completion', () => {
  it('an empty active universe fails the run rather than fabricating a completed empty evaluation', async () => {
    seedsOverride = async () => []; // no facet/inventory seeds this test
    cachedKeywordDocs = [cachedKeyword('coffee beans')]; // hard-negative -> excluded -> empty universe
    await runFullPipeline(runDoc._id);
    expect(runDoc.status).toBe('failed');
    expect(runDoc.error).toContain('active keyword universe is empty');
  });
});
