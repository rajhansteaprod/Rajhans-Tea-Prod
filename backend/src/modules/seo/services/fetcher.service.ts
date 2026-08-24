import { seoConfig } from '../seo.config';
import { RedirectHop } from '../seo.types';
import { logger } from '../../../utils/logger';

export interface FetchResult {
  requestedUrl: string;
  redirectChain: RedirectHop[];
  finalUrl: string;
  finalStatus: number | null;
  html: string | null; // only populated for a final 200 text/html response
  error: string | null;
  /** True when the failure looks temporary (network/timeout/5xx) — NOT an SEO defect. */
  transient: boolean;
}

interface OneShot {
  status: number;
  location: string | null;
  contentType: string;
  body: string | null;
  transientError: string | null; // set when the request failed transiently
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A single HTTP request with manual redirect handling + timeout. No retries here. */
async function oneShot(url: string, wantBody: boolean): Promise<OneShot> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(seoConfig.requestTimeoutMs),
      headers: { 'User-Agent': seoConfig.userAgent, Accept: 'text/html,application/xml' },
    });
    const contentType = res.headers.get('content-type') || '';
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = isRedirect ? res.headers.get('location') : null;
    // Read the body only for a terminal 200 HTML/XML response we care about.
    const body =
      wantBody && !isRedirect && res.status === 200 && /(text\/html|xml)/i.test(contentType)
        ? await res.text()
        : null;
    // A 5xx is treated as transient (server hiccup), not a stable SEO issue.
    const transientError = res.status >= 500 ? `HTTP ${res.status}` : null;
    return { status: res.status, location, contentType, body, transientError };
  } catch (err) {
    // Network error / DNS / TLS / timeout (AbortError) — all transient.
    const name = err instanceof Error ? err.name : 'FetchError';
    return { status: 0, location: null, contentType: '', body: null, transientError: name };
  }
}

/** oneShot + exponential-backoff retry, but only for transient failures. */
async function oneShotWithRetry(url: string, wantBody: boolean): Promise<OneShot> {
  let last: OneShot | null = null;
  for (let attempt = 0; attempt <= seoConfig.maxRetries; attempt++) {
    last = await oneShot(url, wantBody);
    if (!last.transientError) return last;
    if (attempt < seoConfig.maxRetries) {
      const delay = seoConfig.retryBaseDelayMs * Math.pow(2, attempt);
      logger.warn({ url, attempt, err: last.transientError }, 'SEO fetch transient failure, retrying');
      await sleep(delay);
    }
  }
  return last as OneShot;
}

/**
 * Fetch a URL, following redirects manually so the full chain is captured. The
 * final response's HTML is returned only when it is a 200 text/html page.
 */
export async function fetchUrl(requestedUrl: string): Promise<FetchResult> {
  const redirectChain: RedirectHop[] = [];
  let current = requestedUrl;

  for (let hop = 0; hop <= seoConfig.maxRedirectHops; hop++) {
    const isLastAllowedHop = hop === seoConfig.maxRedirectHops;
    const res = await oneShotWithRetry(current, /* wantBody */ true);

    if (res.transientError) {
      return {
        requestedUrl,
        redirectChain,
        finalUrl: current,
        finalStatus: res.status || null,
        html: null,
        error: res.transientError,
        transient: true,
      };
    }

    const isRedirect = res.status >= 300 && res.status < 400 && res.location;
    if (!isRedirect) {
      return {
        requestedUrl,
        redirectChain,
        finalUrl: current,
        finalStatus: res.status,
        html: res.body,
        error: null,
        transient: false,
      };
    }

    // Record the hop and follow it (unless we've hit the cap).
    redirectChain.push({ url: current, status: res.status });
    const next = new URL(res.location as string, current).toString();
    if (isLastAllowedHop) {
      return {
        requestedUrl,
        redirectChain,
        finalUrl: next,
        finalStatus: res.status,
        html: null,
        error: `Exceeded ${seoConfig.maxRedirectHops} redirect hops`,
        transient: false, // a redirect loop/too-long chain is a real (stable) issue
      };
    }
    current = next;
    if (seoConfig.perRequestDelayMs) await sleep(seoConfig.perRequestDelayMs);
  }

  // Unreachable, but satisfies the type checker.
  return {
    requestedUrl,
    redirectChain,
    finalUrl: current,
    finalStatus: null,
    html: null,
    error: 'Redirect resolution failed',
    transient: false,
  };
}

/** Lightweight GET returning the raw body (used for sitemap.xml / robots.txt). */
export async function fetchRaw(url: string): Promise<{ status: number; body: string | null }> {
  const res = await oneShotWithRetry(url, /* wantBody */ true);
  // fetchRaw callers want the body even if content-type sniffing skipped it above.
  if (res.status === 200 && res.body === null && !res.transientError) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(seoConfig.requestTimeoutMs),
        headers: { 'User-Agent': seoConfig.userAgent },
      });
      return { status: r.status, body: await r.text() };
    } catch {
      return { status: res.status, body: null };
    }
  }
  return { status: res.status, body: res.body };
}
