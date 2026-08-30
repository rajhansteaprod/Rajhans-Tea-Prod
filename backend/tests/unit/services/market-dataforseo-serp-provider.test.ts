import { DataForSeoSerpProvider } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo-serp.provider';
import { NoActiveRunBudgetError, CostGateRefusedError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';
import { estimateDataForSeoSerpCost, DATAFORSEO_SERP_PRICING } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo-serp-pricing';

const market = { country: 'IN', language: 'en' };

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}
function serpResp(urls: string[]) {
  return jsonResponse(200, {
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ items: urls.map((u, i) => ({ type: 'organic', url: u, domain: new URL(u).hostname, rank_group: i + 1 })) }] }],
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

describe('DataForSeoSerpProvider.isConfigured', () => {
  it('false with no credentials, true with both', () => {
    delete process.env.DATAFORSEO_LOGIN;
    expect(new DataForSeoSerpProvider().isConfigured()).toBe(false);
    process.env.DATAFORSEO_LOGIN = 'test-login';
    expect(new DataForSeoSerpProvider().isConfigured()).toBe(true);
  });
});

describe('DataForSeoSerpProvider pricing lock', () => {
  it('estimates exactly $0.002 for the supported depth (10)', () => {
    const est = estimateDataForSeoSerpCost({ capability: 'serp', op: 'getSerp', units: 10 });
    expect(est.usd).toBe(0.002);
    expect(est.unknown).toBe(false);
  });

  it('fails closed (UNKNOWN) for any unsupported depth', () => {
    const est = estimateDataForSeoSerpCost({ capability: 'serp', op: 'getSerp', units: 20 });
    expect(est.usd).toBeNull();
    expect(est.unknown).toBe(true);
  });

  it('never allows a price override below the known floor — fails closed instead of underpricing', () => {
    process.env.DATAFORSEO_PRICE_SERP_PER_REQUEST = '0.0005';
    const est = estimateDataForSeoSerpCost({ capability: 'serp', op: 'getSerp', units: 10 });
    expect(est.unknown).toBe(true);
    expect(est.usd).toBeNull();
    delete process.env.DATAFORSEO_PRICE_SERP_PER_REQUEST;
  });

  it('accepts a valid override at or above the floor', () => {
    process.env.DATAFORSEO_PRICE_SERP_PER_REQUEST = '0.003';
    const est = estimateDataForSeoSerpCost({ capability: 'serp', op: 'getSerp', units: 10 });
    expect(est.usd).toBe(0.003);
    expect(est.unknown).toBe(false);
    delete process.env.DATAFORSEO_PRICE_SERP_PER_REQUEST;
  });

  it('the provider always requests the supported depth — no caller-controlled depth parameter exists', () => {
    expect(DATAFORSEO_SERP_PRICING.supportedDepth).toBe(10);
  });
});

describe('DataForSeoSerpProvider cost gate', () => {
  it('throws NoActiveRunBudgetError without beginRun', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoSerpProvider({ fetchImpl });
    await expect(p.getSerp('assam tea', market)).rejects.toThrow(NoActiveRunBudgetError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to call the network when the budget denies the reservation', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoSerpProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 10.5, approvedForManualThreshold: true })); // already over the $10 monthly cap
    await expect(p.getSerp('assam tea', market)).rejects.toThrow(CostGateRefusedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('DataForSeoSerpProvider request shape and mapping', () => {
  it('requests the locked endpoint/location/language/device/depth', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(serpResp(['https://a.com/', 'https://b.com/']));
    const p = new DataForSeoSerpProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true }));

    const result = await p.getSerp('assam tea', market);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/v3/serp/google/organic/live/advanced');
    const body = JSON.parse(init.body as string);
    expect(body[0]).toMatchObject({ keyword: 'assam tea', location_code: 2356, language_code: 'en', device: 'desktop', depth: 10 });
    expect(result.topUrls).toEqual(['https://a.com/', 'https://b.com/']);
  });

  it('charges the budget for every physical attempt, including a retry', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValueOnce(serpResp(['https://a.com/']));
    const p = new DataForSeoSerpProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    p.beginRun(budget);
    await p.getSerp('assam tea', market);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(budget.getCumulativeRunUsd()).toBeCloseTo(0.004, 6);
  });

  it('sanitizes credentials out of a thrown error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('boom test-login test-password'));
    const p = new DataForSeoSerpProvider({ fetchImpl });
    p.beginRun(new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false }));
    try {
      await p.getSerp('assam tea', market);
      fail('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('test-login');
      expect(msg).not.toContain('test-password');
    }
  });
});
