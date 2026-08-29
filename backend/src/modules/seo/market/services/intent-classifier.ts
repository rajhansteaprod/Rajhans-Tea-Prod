import { Intent } from '../market.types';
import { BASE_TAXONOMY, RelevanceTaxonomy, scoreBusinessRelevance, scoreCommercialIntent } from '../relevance.taxonomy';

/**
 * Intent finalization (4b.3). Deterministic, marker-based — no embeddings.
 * Reuses 4b.1's `scoreBusinessRelevance`/`scoreCommercialIntent` for entity and
 * commercial-signal detection rather than re-parsing the taxonomy; only the small
 * how-to/comparison/informational marker split below is local (those subsets
 * aren't exposed by relevance.taxonomy.ts's return shapes).
 */
export interface KeywordIntentResult {
  intent: Intent;
  confidence: number;
  reasons: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const containsTerm = (hay: string, term: string): boolean =>
  new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(hay);

const HOW_TO_MARKERS = ['how to', 'recipe'];
const COMPARISON_MARKERS = ['vs', 'difference'];
// The remaining informationalModifiers not already claimed by how-to/comparison.
const OTHER_INFO_MARKERS = ['what is', 'meaning', 'guide', 'types of', 'benefits'];

/**
 * Returns one or more intents (multi-intent, never collapsed to a single value).
 * Always returns at least one entry — a keyword with no strong signal gets a
 * low-confidence INFORMATIONAL fallback rather than an empty array, so the
 * clustering engine's intent signal is always available for these fixtures.
 */
export function finalizeIntents(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): KeywordIntentResult[] {
  const k = norm(keyword);
  const results: KeywordIntentResult[] = [];

  const howTo = HOW_TO_MARKERS.some((m) => containsTerm(k, m));
  const comparison = COMPARISON_MARKERS.some((m) => containsTerm(k, m));
  const otherInfo = OTHER_INFO_MARKERS.some((m) => containsTerm(k, m));

  if (howTo) {
    results.push({ intent: 'HOW_TO', confidence: 0.9, reasons: ['how-to/recipe modifier matched'] });
    return results;
  }
  if (comparison) {
    results.push({ intent: 'COMPARISON', confidence: 0.9, reasons: ['comparison modifier matched'] });
    return results;
  }
  if (otherInfo) {
    results.push({ intent: 'INFORMATIONAL', confidence: 0.85, reasons: ['informational modifier matched'] });
    return results;
  }

  const commercial = scoreCommercialIntent(keyword, taxonomy);
  const relevance = scoreBusinessRelevance(keyword, taxonomy);
  const hasCoreEntity = relevance.components.some((c) => c.dimension !== 'attribute');

  if (commercial.signals.length > 0) {
    results.push({ intent: 'TRANSACTIONAL', confidence: 0.8, reasons: [`commercial modifier(s): ${commercial.signals.join(', ')}`] });
    if (hasCoreEntity) {
      results.push({ intent: 'CATEGORY', confidence: 0.4, reasons: ['core entity present alongside commercial modifier'] });
    }
    return results;
  }

  if (hasCoreEntity) {
    const isBrandOnly = relevance.components.every((c) => c.dimension === 'rajhansEntity');
    if (isBrandOnly) {
      results.push({ intent: 'NAVIGATIONAL', confidence: 0.7, reasons: ['brand/entity match only, no category qualifier'] });
    } else {
      results.push({ intent: 'CATEGORY', confidence: 0.8, reasons: ['core region/product/consumption entity matched'] });
    }
    return results;
  }

  results.push({ intent: 'INFORMATIONAL', confidence: 0.3, reasons: ['no strong signal; low-confidence fallback'] });
  return results;
}
