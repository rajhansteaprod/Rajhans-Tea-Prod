import { DataForSeoProvider, DurableAttemptRefusedError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.provider';
import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';

const market = { country: 'IN', language: 'en' };
const SEED = ['assam tea'];

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}
function ideasResponse(items: { keyword: string }[]) {
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

function budget() {
  return new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
}

describe('DataForSeoProvider — optional beforePhysicalAttempt durable seam', () => {
  it('A: without a hook, behavior is unchanged (no hook invoked, existing RunBudget still gates)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([{ keyword: 'assam tea' }]));
    const p = new DataForSeoProvider({ fetchImpl });
    p.beginRun(budget());
    await p.discoverKeywords(SEED, market, { limit: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('B: successful first attempt calls the hook exactly once, then RunBudget, then HTTP once', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ideasResponse([{ keyword: 'assam tea' }]));
    const hook = jest.fn().mockResolvedValue(undefined);
    const p = new DataForSeoProvider({ fetchImpl, beforePhysicalAttempt: hook });
    const b = budget();
    p.beginRun(b);

    await p.discoverKeywords(SEED, market, { limit: 200 });

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toMatchObject({ provider: 'dataforseo', attemptNumber: 0 });
    expect(hook.mock.calls[0][0].estimatedCostUsd).toBeGreaterThan(0);
    expect(b.getCumulativeRunUsd()).toBeGreaterThan(0); // existing RunBudget still charged
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('C: 500 -> retry -> 200 calls the hook exactly twice, one per physical attempt, and RunBudget charges both', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValueOnce(ideasResponse([{ keyword: 'assam tea' }]));
    const hook = jest.fn().mockResolvedValue(undefined);
    const p = new DataForSeoProvider({ fetchImpl, beforePhysicalAttempt: hook });
    const b = budget();
    p.beginRun(b);

    await p.discoverKeywords(SEED, market, { limit: 200 });

    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook.mock.calls[0][0].attemptNumber).toBe(0);
    expect(hook.mock.calls[1][0].attemptNumber).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const perAttempt = p.estimateCost({ capability: 'keyword-demand', op: 'discoverKeywords', units: 200 }).usd!;
    expect(b.getCumulativeRunUsd()).toBeCloseTo(perAttempt * 2, 6);
  });

  it('D: hook rejects before the first attempt — HTTP is never called', async () => {
    const fetchImpl = jest.fn();
    const hook = jest.fn().mockRejectedValue(new DurableAttemptRefusedError('run-not-authorized'));
    const p = new DataForSeoProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());

    await expect(p.discoverKeywords(SEED, market, { limit: 200 })).rejects.toThrow(DurableAttemptRefusedError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('E: hook allows the first attempt but rejects the retry — first HTTP occurs, second does not, sanitized failure surfaces', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {}));
    const hook = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DurableAttemptRefusedError('authorization ceiling exhausted'));
    const p = new DataForSeoProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());

    await expect(p.discoverKeywords(SEED, market, { limit: 200 })).rejects.toThrow(DurableAttemptRefusedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only the first physical attempt reached the network
    expect(hook).toHaveBeenCalledTimes(2); // retry re-invoked the hook — no reuse of the prior reservation
  });

  it('a retry MUST re-invoke the hook — it cannot reuse the previous attempt reservation', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValueOnce(ideasResponse([]));
    const hook = jest.fn().mockResolvedValue(undefined);
    const p = new DataForSeoProvider({ fetchImpl, beforePhysicalAttempt: hook });
    p.beginRun(budget());
    await p.discoverKeywords(SEED, market, { limit: 200 });
    const attemptNumbers = hook.mock.calls.map((c) => c[0].attemptNumber);
    expect(attemptNumbers).toEqual([0, 1]);
  });
});
