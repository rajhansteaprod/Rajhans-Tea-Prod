import { marketConfig } from '../market.config';
import { ISerpSnapshot } from '../models/search-keyword.model';
import { IProviderDiscoveryState } from '../models/search-seed.model';

/**
 * Freshness classification (4b.7, FROZEN design). Keyword-DISCOVERY freshness
 * (has DataForSEO been asked for NEW ideas from a seed recently?) is distinct
 * from keyword-METRIC freshness (is a keyword's demand snapshot recent?) is
 * distinct from SERP freshness (use-case-specific max age, not one global TTL).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Seed discovery freshness ──
export function isSeedDiscoveryDue(state: IProviderDiscoveryState[], provider: string, now = new Date()): boolean {
  const entry = state.find((s) => s.provider === provider);
  if (!entry || !entry.lastDiscoveredAt) return true;
  return now.getTime() - new Date(entry.lastDiscoveredAt).getTime() > marketConfig.orchestrator.discoveryIntervalDays * DAY_MS;
}

// ── Keyword-metric freshness ──
export type KeywordMetricFreshness = 'fresh' | 'stale-but-usable' | 'too-old' | 'unknown';

export function classifyKeywordMetricAge(capturedAt: Date | null, now = new Date()): KeywordMetricFreshness {
  if (!capturedAt) return 'unknown';
  const ageDays = (now.getTime() - new Date(capturedAt).getTime()) / DAY_MS;
  if (ageDays <= marketConfig.orchestrator.keywordFreshDays) return 'fresh';
  if (ageDays <= marketConfig.orchestrator.keywordStaleMaxDays) return 'stale-but-usable';
  return 'too-old';
}

// ── SERP freshness — use-case-specific max age, exact context match required ──
export type SerpFreshness = 'fresh' | 'stale-but-usable' | 'too-old' | 'unknown';
export type SerpUseCase = 'priority' | 'broad';

export interface SerpContext {
  provider: string;
  locationCode: number;
  languageCode: string;
  device: 'desktop' | 'mobile';
  depth: number;
}

/** A cache hit requires an EXACT match on every context dimension — never a
 * partial/assumed match (e.g. never reuse a mobile SERP for a desktop request). */
export function contextMatches(snapshot: ISerpSnapshot, requested: SerpContext): boolean {
  return (
    snapshot.provider === requested.provider &&
    snapshot.locationCode === requested.locationCode &&
    snapshot.languageCode === requested.languageCode &&
    snapshot.device === requested.device &&
    snapshot.depth === requested.depth
  );
}

export function classifySerpAge(snapshot: ISerpSnapshot | null, requested: SerpContext, useCase: SerpUseCase, now = new Date()): SerpFreshness {
  if (!snapshot) return 'unknown';
  if (!contextMatches(snapshot, requested)) return 'unknown'; // context mismatch is never a cache hit, regardless of age
  const ageDays = (now.getTime() - new Date(snapshot.retrievedAt).getTime()) / DAY_MS;
  const maxAgeForUseCase = useCase === 'priority' ? marketConfig.orchestrator.priorityMaxAgeDays : marketConfig.orchestrator.broadMaxAgeDays;
  if (ageDays <= maxAgeForUseCase) return 'fresh';
  if (ageDays <= marketConfig.orchestrator.serpStaleMaxAgeDays) return 'stale-but-usable';
  return 'too-old';
}
