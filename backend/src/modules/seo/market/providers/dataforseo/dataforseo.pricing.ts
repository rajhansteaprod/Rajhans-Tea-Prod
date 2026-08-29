import { CostEstimate, ProviderOp } from '../../market.types';

/**
 * VERSIONED, provider-specific pricing — kept separate from dataforseo.provider.ts
 * so a vendor rate-card change is a config/env edit, never a provider rewrite.
 *
 * Models DataForSEO's published task-based cost structure: a flat per-task cost
 * PLUS a per-returned-item cost. For Keyword Ideas, "items" is the REQUESTED
 * result `limit` — the conservative pre-call estimate (we don't know the actual
 * returned count until after the paid call, so we must estimate on the worst case
 * we asked for, never on an optimistic guess).
 *
 * NOTE: current defaults reflect DataForSEO Labs "all other endpoints" pricing at
 * the time this was written ($0.012/task + $0.00012/item). Confirm against
 * DataForSEO's current published rate card for your account tier before relying
 * on this for a real spend decision — override via env or bump `version` below.
 */
export interface DataForSeoPricingTable {
  version: string;
  keywordIdeasUsdPerTask: number;
  keywordIdeasUsdPerItem: number;
  searchVolumeUsdPerTask: number;
  searchVolumeUsdPerItem: number;
}

export const DATAFORSEO_PRICING: DataForSeoPricingTable = {
  version: process.env.DATAFORSEO_PRICING_VERSION || '2026-08-labs-v1',
  keywordIdeasUsdPerTask: Number(process.env.DATAFORSEO_PRICE_KEYWORD_IDEAS_PER_TASK ?? 0.012),
  keywordIdeasUsdPerItem: Number(process.env.DATAFORSEO_PRICE_KEYWORD_IDEAS_PER_ITEM ?? 0.00012),
  // Search Volume (google_ads/search_volume/live) modeled the same task+item
  // shape for consistency and future-proofing; confirm the exact current rate
  // before relying on it — this is an explicit-refresh-only path (requirement 5).
  searchVolumeUsdPerTask: Number(process.env.DATAFORSEO_PRICE_SEARCH_VOLUME_PER_TASK ?? 0.012),
  searchVolumeUsdPerItem: Number(process.env.DATAFORSEO_PRICE_SEARCH_VOLUME_PER_ITEM ?? 0.00012),
};

const round = (n: number) => Math.round(n * 1e6) / 1e6; // keep sub-cent precision for small per-item rates

/**
 * Cost estimate BEFORE any request. `op.units` carries the conservative item
 * count driving the per-item term:
 *  - discoverKeywords: the REQUESTED result limit (not an eventual actual count)
 *  - getMetrics: the number of keywords requested
 */
export function estimateDataForSeoCost(op: ProviderOp, pricing: DataForSeoPricingTable = DATAFORSEO_PRICING): CostEstimate {
  if (op.op === 'discoverKeywords') {
    const usd = round(pricing.keywordIdeasUsdPerTask + pricing.keywordIdeasUsdPerItem * op.units);
    return { usd, unknown: false, detail: `dataforseo pricing ${pricing.version}: keyword_ideas/live task + ${op.units} items (requested limit)` };
  }
  if (op.op === 'getMetrics') {
    const usd = round(pricing.searchVolumeUsdPerTask + pricing.searchVolumeUsdPerItem * op.units);
    return { usd, unknown: false, detail: `dataforseo pricing ${pricing.version}: search_volume/live task + ${op.units} keywords` };
  }
  return { usd: null, unknown: true, detail: `dataforseo pricing ${pricing.version}: unrecognized op "${op.op}"` };
}
