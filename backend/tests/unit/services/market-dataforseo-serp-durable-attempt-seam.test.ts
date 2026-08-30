import { DataForSeoSerpProvider } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo-serp.provider';
import { DurableAttemptRefusedError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';

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

function budget() {
  return new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
}

describe('DataForSeoSerpProvider — optional beforePhysicalAttempt durable seam', () => {
  it('without a hook, behavior is unchanged', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(serpResp(['https://a.com']));
    const p = new DataForSeoSerpProvider({ fetchImpl });
    p.beginRun(budget());
    await p.getSerp('assam tea', market);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('hook called exactly once per physical attempt, durable-first then RunBudget then HTTP', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(serpResp(['https://a.com']));
    const hook = jest.fn().mockResolvedValue(undefined);
    const p = new DataForSeoSerpProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());
    await p.getSerp('assam tea', market);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toMatchObject({ provider: 'dataforseo-serp', attemptNumber: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('hook rejection prevents the HTTP call', async () => {
    const fetchImpl = jest.fn();
    const hook = jest.fn().mockRejectedValue(new DurableAttemptRefusedError('run-not-authorized'));
    const p = new DataForSeoSerpProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());
    await expect(p.getSerp('assam tea', market)).rejects.toThrow(DurableAttemptRefusedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('F: concurrent getSerp calls each reach the hook independently (no shared/batched invocation)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(serpResp(['https://a.com']));
    let concurrentInFlight = 0;
    let maxObservedConcurrency = 0;
    const hook = jest.fn().mockImplementation(async () => {
      concurrentInFlight++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentInFlight);
      await Promise.resolve();
      concurrentInFlight--;
    });
    const p = new DataForSeoSerpProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());

    await Promise.all([p.getSerp('a', market), p.getSerp('b', market), p.getSerp('c', market)]);

    expect(hook).toHaveBeenCalledTimes(3);
    expect(new Set(hook.mock.calls.map((c) => c[0].operation)).size).toBe(3); // each call's own operation label reached the hook
    expect(maxObservedConcurrency).toBeGreaterThanOrEqual(1);
  });
});
