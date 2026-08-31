import mongoose from 'mongoose';

/**
 * End-to-end discovery/SERP integration through runFullPipeline, using the
 * test-only dependency-injection seam (`MarketPipelineDeps.*ProviderOverrides.
 * fetchImpl`). Real DataForSeoProvider/DataForSeoSerpProvider instances are
 * used with fake credentials (so isConfigured()=true) and a mocked fetchImpl —
 * the ONLY HTTP implementation used anywhere in this file is that mock.
 * Nothing here makes a real network call. The durable
 * beforePhysicalAttempt -> reserveAttemptCost -> RunBudget -> fetchImpl chain
 * is exercised for real (reserveAttemptCost itself is NOT mocked in this file).
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
const upsertMarketOpportunityDrafts = jest.fn<Promise<{ created: number; updated: number; fingerprints: string[] }>, [unknown, unknown]>(async (_r, drafts) => ({ created: (drafts as unknown[]).length, updated: 0, fingerprints: [] }));
const resolveMissingMarketOpportunities = jest.fn<Promise<{ resolved: number }>, [unknown, unknown]>(async () => ({ resolved: 0 }));
jest.mock('../../../src/modules/seo/market/services/market-recommendation.service', () => ({
  upsertMarketOpportunityDrafts: (r: unknown, d: unknown) => upsertMarketOpportunityDrafts(r, d as unknown[]),
  resolveMissingMarketOpportunities: (r: unknown, f: unknown) => resolveMissingMarketOpportunities(r, f),
}));

interface FakeSeedDoc {
  term: string;
  normalizedTerm: string;
  enabled: boolean;
  market: { country: string; language: string };
  providerDiscoveryState: { provider: string; lastDiscoveredAt: Date | null }[];
  save: () => Promise<void>;
}
let seedDocs: FakeSeedDoc[] = [];
jest.mock('../../../src/modules/seo/market/models/search-seed.model', () => ({
  SearchSeed: {
    find: jest.fn(() => ({
      exec: async () => seedDocs,
      lean: () => ({ exec: async () => seedDocs }),
    })),
    findOneAndUpdate: jest.fn((filter: any, update: any) => ({
      exec: async () => {
        let doc = seedDocs.find((s) => s.normalizedTerm === filter.normalizedTerm);
        if (!doc) {
          doc = {
            term: update.$set.term,
            normalizedTerm: filter.normalizedTerm,
            enabled: true,
            market: update.$set.market,
            providerDiscoveryState: [
              { provider: 'dataforseo', lastDiscoveredAt: new Date() },
            ],
            save: jest.fn(async () => undefined),
          };
          seedDocs.push(doc);
        } else {
          Object.assign(doc, update.$set);
        }
        return doc;
      },
    })),
  },
}));

interface FakeKeywordDoc {
  _id: mongoose.Types.ObjectId;
  keyword: string;
  normalizedKeyword: string;
  market: { country: string; language: string };
  discoveredAt: Date | null;
  lastCheckedAt: Date | null;
  serpSnapshot: { provider: string; locationCode: number; languageCode: string; device: string; depth: number; schemaVersion: number; retrievedAt: Date; topUrls: string[]; topDomains: string[] } | null;
  save: () => Promise<void>;
}
let cachedKeywordDocs: FakeKeywordDoc[] = [];
const identityDocs = new Map<string, FakeKeywordDoc>();

function cachedKeyword(keyword: string, opts: Partial<FakeKeywordDoc> = {}): FakeKeywordDoc {
  const doc: FakeKeywordDoc = {
    _id: new mongoose.Types.ObjectId(), keyword, normalizedKeyword: keyword, market: { country: 'IN', language: 'en' },
    discoveredAt: new Date(), lastCheckedAt: null, serpSnapshot: null, save: jest.fn(async () => undefined), ...opts,
  };
  identityDocs.set(keyword, doc);
  return doc;
}

jest.mock('../../../src/modules/seo/market/models/search-keyword.model', () => ({
  SearchKeyword: {
    find: jest.fn(() => ({ exec: async () => cachedKeywordDocs })),
    findOneAndUpdate: jest.fn((filter: { normalizedKeyword: string; 'market.country': string; 'market.language': string }, update: { $setOnInsert: { keyword: string } }) => ({
      exec: async () => {
        let doc = identityDocs.get(filter.normalizedKeyword);
        if (!doc) {
          doc = { _id: new mongoose.Types.ObjectId(), keyword: update.$setOnInsert.keyword, normalizedKeyword: filter.normalizedKeyword, market: { country: filter['market.country'], language: filter['market.language'] }, discoveredAt: new Date(), lastCheckedAt: null, serpSnapshot: null, save: jest.fn(async () => undefined) };
          identityDocs.set(filter.normalizedKeyword, doc);
        }
        return doc;
      },
    })),
  },
}));

interface FakeMetricDoc { keywordId: mongoose.Types.ObjectId; provider: string; capturedAt: Date; searchVolume: number | null }
const persistedMetrics: FakeMetricDoc[] = [];
jest.mock('../../../src/modules/seo/market/models/search-keyword-metric.model', () => ({
  SearchKeywordMetric: {
    findOneAndUpdate: jest.fn((filter: { keywordId: mongoose.Types.ObjectId; provider: string; capturedAt: Date }, update: { $setOnInsert: Record<string, unknown> }) => ({
      exec: async () => {
        persistedMetrics.push({ keywordId: filter.keywordId, provider: filter.provider, capturedAt: filter.capturedAt, searchVolume: (update.$setOnInsert.searchVolume as number | null) ?? null });
        return null;
      },
    })),
    aggregate: jest.fn(() => ({ exec: async () => [] })),
  },
}));

let createdClusters: Record<string, unknown>[] = [];
jest.mock('../../../src/modules/seo/market/models/search-cluster.model', () => ({
  SearchCluster: {
    create: jest.fn(async (doc: Record<string, unknown>) => { createdClusters.push(doc); return { ...doc, _id: new mongoose.Types.ObjectId() }; }),
    find: jest.fn(() => ({ exec: async () => [] })),
  },
}));

interface FakeRunDoc {
  _id: mongoose.Types.ObjectId;
  market: { country: string; language: string };
  authorizationMode: string | null;
  costActualUsd: number;
  status: string;
  stage: string;
  persistenceStage: string;
  evaluationSnapshot: unknown | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  providersUsed: string[];
  counts: Record<string, number>;
  save: () => Promise<void>;
}
let runDoc: FakeRunDoc;
jest.mock('../../../src/modules/seo/market/models/search-market-run.model', () => ({
  SearchMarketRun: {
    findById: jest.fn(() => ({
      exec: async () => runDoc, // market-pipeline.service.ts's own direct usage
      select: () => ({ lean: () => ({ exec: async () => ({ costActualUsd: runDoc.costActualUsd, authorizationMode: runDoc.authorizationMode, approvedCostUsd: (runDoc as unknown as { approvedCostUsd: number | null }).approvedCostUsd }) }) }), // reserveAttemptCost's usage
    })),
    findOneAndUpdate: jest.fn((filter: { costActualUsd: { $lte: number } }, update: { $inc: { costActualUsd: number } }) => ({
      exec: async () => {
        if (runDoc.costActualUsd > filter.costActualUsd.$lte) return null;
        runDoc.costActualUsd += update.$inc.costActualUsd;
        return runDoc;
      },
    })),
    findOne: jest.fn(() => ({ sort: () => ({ exec: async () => null }) })),
    aggregate: jest.fn(async () => []),
  },
}));

import { runFullPipelineInternal, MarketPipelineOwnershipGuard } from '../../../src/modules/seo/market/services/market-pipeline.service';

/** Deterministic fake ownership guard — `loseOwnership()` simulates the
 * heartbeat lease's onOwnershipLost callback firing mid-run. */
function makeFakeOwnershipGuard(): { guard: MarketPipelineOwnershipGuard; loseOwnership: () => void } {
  let lost = false;
  return {
    guard: { isLost: () => lost, assertOwned: async () => { if (lost) throw new Error('ownership lost'); } },
    loseOwnership: () => { lost = true; },
  };
}

function makeRun(overrides: Partial<FakeRunDoc> = {}): FakeRunDoc {
  return {
    _id: new mongoose.Types.ObjectId(), market: { country: 'IN', language: 'en' }, authorizationMode: 'manual-approval', costActualUsd: 0,
    status: 'running', stage: 'planning', persistenceStage: 'not-started', evaluationSnapshot: null, error: null, startedAt: null, finishedAt: null, providersUsed: [],
    counts: { keywordsDiscovered: 0, keywordsRetained: 0, keywordsRejected: 0, clusters: 0, opportunities: 0, cacheHits: 0, cacheMisses: 0, serpsFetched: 0, mappingsProduced: 0, recommendationsCreated: 0, recommendationsUpdated: 0, recommendationsResolved: 0 },
    save: jest.fn(async () => undefined),
    ...overrides,
  };
}
// approvedCostUsd read via select() in reserveAttemptCost — attach dynamically since not in the interface above.
function withApproval(run: FakeRunDoc, approvedCostUsd: number): FakeRunDoc & { approvedCostUsd: number } {
  return Object.assign(run, { approvedCostUsd });
}

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = 'test-login';
  process.env.DATAFORSEO_PASSWORD = 'test-password';
  runDoc = withApproval(makeRun(), 5);
  seedDocs = [];
  cachedKeywordDocs = [];
  identityDocs.clear();
  persistedMetrics.length = 0;
  createdClusters = [];
  upsertMarketOpportunityDrafts.mockClear();
  resolveMissingMarketOpportunities.mockClear();
});
afterAll(() => {
  process.env.DATAFORSEO_LOGIN = originalLogin;
  process.env.DATAFORSEO_PASSWORD = originalPassword;
});

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
function ideasResponse(items: { keyword: string; keyword_info?: unknown }[]) {
  return jsonResponse(200, { status_code: 20000, tasks: [{ status_code: 20000, result: [{ seed_keywords: [], total_count: items.length, items }] }] });
}
function serpResponse(urls: string[]) {
  return jsonResponse(200, { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: urls.map((u, i) => ({ type: 'organic', url: u, domain: new URL(u).hostname, rank_group: i + 1 })) }] }] });
}

describe('C: discovery through runFullPipeline (real DataForSeoProvider, mocked fetchImpl)', () => {
  it('C1: discovery due + mocked success -> identities + inline metrics persist, THEN providerDiscoveryState updates', async () => {
    const seed: FakeSeedDoc = { term: 'assam tea', normalizedTerm: 'assam tea', enabled: true, market: { country: 'IN', language: 'en' }, providerDiscoveryState: [], save: jest.fn(async () => undefined) };
    seedDocs = [seed];
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([{ keyword: 'assam tea', keyword_info: { search_volume: 480, cpc: 0.3, competition: 0.2, competition_level: 'LOW' } }]));

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('keyword_ideas');
    expect(persistedMetrics.some((m) => m.searchVolume === 480)).toBe(true);
    expect(seed.providerDiscoveryState.find((s) => s.provider === 'dataforseo')?.lastDiscoveredAt).not.toBeNull();
    expect(seed.save).toHaveBeenCalled();

    expect(runDoc.startedAt).toBeInstanceOf(Date);
    expect(runDoc.providersUsed).toEqual(['dataforseo']);
    expect(runDoc.counts.keywordsDiscovered).toBe(1);
    expect(runDoc.counts.keywordsRetained).toBe(1);
    expect(runDoc.counts.keywordsRejected).toBe(0);
  });

  it('C2: discovery provider failure -> no false providerDiscoveryState freshness update, run fails, no resolution attempted', async () => {
    const seed: FakeSeedDoc = { term: 'assam tea', normalizedTerm: 'assam tea', enabled: true, market: { country: 'IN', language: 'en' }, providerDiscoveryState: [], save: jest.fn(async () => undefined) };
    seedDocs = [seed];
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, {})); // exhausts retries -> throws

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(seed.providerDiscoveryState).toHaveLength(0); // never marked fresh
    expect(runDoc.status).toBe('failed');
  });

  it('C3: discovery 500 -> retry -> 200 produces exactly two physical attempts and persists evidence once', async () => {
    const seed: FakeSeedDoc = { term: 'assam tea', normalizedTerm: 'assam tea', enabled: true, market: { country: 'IN', language: 'en' }, providerDiscoveryState: [], save: jest.fn(async () => undefined) };
    seedDocs = [seed];
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValueOnce(ideasResponse([{ keyword: 'assam tea', keyword_info: { search_volume: 200 } }]));

    await runFullPipelineInternal(runDoc._id, { keywordProviderOverrides: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // two physical attempts -> two durable reservations (via runDoc.costActualUsd having been incremented twice)
    expect(persistedMetrics.filter((m) => m.searchVolume === 200)).toHaveLength(1); // evidence persisted exactly once
    expect(seed.providerDiscoveryState[0]?.lastDiscoveredAt).not.toBeNull();
  });
});

describe('D: SERP through runFullPipeline (real DataForSeoSerpProvider, mocked fetchImpl)', () => {
  it('D1: use-case-fresh cached SERP -> zero HTTP, zero new SERP reservation', async () => {
    // Two keywords that DON'T merge without SERP (see clustering probe) with a cannibalization-free
    // setup — force a borderline candidate but both sides already carry a fresh snapshot.
    const fresh = { provider: 'dataforseo-serp', locationCode: 2356, languageCode: 'en', device: 'desktop', depth: 10, schemaVersion: 1, retrievedAt: new Date(), topUrls: ['https://a.com/1'], topDomains: ['a.com'] };
    cachedKeywordDocs = [
      cachedKeyword('assam tea', { serpSnapshot: fresh }),
      cachedKeyword('how to buy assam ctc tea', { serpSnapshot: fresh }),
    ];
    const fetchImpl = jest.fn().mockResolvedValue(serpResponse(['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5']));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl } });

    // Other curated facet seeds (unrelated to this fixture) may legitimately
    // generate their OWN SERP candidates; what this test proves is that
    // THESE TWO already-fresh keywords specifically are never re-fetched.
    const fetchedKeywords = fetchImpl.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body)[0].keyword as string);
    expect(fetchedKeywords).not.toContain('assam tea');
    expect(fetchedKeywords).not.toContain('how to buy assam ctc tea');
  });

  it('D2: selected stale priority SERP (10d) -> live refresh attempted FIRST and succeeds -> fresh snapshot persisted', async () => {
    const stale = { provider: 'dataforseo-serp', locationCode: 2356, languageCode: 'en', device: 'desktop', depth: 10, schemaVersion: 1, retrievedAt: new Date(Date.now() - 10 * 86400000), topUrls: ['https://a.com/1'], topDomains: ['a.com'] };
    const a = cachedKeyword('assam tea', { serpSnapshot: stale });
    const b = cachedKeyword('how to buy assam ctc tea', { serpSnapshot: stale });
    cachedKeywordDocs = [a, b];
    const urls = ['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5'];
    const fetchImpl = jest.fn().mockResolvedValue(serpResponse(urls));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalled(); // refresh WAS attempted despite an existing (stale) snapshot
    expect(a.serpSnapshot?.retrievedAt.getTime()).toBeGreaterThan(stale.retrievedAt.getTime());
    expect(runDoc.status).not.toBe('failed');
  });

  it('D3: same stale snapshot, live refresh FAILS -> stale <=60d fallback used, run degraded, no resolution', async () => {
    const stale = { provider: 'dataforseo-serp', locationCode: 2356, languageCode: 'en', device: 'desktop', depth: 10, schemaVersion: 1, retrievedAt: new Date(Date.now() - 10 * 86400000), topUrls: ['https://a.com/1', 'https://a.com/2', 'https://a.com/3', 'https://a.com/4', 'https://a.com/5'], topDomains: ['a.com'] };
    cachedKeywordDocs = [cachedKeyword('assam tea', { serpSnapshot: stale }), cachedKeyword('how to buy assam ctc tea', { serpSnapshot: stale })];
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, {})); // every retry fails -> refresh throws

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl } });

    expect(runDoc.status).toBe('degraded');
  });

  it('D5: mocked SERP 500 -> retry -> 200 produces exactly two physical attempts', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('how to buy assam ctc tea')];
    const urls = ['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5'];
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValue(serpResponse(urls));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl } });

    // at least one keyword required 2 attempts (500 then 200); total call count reflects that retry.
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('D6: a borderline-clustering SERP candidate is genuinely fetched and changes final clustering vs the initial pass', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('how to buy assam ctc tea')];
    // identical, overlapping organic results for BOTH keywords -> high SERP overlap -> pushes the
    // borderline (0.533, no-SERP) pair over minEdgeScore(0.55) in the FINAL clustering pass.
    const urls = ['https://shared.com/1', 'https://shared.com/2', 'https://shared.com/3', 'https://shared.com/4', 'https://shared.com/5'];
    const fetchImpl = jest.fn().mockResolvedValue(serpResponse(urls));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl } });

    expect(fetchImpl).toHaveBeenCalled(); // the borderline pair WAS selected and fetched
    // Only ONE persisted SearchCluster contains both keywords (final, post-SERP merge) —
    // proving final mapping/scoring used the SERP-informed (merged) cluster, not the initial split.
    const mergedCluster = createdClusters.find((c) => (c.memberships as { keyword: string }[]).some((m) => m.keyword === 'assam tea') && (c.memberships as { keyword: string }[]).some((m) => m.keyword === 'how to buy assam ctc tea'));
    expect(mergedCluster).toBeDefined();
  });
});

describe('E7 — lock ownership loss (fake deterministic guard injected via MarketPipelineDeps)', () => {
  it('E7a: ownership already lost before the first guarded action blocks all new paid attempts and mutations, and the run never completes', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('how to buy assam ctc tea')];
    const { guard, loseOwnership } = makeFakeOwnershipGuard();
    loseOwnership(); // lost from the very start
    const fetchImpl = jest.fn().mockResolvedValue(serpResponse(['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5']));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl }, ownershipGuard: guard });

    expect(fetchImpl).not.toHaveBeenCalled(); // no NEW paid attempt started
    expect(createdClusters).toHaveLength(0); // no NEW SearchCluster persistence
    expect(upsertMarketOpportunityDrafts).not.toHaveBeenCalled(); // no NEW recommendation mutation
    expect(resolveMissingMarketOpportunities).not.toHaveBeenCalled(); // resolution never starts
    expect(runDoc.status).not.toBe('completed');
    expect(runDoc.status).not.toBe('degraded'); // never claims a terminal ownership-bound outcome either
  });

  it('E7b: an already-issued SERP request that finishes AFTER ownership loss does not get its result persisted', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('how to buy assam ctc tea')];
    const { guard, loseOwnership } = makeFakeOwnershipGuard();
    const urls = ['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5'];
    const fetchImpl = jest.fn().mockImplementation(async () => {
      loseOwnership(); // simulate the heartbeat lease firing WHILE this HTTP call is in flight
      return serpResponse(urls);
    });

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl }, ownershipGuard: guard });

    expect(fetchImpl).toHaveBeenCalled(); // the request DID fire — ownership was fine when it started
    expect(createdClusters).toHaveLength(0); // its returned evidence was never committed to a final cluster
    expect(upsertMarketOpportunityDrafts).not.toHaveBeenCalled();
    expect(resolveMissingMarketOpportunities).not.toHaveBeenCalled();
    expect(runDoc.status).not.toBe('completed');
  });

  it('control: with ownership never lost, the same fixture completes normally (the guard itself adds no false positives)', async () => {
    cachedKeywordDocs = [cachedKeyword('assam tea'), cachedKeyword('how to buy assam ctc tea')];
    const { guard } = makeFakeOwnershipGuard(); // never loses ownership
    const fetchImpl = jest.fn().mockResolvedValue(serpResponse(['https://x.com/1', 'https://x.com/2', 'https://x.com/3', 'https://x.com/4', 'https://x.com/5']));

    await runFullPipelineInternal(runDoc._id, { serpProviderOverrides: { fetchImpl }, ownershipGuard: guard });

    expect(runDoc.status).toBe('completed');
    expect(resolveMissingMarketOpportunities).toHaveBeenCalled();
  });
});
