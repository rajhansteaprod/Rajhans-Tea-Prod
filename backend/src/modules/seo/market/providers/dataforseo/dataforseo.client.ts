import { dataForSeoConfig } from './dataforseo.config';
import { DataForSeoQuotaExceededError, DataForSeoRequestError, DataForSeoTransientError } from './dataforseo.errors';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt: number) => 250 * Math.pow(2, attempt);

export interface PostOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected for tests — never the real network in unit tests. */
  fetchImpl?: typeof fetch;
  /**
   * Called before EVERY physical HTTP attempt, including retries. Lets the
   * caller (the provider) reserve cost-governor budget per attempt — a retry is
   * a new billed call as far as the budget is concerned, so it must be
   * accounted for, not assumed free. Throwing here aborts before the network
   * call is made.
   */
  onBeforeAttempt?: (attempt: number) => void | Promise<void>;
}

/**
 * Low-level DataForSEO v3 POST — Basic Auth, timeout via AbortController, retry
 * with backoff ONLY on 5xx/timeout (never on 4xx — those are not retryable).
 */
export async function postDataForSeoRequest<T>(path: string, body: unknown[], opts: PostOptions = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('dataforseo: no fetch implementation available');
  const timeoutMs = opts.timeoutMs ?? dataForSeoConfig.timeoutMs;
  const maxRetries = opts.maxRetries ?? dataForSeoConfig.maxRetries;
  const authHeader = 'Basic ' + Buffer.from(`${dataForSeoConfig.login}:${dataForSeoConfig.password}`).toString('base64');

  let attempt = 0;
  for (;;) {
    if (opts.onBeforeAttempt) await opts.onBeforeAttempt(attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${dataForSeoConfig.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      } as RequestInit);
      clearTimeout(timer);
      if (res.status === 429) throw new DataForSeoQuotaExceededError('dataforseo: quota exceeded (429)');
      if (res.status >= 500) throw new DataForSeoTransientError(`dataforseo: server error ${res.status}`);
      if (!res.ok) throw new DataForSeoRequestError(`dataforseo: request failed with status ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const retryable = e instanceof DataForSeoTransientError || isAbort;
      if (!retryable || attempt >= maxRetries) {
        if (isAbort) throw new DataForSeoTransientError('dataforseo: request timed out');
        throw e;
      }
      await sleep(backoffMs(attempt));
      attempt++;
    }
  }
}
