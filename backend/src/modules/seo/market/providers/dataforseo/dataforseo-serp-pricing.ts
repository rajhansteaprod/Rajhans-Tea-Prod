import { CostEstimate, ProviderOp } from '../../market.types';

/**
 * DataForSEO Google Organic SERP (Live Advanced) pricing — LOCKED, not a
 * task+item model. Confirmed real pricing: $0.002 per keyword/SERP for the
 * first 10 organic results (depth 10 = exactly one base SERP). 4b.5 never
 * requests any other depth, so there is no per-item scaling to model.
 *
 * Safety: an env override is honored ONLY if it is finite and >= the known
 * floor — a lower/invalid override never silently underprices a real call;
 * it fails closed as UNKNOWN cost instead (the existing cost-governor's
 * "unknown is never free" rule then applies unchanged).
 */
export const DATAFORSEO_SERP_PRICING = {
  version: '2026-serp-v1',
  supportedDepth: 10,
  minUsdPerRequest: 0.002,
};

function resolvePricePerRequestOrInvalid(): number | null {
  const raw = process.env.DATAFORSEO_PRICE_SERP_PER_REQUEST;
  if (raw === undefined || raw.trim() === '') return DATAFORSEO_SERP_PRICING.minUsdPerRequest;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < DATAFORSEO_SERP_PRICING.minUsdPerRequest) return null;
  return parsed;
}

/** Cost estimate BEFORE any request. `op.units` MUST be the supported depth (10);
 * any other value fails closed (unknown, never estimated) rather than guessed. */
export function estimateDataForSeoSerpCost(op: ProviderOp): CostEstimate {
  if (op.op !== 'getSerp') {
    return { usd: null, unknown: true, detail: `dataforseo SERP pricing ${DATAFORSEO_SERP_PRICING.version}: unrecognized op "${op.op}"` };
  }
  if (op.units !== DATAFORSEO_SERP_PRICING.supportedDepth) {
    return {
      usd: null,
      unknown: true,
      detail: `depth ${op.units} is not supported in 4b.5 — only depth ${DATAFORSEO_SERP_PRICING.supportedDepth} is priced; refusing to estimate rather than guess`,
    };
  }
  const price = resolvePricePerRequestOrInvalid();
  if (price === null) {
    return {
      usd: null,
      unknown: true,
      detail: `DATAFORSEO_PRICE_SERP_PER_REQUEST override is invalid or below the known floor $${DATAFORSEO_SERP_PRICING.minUsdPerRequest} — refusing to estimate rather than underprice`,
    };
  }
  return { usd: price, unknown: false, detail: `dataforseo SERP pricing ${DATAFORSEO_SERP_PRICING.version}: depth-10 organic live` };
}
