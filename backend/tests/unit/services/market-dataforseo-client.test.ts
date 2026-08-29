import { postDataForSeoRequest } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.client';
import { DataForSeoQuotaExceededError, DataForSeoRequestError, DataForSeoTransientError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.errors';

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

describe('postDataForSeoRequest', () => {
  it('returns parsed JSON on a 200 response (no retry)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { status_code: 20000, tasks: [] }));
    const out = await postDataForSeoRequest('/v3/x', [{}], { fetchImpl, maxRetries: 2 });
    expect(out).toEqual({ status_code: 20000, tasks: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws DataForSeoQuotaExceededError on 429 without retrying', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(429, {}));
    await expect(postDataForSeoRequest('/v3/x', [{}], { fetchImpl, maxRetries: 2 })).rejects.toThrow(DataForSeoQuotaExceededError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws DataForSeoRequestError on a 4xx without retrying', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, {}));
    await expect(postDataForSeoRequest('/v3/x', [{}], { fetchImpl, maxRetries: 2 })).rejects.toThrow(DataForSeoRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx up to maxRetries then throws DataForSeoTransientError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(503, {}));
    await expect(postDataForSeoRequest('/v3/x', [{}], { fetchImpl, maxRetries: 2, timeoutMs: 500 })).rejects.toThrow(DataForSeoTransientError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  }, 10000);

  it('recovers after a transient 5xx followed by a 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse(500, {})).mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const out = await postDataForSeoRequest('/v3/x', [{}], { fetchImpl, maxRetries: 2 });
    expect(out).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends a Basic Auth header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    await postDataForSeoRequest('/v3/x', [{}], { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });
});
