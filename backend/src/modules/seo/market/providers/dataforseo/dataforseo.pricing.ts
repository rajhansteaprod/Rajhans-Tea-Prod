import { CostEstimate, ProviderOp } from '../../market.types';

/**
 * VERSIONED, provider-specific pricing — kept separate from dataforseo.provider.ts
 * so a vendor rate-card change is a config/env edit, never a provider rewrite.
 *
 * NOTE: the default numbers below are PLACEHOLDERS. Confirm them against
 * DataForSEO's current published rate card for your account tier — via env
 * overrides or a new pricing version — BEFORE the first real paid call.
 */
export interface DataForSeoPricingTable {
  version: string;
  keywordIdeasUsdPerCall: number;
  keywordIdeasUsdPerResultUnit: number;
  searchVolumeUsdPerCall: number;
  searchVolumeUsdPerKeyword: number;
}

export const DATAFORSEO_PRICING: DataForSeoPricingTable = {
  version: process.env.DATAFORSEO_PRICING_VERSION || '2026-08-placeholder',
  keywordIdeasUsdPerCall: Number(process.env.DATAFORSEO_PRICE_KEYWORD_IDEAS_PER_CALL ?? 0.05),
  keywordIdeasUsdPerResultUnit: Number(process.env.DATAFORSEO_PRICE_KEYWORD_IDEAS_PER_RESULT ?? 0),
  searchVolumeUsdPerCall: Number(process.env.DATAFORSEO_PRICE_SEARCH_VOLUME_PER_CALL ?? 0.05),
  searchVolumeUsdPerKeyword: Number(process.env.DATAFORSEO_PRICE_SEARCH_VOLUME_PER_KEYWORD ?? 0),
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cost estimate BEFORE any request — units drive the estimate, never a flat guess. */
export function estimateDataForSeoCost(op: ProviderOp, pricing: DataForSeoPricingTable = DATAFORSEO_PRICING): CostEstimate {
  if (op.op === 'discoverKeywords') {
    const usd = round2(pricing.keywordIdeasUsdPerCall + pricing.keywordIdeasUsdPerResultUnit * op.units);
    return { usd, unknown: false, detail: `dataforseo pricing ${pricing.version}: keyword_ideas/live` };
  }
  if (op.op === 'getMetrics') {
    const usd = round2(pricing.searchVolumeUsdPerCall + pricing.searchVolumeUsdPerKeyword * op.units);
    return { usd, unknown: false, detail: `dataforseo pricing ${pricing.version}: search_volume/live` };
  }
  return { usd: null, unknown: true, detail: `dataforseo pricing ${pricing.version}: unrecognized op "${op.op}"` };
}
