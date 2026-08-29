import { CostEstimate, KeywordDemandProvider, KeywordDemandResult, KeywordMetrics, Market, ProviderOp } from '../../market.types';
import { dataForSeoConfig } from './dataforseo.config';
import { estimateDataForSeoCost } from './dataforseo.pricing';
import { RunBudget } from './run-budget';
import { postDataForSeoRequest } from './dataforseo.client';
import { mapKeywordIdeasResponse, mapSearchVolumeResponse } from './dataforseo.mapper';
import { sanitizeDataForSeoError } from './dataforseo.errors';
import { DataForSeoKeywordIdeaItem, DataForSeoSearchVolumeItem, DataForSeoTaskResponse } from './dataforseo.types';

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
 * themselves, so calling this class directly cannot bypass it.
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

  private reserveOrThrow(op: ProviderOp, description: string): void {
    const budget = this.requireBudget(description);
    const estimate = this.estimateCost(op);
    const reservation = budget.reserve(estimate, description);
    if (!reservation.allowed) throw new CostGateRefusedError(reservation.reason);
  }

  /**
   * Discovery via POST /v3/dataforseo_labs/google/keyword_ideas/live. Reuses the
   * metrics EMBEDDED in this same response (KeywordDemandResult.inlineMetrics) —
   * does NOT automatically fire a second paid getMetrics() call per requirement.
   */
  async discoverKeywords(seed: string, market: Market): Promise<KeywordDemandResult[]> {
    if (!this.isConfigured()) throw new Error('dataforseo: not configured');
    const pageSize = dataForSeoConfig.pageSize;
    const results: KeywordDemandResult[] = [];
    let offset = 0;

    for (let page = 0; page < dataForSeoConfig.maxPagesPerCall; page++) {
      const op: ProviderOp = { capability: 'keyword-demand', op: 'discoverKeywords', units: pageSize };
      this.reserveOrThrow(op, `discoverKeywords("${seed}") page ${page}`);

      let raw: DataForSeoTaskResponse<DataForSeoKeywordIdeaItem>;
      try {
        raw = await postDataForSeoRequest<DataForSeoTaskResponse<DataForSeoKeywordIdeaItem>>(
          '/v3/dataforseo_labs/google/keyword_ideas/live',
          [
            {
              keywords: [seed],
              location_code: dataForSeoConfig.defaultLocationCode,
              language_code: market.language || dataForSeoConfig.defaultLanguageCode,
              limit: pageSize,
              offset,
            },
          ],
          { fetchImpl: this.overrides.fetchImpl },
        );
      } catch (e) {
        throw new Error(sanitizeDataForSeoError(e));
      }

      const { results: pageResults } = mapKeywordIdeasResponse(raw);
      results.push(...pageResults);
      if (pageResults.length < pageSize) break; // last page
      offset += pageSize;
    }

    return results;
  }

  /**
   * Explicit metrics refresh via POST /v3/keywords_data/google_ads/search_volume/live.
   * Only for: seed keywords needing metrics, missing metrics, stale metrics, or an
   * explicit refresh/validation — callers decide WHICH keywords to pass in (e.g.
   * via dataforseo.cache.partitionByFreshness); this method never auto-expands.
   */
  async getMetrics(keywords: string[], market: Market): Promise<KeywordMetrics[]> {
    if (!this.isConfigured()) throw new Error('dataforseo: not configured');
    if (keywords.length === 0) return [];

    const op: ProviderOp = { capability: 'keyword-demand', op: 'getMetrics', units: keywords.length };
    this.reserveOrThrow(op, `getMetrics(${keywords.length} keywords)`);

    try {
      const raw = await postDataForSeoRequest<DataForSeoTaskResponse<DataForSeoSearchVolumeItem>>(
        '/v3/keywords_data/google_ads/search_volume/live',
        [{ keywords, location_code: dataForSeoConfig.defaultLocationCode, language_code: market.language || dataForSeoConfig.defaultLanguageCode }],
        { fetchImpl: this.overrides.fetchImpl },
      );
      return mapSearchVolumeResponse(raw);
    } catch (e) {
      throw new Error(sanitizeDataForSeoError(e));
    }
  }
}
