import { normalizeUrl } from '../../seo.util';

/**
 * SERP-specific URL/domain normalization for arbitrary (competitor) URLs —
 * deliberately NOT the Rajhans canonical resolver (`gsc.join.ts`'s
 * `resolveGscUrl`), which encodes this site's own legacy-slug/redirect
 * knowledge and would misclassify external URLs. `normalizeUrl()` itself
 * (lowercase host, drop fragment, strip default ports, preserve path/query
 * exactly) is generic and safe to reuse for any URL, including competitors'.
 */

/** http/https only; returns null for anything else (mailto:, javascript:, malformed). */
export function normalizeSerpUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return normalizeUrl(raw);
}

export function normalizeSerpDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}
