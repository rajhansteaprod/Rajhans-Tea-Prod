import { CostEstimate, Market, ProviderOp, SerpProvider, SerpResult } from '../../market.types';
import { dataForSeoConfig } from './dataforseo.config';
import { DATAFORSEO_SERP_PRICING, estimateDataForSeoSerpCost } from './dataforseo-serp-pricing';
import { RunBudget } from './run-budget';
import { postDataForSeoRequest } from './dataforseo.client';
import { mapSerpResponse, DataForSeoSerpResultWrapper } from './dataforseo-serp.mapper';
import { sanitizeDataForSeoError } from './dataforseo.errors';
import { DataForSeoTaskResponse } from './dataforseo.types';
import { CostGateRefusedError, NoActiveRunBudgetError } from './dataforseo.provider';

export interface DataForSeoSerpProviderOverrides {
  /** Injected for tests — never the real network in unit tests. */
  fetchImpl?: typeof fetch;
}

/**
 * First SerpProvider adapter (DataForSEO). Ships registered-but-unconfigured
 * until credentials are set, same as the keyword-demand provider. Depth is
 * LOCKED to 10 (the only priced/supported configuration in 4b.5) — there is
 * no caller-controlled depth parameter; `getSerp()` always requests exactly
 * `DATAFORSEO_SERP_PRICING.supportedDepth`, so an unsupported depth simply
 * cannot be requested through this class.
 */
export class DataForSeoSerpProvider implements SerpProvider {
  readonly id = 'dataforseo-serp';
  readonly kind = 'serp' as const;
  private activeBudget: RunBudget | null = null;

  constructor(private readonly overrides: DataForSeoSerpProviderOverrides = {}) {}

  isConfigured(): boolean {
    return dataForSeoConfig.isConfigured();
  }

  estimateCost(op: ProviderOp): CostEstimate {
    return estimateDataForSeoSerpCost(op);
  }

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

  /** POST /v3/serp/google/organic/live/advanced — India/English/desktop/depth-10 only. */
  async getSerp(keyword: string, market: Market): Promise<SerpResult> {
    if (!this.isConfigured()) throw new Error('dataforseo: not configured');

    const depth = DATAFORSEO_SERP_PRICING.supportedDepth;
    const op: ProviderOp = { capability: 'serp', op: 'getSerp', units: depth };
    const description = `getSerp("${keyword}")`;

    try {
      const raw = await postDataForSeoRequest<DataForSeoTaskResponse<DataForSeoSerpResultWrapper>>(
        '/v3/serp/google/organic/live/advanced',
        [
          {
            keyword,
            location_code: dataForSeoConfig.defaultLocationCode,
            language_code: market.language || dataForSeoConfig.defaultLanguageCode,
            device: 'desktop',
            depth,
          },
        ],
        {
          fetchImpl: this.overrides.fetchImpl,
          onBeforeAttempt: (attempt) => this.reserveAttemptOrThrow(op, description, attempt),
        },
      );
      return mapSerpResponse(raw, keyword, new Date().toISOString());
    } catch (e) {
      if (e instanceof CostGateRefusedError || e instanceof NoActiveRunBudgetError) throw e;
      throw new Error(sanitizeDataForSeoError(e));
    }
  }
}
