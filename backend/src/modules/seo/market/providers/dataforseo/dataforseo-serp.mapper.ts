import { SerpResult } from '../../market.types';
import { DataForSeoTaskResponse } from './dataforseo.types';
import { normalizeSerpDomain, normalizeSerpUrl } from '../../services/serp-url-normalize';

/**
 * Real DataForSEO SERP response shape (assumed consistent with the confirmed
 * keyword_ideas nesting bug-fixed in 4b.2): tasks[0].result[0].items[] — a
 * one-element wrapper array holding the actual organic/feature items. This
 * assumption should be verified against the live API before the first real
 * paid call, exactly as keyword_ideas's shape was verified in 4b.2.
 */
export interface DataForSeoSerpItem {
  type?: string; // 'organic' | 'featured_snippet' | 'people_also_ask' | 'local_pack' | ...
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  domain?: string;
}
export interface DataForSeoSerpResultWrapper {
  keyword?: string;
  items_count?: number;
  items?: DataForSeoSerpItem[] | null;
}

/**
 * Filters to genuinely organic items (DataForSEO's own rank order preserved —
 * no re-sort needed), normalizes + dedupes URLs/domains. Array index is NOT
 * claimed to be the literal Google rank after filtering/dedup — it is simply
 * deterministic provider order of normalized organic URLs; rank itself is not
 * consumed by the overlap algorithm, so no rank field is added to SerpResult.
 */
export function mapSerpResponse(resp: DataForSeoTaskResponse<DataForSeoSerpResultWrapper>, keyword: string, retrievedAt: string): SerpResult {
  const wrapper = resp.tasks?.[0]?.result?.[0] ?? null;
  const allItems = wrapper?.items ?? [];
  const organicItems = allItems.filter((it): it is DataForSeoSerpItem => !!it && it.type === 'organic' && typeof it.url === 'string');

  const topUrls: string[] = [];
  const seenUrls = new Set<string>();
  for (const it of organicItems) {
    const normalized = normalizeSerpUrl(it.url as string);
    if (!normalized || seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);
    topUrls.push(normalized);
  }

  const topDomains: string[] = [];
  const seenDomains = new Set<string>();
  for (const it of organicItems) {
    if (!it.domain) continue;
    const normalized = normalizeSerpDomain(it.domain);
    if (!normalized || seenDomains.has(normalized)) continue;
    seenDomains.add(normalized);
    topDomains.push(normalized);
  }

  const resultTypes = [...new Set(allItems.map((it) => it?.type).filter((t): t is string => !!t))];

  return { keyword, topUrls, topDomains, resultTypes, features: [], retrievedAt };
}
