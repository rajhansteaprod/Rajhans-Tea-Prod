import { DataForSeoProvider, NoActiveRunBudgetError, CostGateRefusedError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';
import { dataForSeoConfig } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.config';

const market = { country: 'IN', language: 'en' };

const SEEDS_12 = [
  'Assam tea', 'CTC tea', 'kadak chai', 'chai patti', 'strong tea', 'Darjeeling tea',
  'Nilgiri tea', 'Dooars tea', 'loose leaf tea', 'tea for milk chai', 'buy tea online', 'bulk tea',
];

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

/** Realistic Keyword Ideas shape: tasks[0].result[0].items[] — result is a
 * one-element wrapper array, not the items directly (the 4b.2 bug fixed here). */
function ideasResponse(items: { keyword: string; keyword_info?: unknown }[]) {
  return jsonResponse(200, {
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ seed_keywords: [], total_count: items.length, items }] }],
  });
}

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = 'test-login';
  process.env.DATAFORSEO_PASSWORD = 'test-password';
});
afterAll(() => {
  process.env.DATAFORSEO_LOGIN = originalLogin;
  process.env.DATAFORSEO_PASSWORD = originalPassword;
});

describe('DataForSeoProvider.isConfigured', () => {
  it('is false with no credentials', () => {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    expect(new DataForSeoProvider().isConfigured()).toBe(false);
  });

  it('is true with both credentials set', () => {
    expect(new DataForSeoProvider().isConfigured()).toBe(true);
  });
});

describe('DataForSeoProvider cost gate', () => {
  it('throws NoActiveRunBudgetError if discoverKeywords is called without beginRun', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoProvider({ fetchImpl });
    await expect(p.discoverKeywords(SEEDS_12, market)).rejects.toThrow(NoActiveRunBudgetError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws NoActiveRunBudgetError for getMetrics without beginRun', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoProvider({ fetchImpl });
    await expect(p.getMetrics(['assam tea'], market)).rejects.toThrow(NoActiveRunBudgetError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to call the network when the budget denies the reservation (fail closed)', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 9.99, approvedForManualThreshold: true });
    p.beginRun(budget);
    await expect(p.discoverKeywords(SEEDS_12, market, { limit: 200 })).rejects.toThrow(CostGateRefusedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('DataForSeoProvider seed batching', () => {
  it('sends all 12 seeds in ONE task (one HTTP call), not one call per seed', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([{ keyword: 'assam tea', keyword_info: { search_volume: 100, cpc: 0.2, competition: 0.1, competition_level: 'LOW' } }]));
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true }));

    await p.discoverKeywords(SEEDS_12, market, { limit: 200 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body[0].keywords).toEqual(SEEDS_12);
    expect(body[0].limit).toBe(200);
    expect(body[0].location_code).toBe(2356);
    expect(body[0].language_code).toBe('en');
    expect(body[0].include_serp_info).toBe(false);
    expect(body[0].include_clickstream_data).toBe(false);
  });

  it('splits seeds exceeding maxSeedsPerTask into safe provider-sized batches', async () => {
    const manySeeds = Array.from({ length: dataForSeoConfig.maxSeedsPerTask + 50 }, (_, i) => `seed ${i}`);
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([]));
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true }));

    await p.discoverKeywords(manySeeds, market, { limit: 10 });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // 2 batches: maxSeedsPerTask + remainder
    const firstBody = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body as string);
    expect(firstBody[0].keywords).toHaveLength(dataForSeoConfig.maxSeedsPerTask);
    expect(secondBody[0].keywords).toHaveLength(50);
  });

  it('does not fire a second paid getMetrics call for rows that already have inline metrics', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      ideasResponse([{ keyword: 'assam tea', keyword_info: { search_volume: 100, cpc: 0.2, competition: 0.1, competition_level: 'LOW' } }]),
    );
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true }));

    const results = await p.discoverKeywords(SEEDS_12, market, { limit: 200 });

    expect(results[0].inlineMetrics?.searchVolume).toBe(100);
    // Only the keyword_ideas endpoint was ever called — never search_volume/live.
    const calledPaths = fetchImpl.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calledPaths.every((path) => path.includes('keyword_ideas'))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('DataForSeoProvider item-limit-aware cost estimation', () => {
  it('estimates using the REQUESTED limit, not the actual returned count', () => {
    const p = new DataForSeoProvider();
    const est200 = p.estimateCost({ capability: 'keyword-demand', op: 'discoverKeywords', units: 200 });
    const est700 = p.estimateCost({ capability: 'keyword-demand', op: 'discoverKeywords', units: 700 });
    expect(est200.usd).toBeCloseTo(0.036, 6);
    expect(est700.usd).toBeCloseTo(0.096, 6);
    expect(est700.usd!).toBeGreaterThan(est200.usd!);
  });
});

describe('DataForSeoProvider retries/pagination counted cumulatively', () => {
  it('charges the budget for EVERY physical attempt, including a retried request', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {})) // transient failure -> retried
      .mockResolvedValueOnce(ideasResponse([{ keyword: 'assam tea' }]));
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    p.beginRun(budget);

    await p.discoverKeywords(SEEDS_12, market, { limit: 200 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const perAttempt = p.estimateCost({ capability: 'keyword-demand', op: 'discoverKeywords', units: 200 }).usd!;
    expect(budget.getCumulativeRunUsd()).toBeCloseTo(perAttempt * 2, 6);
  });

  it('charges the budget for each extra offset page when maxPagesPerCall > 1', async () => {
    const fullPage = Array.from({ length: 5 }, (_, i) => ({ keyword: `k${i}` }));
    const lastPage = [{ keyword: 'last' }];
    const fetchImpl = jest.fn().mockResolvedValueOnce(ideasResponse(fullPage)).mockResolvedValueOnce(ideasResponse(lastPage));
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    p.beginRun(budget);

    const originalMaxPages = dataForSeoConfig.maxPagesPerCall;
    (dataForSeoConfig as { maxPagesPerCall: number }).maxPagesPerCall = 2;
    try {
      await p.discoverKeywords(['tea'], market, { limit: 5 });
    } finally {
      (dataForSeoConfig as { maxPagesPerCall: number }).maxPagesPerCall = originalMaxPages;
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const perPage = p.estimateCost({ capability: 'keyword-demand', op: 'discoverKeywords', units: 5 }).usd!;
    expect(budget.getCumulativeRunUsd()).toBeCloseTo(perPage * 2, 6);
  });

  it('fails closed mid-batch when cumulative cost would cross the per-run cap on a later batch', async () => {
    // Each task at maxResultLimit costs ~$0.132; enough batches will cross the $2 per-run cap
    // even though each individual task is comfortably under it.
    const batchesNeeded = Math.ceil(2 / 0.132) + 2;
    const manySeeds = Array.from({ length: dataForSeoConfig.maxSeedsPerTask * batchesNeeded }, (_, i) => `seed ${i}`);
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([]));
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    p.beginRun(budget);

    await expect(p.discoverKeywords(manySeeds, market, { limit: dataForSeoConfig.maxResultLimit })).rejects.toThrow(CostGateRefusedError);
  });
});

describe('DataForSeoProvider error/degraded behavior', () => {
  it('never fabricates zero metrics on provider failure — it throws instead', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, {}));
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false }));
    await expect(p.getMetrics(['assam tea'], market)).rejects.toThrow();
  });

  it('sanitizes credentials out of any thrown error message', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error(`boom Basic ${Buffer.from('test-login:test-password').toString('base64')} tail test-login test-password`));
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false }));
    try {
      await p.getMetrics(['assam tea'], market);
      fail('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('test-login');
      expect(msg).not.toContain('test-password');
      expect(msg).toMatch(/REDACTED/);
    }
  });
});
