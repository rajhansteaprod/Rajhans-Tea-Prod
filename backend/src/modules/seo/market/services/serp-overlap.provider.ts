import { Market, SerpOverlapProvider, SerpPairEvidence, SerpProvider, SerpResult } from '../market.types';
import { normalizeKeyword } from './keyword-normalize';
import { marketConfig } from '../market.config';

/**
 * Bridges the ASYNC, paid `SerpProvider.getSerp()` to the SYNCHRONOUS
 * `SerpOverlapProvider.getPairEvidence()` contract that `clustering.engine.ts`
 * already calls (unchanged since 4b.3). All SERPs a run will need are fetched
 * up front via `fetchAll()`; `asOverlapProvider()` then returns a pure,
 * synchronous, in-memory lookup — no network call happens inside clustering.
 *
 * Cache is PER-RUN ONLY (a plain Map, discarded with the instance) — no
 * persistent TTL. Same keyword used in many pairs still costs exactly one
 * fetch; concurrent requests for the same not-yet-resolved keyword share one
 * in-flight promise. A failed fetch's in-flight entry is always cleaned up
 * (success or failure) so it can be retried later in the same run rather than
 * being permanently poisoned.
 */
const safe01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function cacheKey(normalizedKeyword: string, market: Market): string {
  return `${normalizedKeyword}|${market.country}|${market.language}|desktop|10`;
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

function computePairEvidence(a: SerpResult, b: SerpResult): SerpPairEvidence | null {
  if (a.topUrls.length < marketConfig.serp.minValidOrganicResults || b.topUrls.length < marketConfig.serp.minValidOrganicResults) {
    return null; // too few valid organic results on at least one side — UNKNOWN, not zero
  }
  const urlsA = new Set(a.topUrls);
  const urlsB = new Set(b.topUrls);
  const domainsA = new Set(a.topDomains);
  const domainsB = new Set(b.topDomains);
  const sharedUrls = [...urlsA].filter((u) => urlsB.has(u));
  const sharedDomains = [...domainsA].filter((d) => domainsB.has(d));
  const urlOverlap = safe01(sharedUrls.length / Math.min(urlsA.size, urlsB.size));
  const domainOverlap = safe01(sharedDomains.length / Math.min(domainsA.size, domainsB.size));
  const score = safe01(0.7 * urlOverlap + 0.3 * domainOverlap);
  return { score, sharedUrls, sharedDomains, reasons: [`${sharedUrls.length} shared URL(s)`, `${sharedDomains.length} shared domain(s)`] };
}

export class SerpOverlapCache {
  private readonly resolved = new Map<string, SerpResult>();
  private readonly inFlight = new Map<string, Promise<SerpResult>>();

  /** Fetch (or return cached/in-flight) one keyword's SERP. Never throws — a
   * failed fetch resolves to null so one bad keyword can't abort a batch. */
  async getOrFetch(rawKeyword: string, market: Market, provider: SerpProvider): Promise<SerpResult | null> {
    const nk = normalizeKeyword(rawKeyword);
    const key = cacheKey(nk, market);
    const cached = this.resolved.get(key);
    if (cached) return cached;

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = provider.getSerp(nk, market);
      this.inFlight.set(key, pending);
    }
    try {
      const result = await pending;
      this.resolved.set(key, result);
      return result;
    } catch {
      return null; // failed this run — not cached as a failure, so a later retry within the same run can succeed
    } finally {
      this.inFlight.delete(key); // ALWAYS clean up, success or failure
    }
  }

  /** Fetch every unique normalized keyword at most once, bounded concurrency. */
  async fetchAll(keywords: string[], market: Market, provider: SerpProvider, concurrency: number = marketConfig.serp.maxConcurrency): Promise<void> {
    const unique = [...new Set(keywords.map(normalizeKeyword))];
    await runWithConcurrency(unique, concurrency, (nk) => this.getOrFetch(nk, market, provider));
  }

  /** Pure, synchronous, in-memory lookup — the SerpOverlapProvider contract
   * clustering.engine.ts already calls. Returns null (UNKNOWN) whenever either
   * keyword hasn't been resolved this run (never fetched, or fetch failed). */
  asOverlapProvider(market: Market): SerpOverlapProvider {
    return {
      getPairEvidence: (a: string, b: string): SerpPairEvidence | null => {
        const ra = this.resolved.get(cacheKey(a, market));
        const rb = this.resolved.get(cacheKey(b, market));
        if (!ra || !rb) return null;
        return computePairEvidence(ra, rb);
      },
    };
  }
}
