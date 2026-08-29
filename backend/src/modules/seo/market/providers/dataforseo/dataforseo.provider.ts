import { CostEstimate, DiscoverKeywordsOptions, KeywordDemandProvider, KeywordDemandResult, KeywordMetrics, Market, ProviderOp } from '../../market.types';
import { dataForSeoConfig } from './dataforseo.config';
import { estimateDataForSeoCost } from './dataforseo.pricing';
import { RunBudget } from './run-budget';
import { postDataForSeoRequest } from './dataforseo.client';
import { chunk, mapKeywordIdeasResponse, mapSearchVolumeResponse } from './dataforseo.mapper';
import { sanitizeDataForSeoError } from './dataforseo.errors';
import { DataForSeoKeywordIdeaItem, DataForSeoKeywordIdeasTaskPayload, DataForSeoSearchVolumeItem, DataForSeoTaskResponse } from './dataforseo.types';

export class NoActiveRunBudgetError extends Error {
  constructor(op: string) {
    super(`dataforseo: no active RunBudget — call beginRun() with an approved budget before ${op}`);
    this.name = 'NoActiveRunBudgetError';
  }
}
export class CostGateRefusedError extends Error {
  constructor(public reason: string) {
    super(`dataforseo request refused by cost gate: ${reason}`);
    this.name = 'CostGateRefusedError';
  }
}

export interface DataForSeoProviderOverrides {
  /** Injected for tests — never the real network in unit tests. */
  fetchImpl?: typeof fetch;
}

/**
 * First KeywordDemandProvider adapter (DataForSEO). Ships registered-but-
 * unconfigured until DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD are both set
 * (refinement 6). Every capability call requires an explicit, pre-approved
 * RunBudget (requirement 4) — the gate lives inside discoverKeywords/getMetrics
 * themselves, so calling this class directly cannot bypass it. Reserves budget
 * per PHYSICAL HTTP attempt (including retries), never just once per logical call.
 */
export class DataForSeoProvider implements KeywordDemandProvider {
  readonly id = 'dataforseo';
  readonly kind = 'keyword-demand' as const;
  private activeBudget: RunBudget | null = null;

  constructor(private readonly overrides: DataForSeoProviderOverrides = {}) {}

  isConfigured(): boolean {
    return dataForSeoConfig.isConfigured();
  }

  estimateCost(op: ProviderOp): CostEstimate {
    return estimateDataForSeoCost(op);
  }

  /** Must be called with an approved RunBudget before any capability method. */
  beginRun(budget: RunBudget): void {
    this.activeBudget = budget;
  }
  endRun(): void {
    this.activeBudget = null;
  }

  private requireBudget(op: string): RunBudget {
    if (!this.activeBudget) throw new NoActiveRunBudgetError(op);
    return this.activeBudget;
  }

  private reserveAttemptOrThrow(op: ProviderOp, description: string, attempt: number): void {
    const budget = this.requireBudget(description);
    const estimate = this.estimateCost(op);
    const label = attempt === 0 ? description : `${description} (retry attempt ${attempt})`;
    const reservation = budget.reserve(estimate, label);
    if (!reservation.allowed) throw new CostGateRefusedError(reservation.reason);
  }

  /**
   * Discovery via POST /v3/dataforseo_labs/google/keyword_ideas/live.
   *
   * `seeds` is BATCHED into provider-sized tasks (up to `maxSeedsPerTask`, e.g.
   * 12 seeds → ONE task) — never one request per seed when the provider
   * supports batching. Reuses the metrics EMBEDDED in the response
   * (KeywordDemandResult.inlineMetrics) — does NOT automatically fire a second
   * paid getMetrics() call.
   *
   * Cost is estimated using the REQUESTED result `limit` (conservative — we
   * cannot know the actual returned count before paying), and every physical
   * HTTP attempt (including retries and any extra offset page) is separately
   * reserved against the run's cumulative budget.
   */
  async discoverKeywords(seeds: string[], market: Market, opts: DiscoverKeywordsOptions = {}): Promise<KeywordDemandResult[]> {
    if (!this.isConfigured()) throw new Error('dataforseo: not configured');
    if (seeds.length === 0) return [];

    const limit = Math.min(opts.limit ?? dataForSeoConfig.defaultResultLimit, dataForSeoConfig.maxResultLimit);
    const seedBatches = chunk(seeds, dataForSeoConfig.maxSeedsPerTask);
    const results: KeywordDemandResult[] = [];

    for (const batch of seedBatches) {
      let offset = 0;
      for (let page = 0; page < dataForSeoConfig.maxPagesPerCall; page++) {
        const op: ProviderOp = { capability: 'keyword-demand', op: 'discoverKeywords', units: limit };
        const description = `discoverKeywords(${batch.length} seeds) page ${page}`;

        const payload: DataForSeoKeywordIdeasTaskPayload = {
          keywords: batch,
          location_code: dataForSeoConfig.defaultLocationCode,
          language_code: market.language || dataForSeoConfig.defaultLanguageCode,
          limit,
          offset,
          include_serp_info: dataForSeoConfig.includeSerpInfo,
          include_clickstream_data: dataForSeoConfig.includeClickstreamData,
        };

        let raw: DataForSeoTaskResponse<DataForSeoKeywordIdeaItem>;
        try {
          raw = await postDataForSeoRequest<DataForSeoTaskResponse<DataForSeoKeywordIdeaItem>>(
            '/v3/dataforseo_labs/google/keyword_ideas/live',
            [payload],
            {
              fetchImpl: this.overrides.fetchImpl,
              onBeforeAttempt: (attempt) => this.reserveAttemptOrThrow(op, description, attempt),
            },
          );
        } catch (e) {
          if (e instanceof CostGateRefusedError || e instanceof NoActiveRunBudgetError) throw e;
          throw new Error(sanitizeDataForSeoError(e));
        }

        const { results: pageResults } = mapKeywordIdeasResponse(raw);
        results.push(...pageResults);
        if (pageResults.length < limit) break; // last page for this batch
        offset += limit;
      }
    }

    return results;
  }

  /**
   * Explicit metrics refresh via POST /v3/keywords_data/google_ads/search_volume/live.
   * Only for: seed keywords needing metrics, missing metrics, stale metrics, or an
   * explicit refresh/validation. NEVER called automatically after discoverKeywords
   * for rows that already carry inlineMetrics — callers decide which keywords to
   * pass in (e.g. via dataforseo.cache.partitionByFreshness).
   */
  async getMetrics(keywords: string[], market: Market): Promise<KeywordMetrics[]> {
    if (!this.isConfigured()) throw new Error('dataforseo: not configured');
    if (keywords.length === 0) return [];

    const op: ProviderOp = { capability: 'keyword-demand', op: 'getMetrics', units: keywords.length };
    const description = `getMetrics(${keywords.length} keywords)`;

    try {
      const raw = await postDataForSeoRequest<DataForSeoTaskResponse<DataForSeoSearchVolumeItem>>(
        '/v3/keywords_data/google_ads/search_volume/live',
        [{ keywords, location_code: dataForSeoConfig.defaultLocationCode, language_code: market.language || dataForSeoConfig.defaultLanguageCode }],
        {
          fetchImpl: this.overrides.fetchImpl,
          onBeforeAttempt: (attempt) => this.reserveAttemptOrThrow(op, description, attempt),
        },
      );
      return mapSearchVolumeResponse(raw);
    } catch (e) {
      if (e instanceof CostGateRefusedError || e instanceof NoActiveRunBudgetError) throw e;
      throw new Error(sanitizeDataForSeoError(e));
    }
  }
}
