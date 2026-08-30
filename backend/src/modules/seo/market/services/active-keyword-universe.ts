import { Market } from '../market.types';
import { RelevanceTaxonomy, classifyKeyword } from '../relevance.taxonomy';
import { normalizeKeyword } from './keyword-normalize';
import { SearchKeyword, ISearchKeywordDoc } from '../models/search-keyword.model';
import { SeedDraft } from './seed.engine';
import { marketConfig } from '../market.config';

/**
 * Active keyword universe (4b.7, FROZEN plan v3). Split into an explicit
 * side-effecting identity boundary (`ensureKeywordIdentities`) and a pure,
 * deterministic filter (`buildActiveKeywordUniverse`) so "building the
 * universe" can never hide a DB write.
 *
 * Current-run hard-negative/relevance verdicts are ALWAYS recomputed via
 * `classifyKeyword()` against the run's one enriched taxonomy instance —
 * never read from a persisted (possibly stale) `SearchKeyword.hardNegative`/
 * `businessRelevance` field. Persisted fields are latest-known descriptive
 * state only, never the live eligibility authority.
 */

export type ActiveKeywordOrigin = 'seed' | 'carry-forward' | 'discovery' | 'cache';
export interface ActiveKeyword {
  keywordId: string;
  keyword: string;
  normalizedKeyword: string;
  origin: ActiveKeywordOrigin;
}
export type MemberCoverageStatus = 'participated' | 'explicitly-ineligible' | 'unresolved';

/**
 * The ONLY function in this module that touches the database. Upserts a
 * `SearchKeyword` identity (by the existing unique normalizedKeyword+market
 * index) for every current seed term, every current discovery result, and
 * every carry-forward member keyword (so even a legacy recommendation whose
 * keyword never got a `SearchKeyword` row can still receive a current-run
 * verdict). Returns identities keyed by normalizedKeyword.
 */
export async function ensureKeywordIdentities(input: {
  seeds: SeedDraft[];
  discoveryKeywords: string[];
  carryForwardKeywords: string[];
  market: Market;
}): Promise<Map<string, ISearchKeywordDoc>> {
  const byNorm = new Map<string, string>(); // normalizedKeyword -> representative surface form
  for (const s of input.seeds) if (s.normalizedTerm) byNorm.set(s.normalizedTerm, s.term);
  for (const raw of input.discoveryKeywords) {
    const nk = normalizeKeyword(raw);
    if (nk && !byNorm.has(nk)) byNorm.set(nk, raw);
  }
  for (const raw of input.carryForwardKeywords) {
    const nk = normalizeKeyword(raw);
    if (nk && !byNorm.has(nk)) byNorm.set(nk, raw);
  }

  const identityMap = new Map<string, ISearchKeywordDoc>();
  for (const [nk, term] of byNorm) {
    const doc = await SearchKeyword.findOneAndUpdate(
      { normalizedKeyword: nk, 'market.country': input.market.country, 'market.language': input.market.language },
      { $setOnInsert: { keyword: term, normalizedKeyword: nk, market: input.market, variants: [term], sources: [], discoveredAt: new Date() } },
      { upsert: true, new: true },
    ).exec();
    identityMap.set(nk, doc);
  }
  return identityMap;
}

function currentVerdict(keyword: string, taxonomy: RelevanceTaxonomy): { hardNegative: boolean; lowRelevance: boolean } {
  const c = classifyKeyword(keyword, taxonomy);
  return { hardNegative: c.hardNegative, lowRelevance: c.businessRelevance.band === 'low' };
}

export interface BuildActiveKeywordUniverseInput {
  seeds: SeedDraft[];
  discoveryKeywords: string[];
  cachedKeywords: ISearchKeywordDoc[];
  carryForwardKeywords: string[];
  keywordIdentityMap: Map<string, ISearchKeywordDoc>;
  taxonomy: RelevanceTaxonomy;
  now: Date;
}
export interface BuildActiveKeywordUniverseResult {
  active: ActiveKeyword[];
  carryForwardVerdicts: Map<string, MemberCoverageStatus>; // normalizedKeyword -> verdict
}

/**
 * Pure, synchronous, deterministic. Precedence (first writer wins, by
 * normalizedKeyword): seeds -> carry-forward -> discovery -> cache.
 *
 * - Seeds: unconditional except current-run hardNegative.
 * - Carry-forward: identity must already exist (via ensureKeywordIdentities);
 *   currently hardNegative/low-relevance -> 'explicitly-ineligible', excluded
 *   from clustering; otherwise 'participated', admitted, BYPASSING the 90d
 *   recency window (age never excludes a carry-forward member).
 * - Discovery: current-run hardNegative/low-relevance excludes — demand
 *   (volume) is never an admission override.
 * - Cache: same relevance gate, PLUS bounded recency (discoveredAt or
 *   lastCheckedAt within `keywordStaleMaxDays`, reusing the existing
 *   config boundary rather than inventing a new one).
 */
export function buildActiveKeywordUniverse(input: BuildActiveKeywordUniverseInput): BuildActiveKeywordUniverseResult {
  const recencyMs = marketConfig.orchestrator.keywordStaleMaxDays * 24 * 60 * 60 * 1000;
  const active = new Map<string, ActiveKeyword>();
  const carryForwardVerdicts = new Map<string, MemberCoverageStatus>();

  const admit = (nk: string, origin: ActiveKeywordOrigin): void => {
    if (active.has(nk)) return;
    const doc = input.keywordIdentityMap.get(nk);
    if (!doc) return; // identity must already be ensured — never synthesized here
    active.set(nk, { keywordId: String(doc._id), keyword: doc.keyword, normalizedKeyword: nk, origin });
  };

  // 1) seeds
  for (const s of input.seeds) {
    const doc = input.keywordIdentityMap.get(s.normalizedTerm);
    if (!doc) continue;
    const { hardNegative } = currentVerdict(doc.keyword, input.taxonomy);
    if (hardNegative) continue;
    admit(s.normalizedTerm, 'seed');
  }

  // 2) carry-forward
  for (const nk of new Set(input.carryForwardKeywords.map(normalizeKeyword).filter(Boolean))) {
    const doc = input.keywordIdentityMap.get(nk);
    if (!doc) {
      carryForwardVerdicts.set(nk, 'unresolved');
      continue;
    }
    const { hardNegative, lowRelevance } = currentVerdict(doc.keyword, input.taxonomy);
    if (hardNegative || lowRelevance) {
      carryForwardVerdicts.set(nk, 'explicitly-ineligible');
      continue;
    }
    admit(nk, 'carry-forward');
    carryForwardVerdicts.set(nk, 'participated');
  }

  // 3) current discovery — relevance gate, no age requirement, no demand override
  for (const raw of input.discoveryKeywords) {
    const nk = normalizeKeyword(raw);
    if (!nk || active.has(nk)) continue;
    const doc = input.keywordIdentityMap.get(nk);
    if (!doc) continue;
    const { hardNegative, lowRelevance } = currentVerdict(doc.keyword, input.taxonomy);
    if (hardNegative || lowRelevance) continue;
    admit(nk, 'discovery');
  }

  // 4) recent cache — relevance gate + bounded recency
  for (const doc of input.cachedKeywords) {
    const nk = doc.normalizedKeyword;
    if (active.has(nk)) continue;
    const { hardNegative, lowRelevance } = currentVerdict(doc.keyword, input.taxonomy);
    if (hardNegative || lowRelevance) continue;
    const discoveredRecent = doc.discoveredAt && input.now.getTime() - doc.discoveredAt.getTime() <= recencyMs;
    const checkedRecent = doc.lastCheckedAt && input.now.getTime() - doc.lastCheckedAt.getTime() <= recencyMs;
    if (!discoveredRecent && !checkedRecent) continue;
    admit(nk, 'cache');
  }

  return { active: [...active.values()], carryForwardVerdicts };
}
