import { DataForSeoProvider, NoActiveRunBudgetError, CostGateRefusedError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';
import { dataForSeoConfig } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.config';

const market = { country: 'IN', language: 'en' };

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
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
    const p = new DataForSeoProvider();
    expect(p.isConfigured()).toBe(false);
  });

  it('is true with both credentials set', () => {
    const p = new DataForSeoProvider();
    expect(p.isConfigured()).toBe(true);
  });
});

describe('DataForSeoProvider cost gate', () => {
  it('throws NoActiveRunBudgetError if discoverKeywords is called without beginRun', async () => {
    const fetchImpl = jest.fn();
    const p = new DataForSeoProvider({ fetchImpl });
    await expect(p.discoverKeywords('assam tea', market)).rejects.toThrow(NoActiveRunBudgetError);
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
    await expect(p.discoverKeywords('assam tea', market)).rejects.toThrow(CostGateRefusedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls the network once approved and within caps', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, { status_code: 20000, tasks: [{ status_code: 20000, result: [{ keyword: 'assam tea', keyword_info: { search_volume: 100, cpc: 0.2, competition: 0.1, competition_level: 'LOW' } }] }] }),
    );
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false });
    p.beginRun(budget);
    const results = await p.discoverKeywords('assam tea', market);
    expect(results[0].keyword).toBe('assam tea');
    expect(results[0].inlineMetrics?.searchVolume).toBe(100);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // single page: fewer results than pageSize
  });

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
    await expect(p.getMetrics(['assam tea'], market)).rejects.toThrow(/REDACTED/);
    try {
      await p.getMetrics(['assam tea'], market);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('test-login');
      expect(msg).not.toContain('test-password');
    }
  });

  it('tracks cumulative cost across discovery pagination pages within one RunBudget', async () => {
    const fullPage = Array.from({ length: dataForSeoConfig.pageSize }, (_, i) => ({ keyword: `k${i}`, keyword_info: null }));
    const lastPage = [{ keyword: 'last', keyword_info: null }];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status_code: 20000, tasks: [{ status_code: 20000, result: fullPage }] }))
      .mockResolvedValueOnce(jsonResponse(200, { status_code: 20000, tasks: [{ status_code: 20000, result: lastPage }] }));
    const p = new DataForSeoProvider({ fetchImpl });
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    p.beginRun(budget);
    await p.discoverKeywords('tea', market);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(budget.getCumulativeRunUsd()).toBeGreaterThan(0);
  });
});
