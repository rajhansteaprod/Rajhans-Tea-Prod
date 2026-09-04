import {
  BusinessRelevanceResult,
  CommercialIntentResult,
  KeywordClassification,
  RelevanceComponent,
} from './market.types';

/**
 * Rajhans business-relevance taxonomy + scorer.
 *
 * Design rules enforced here:
 *  1. businessRelevance ≠ commercialIntent — separate outputs. Commercial terms
 *     (buy/bulk/wholesale) feed commercialIntent and only lift relevance when a
 *     real tea/product entity is present.
 *  2. Score by DIMENSION, not naive token summation. Within a dimension take the
 *     STRONGEST match; across CORE dimensions combine with diminishing returns
 *     (noisy-OR) so "assam ctc tea for kadak chai" isn't inflated by re-counting
 *     synonyms.
 *  3. Inventory entities (real product/category names) are first-class evidence.
 *  4. Competitor brands are classified, NOT hard-negated. Spam/adult/unrelated are.
 *  5. UNKNOWN ≠ 0: no evidence ⇒ low score AND confidence 'insufficient'; weak
 *     evidence ⇒ low score but confidence 'low' ('measured').
 *
 * The taxonomy is versioned and can later move to a DB-backed editable store.
 */

export interface TermWeight {
  term: string;
  weight: number;
}
export interface RelevanceTaxonomy {
  version: string;
  /** CORE dimensions — a match here makes a query materially Rajhans-relevant. */
  core: {
    rajhansEntity: TermWeight[]; // filled dynamically from inventory + a few static brand terms
    region: TermWeight[];
    productType: TermWeight[];
    consumption: TermWeight[];
  };
  /** MODIFIER dimensions — only boost when a core entity is present. */
  attribute: TermWeight[];
  /** Commercial terms — feed commercialIntent (NOT relevance directly). */
  businessChannel: string[];
  commercialModifiers: string[];
  informationalModifiers: string[];
  competitorBrands: string[]; // classified separately, not hard-negated
  hardNegatives: string[]; // spam/adult/unrelated → force relevance low
}

/** Static seed taxonomy (weights = relevance strengths, per approved direction). */
export const BASE_TAXONOMY: RelevanceTaxonomy = {
  version: '4b.1-2026-08',
  core: {
    rajhansEntity: [{ term: 'rajhans', weight: 1.0 }, { term: 'rajhans tea', weight: 1.0 }],
    region: [
      { term: 'assam', weight: 1.0 }, { term: 'darjeeling', weight: 0.95 },
      { term: 'nilgiri', weight: 0.95 }, { term: 'dooars', weight: 0.95 },
    ],
    productType: [
      { term: 'ctc', weight: 1.0 }, { term: 'loose leaf', weight: 0.9 }, { term: 'orthodox', weight: 0.85 },
      { term: 'black tea', weight: 0.8 }, { term: 'chai patti', weight: 1.0 }, { term: 'tea', weight: 0.6 },
    ],
    consumption: [
      { term: 'kadak chai', weight: 1.0 }, { term: 'milk chai', weight: 0.95 }, { term: 'chai', weight: 0.9 },
      { term: 'strong tea', weight: 0.85 }, { term: 'masala chai', weight: 0.8 },
    ],
  },
  attribute: [
    { term: 'strong', weight: 0.75 }, { term: 'full-bodied', weight: 0.7 }, { term: 'full bodied', weight: 0.7 },
    { term: 'malty', weight: 0.7 }, { term: 'aromatic', weight: 0.65 }, { term: 'smooth', weight: 0.6 },
  ],
  businessChannel: ['buy tea', 'buy tea online', 'bulk tea', 'wholesale tea', 'tea supplier', 'tea online', 'tea manufacturer'],
  commercialModifiers: ['buy', 'online', 'price', 'order', 'shop', 'bulk', 'wholesale', 'supplier', 'manufacturer', 'near me', 'cheap', 'best price', 'discount'],
  informationalModifiers: ['what is', 'how to', 'benefits', 'vs', 'meaning', 'difference', 'guide', 'recipe', 'types of'],
  competitorBrands: [], // populate later (or via config) — kept empty to avoid mislabelling
  hardNegatives: ['coffee', 'coffee beans', 'porn', 'sex', 'casino', 'betting', 'crypto', 'loan', 'viagra'],
};

/**
 * Merge inventory-derived entities (real product/category names) into a taxonomy
 * clone as first-class `rajhansEntity` evidence. Does not mutate BASE_TAXONOMY.
 */
export function buildRelevanceModel(inventoryEntities: { name: string }[] = [], base: RelevanceTaxonomy = BASE_TAXONOMY): RelevanceTaxonomy {
  const rajhansEntity = [...base.core.rajhansEntity];
  const seen = new Set(rajhansEntity.map((t) => t.term));
  for (const e of inventoryEntities) {
    const term = e.name.trim().toLowerCase();
    if (term && !seen.has(term)) { rajhansEntity.push({ term, weight: 1.0 }); seen.add(term); }
  }
  return { ...base, core: { ...base.core, rajhansEntity } };
}

// ── helpers ──
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const containsTerm = (hay: string, term: string): boolean => new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(hay);
/** Strongest matching term in a dimension (max weight), or null. */
function strongest(hay: string, terms: TermWeight[]): TermWeight | null {
  let best: TermWeight | null = null;
  for (const t of terms) if (containsTerm(hay, t.term) && (!best || t.weight > best.weight)) best = t;
  return best;
}
/** noisy-OR: 1 − Π(1−wᵢ). Saturating combination with diminishing returns. */
const noisyOr = (weights: number[]) => 1 - weights.reduce((p, w) => p * (1 - w), 1);
const band = (score: number) => (score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low') as 'high' | 'medium' | 'low';

/** Business relevance — CORE dimensions drive it; attributes only boost when core present. */
export function scoreBusinessRelevance(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): BusinessRelevanceResult {
  const k = norm(keyword);
  const components: RelevanceComponent[] = [];

  // Hard negatives short-circuit.
  const neg = taxonomy.hardNegatives.find((n) => containsTerm(k, n));
  if (neg) {
    return { score: 0.03, band: 'low', confidence: 'low', components: [], reasons: [`hard-negative: "${neg}"`] };
  }

  const coreDims: [string, TermWeight[]][] = [
    ['rajhansEntity', taxonomy.core.rajhansEntity],
    ['region', taxonomy.core.region],
    ['productType', taxonomy.core.productType],
    ['consumption', taxonomy.core.consumption],
  ];
  const coreStrengths: number[] = [];
  const inventoryTerms = new Set(taxonomy.core.rajhansEntity.map((t) => t.term));
  for (const [dim, terms] of coreDims) {
    const m = strongest(k, terms);
    if (m) {
      coreStrengths.push(m.weight);
      components.push({ dimension: dim, term: m.term, weight: m.weight, source: dim === 'rajhansEntity' && inventoryTerms.has(m.term) ? 'inventory' : 'taxonomy' });
    }
  }

  const attr = strongest(k, taxonomy.attribute);

  if (coreStrengths.length === 0) {
    // No core tea/product/region entity → not materially Rajhans-relevant.
    if (attr) {
      components.push({ dimension: 'attribute', term: attr.term, weight: attr.weight, source: 'taxonomy' });
      return { score: 0.2, band: 'low', confidence: 'low', components, reasons: ['only attribute terms matched; no core tea entity'] };
    }
    return { score: 0.05, band: 'low', confidence: 'insufficient', components, reasons: ['no Rajhans-relevant evidence found'] };
  }

  let score = noisyOr(coreStrengths); // strongest-per-dim, diminishing returns across dims
  const reasons = components.map((c) => `${c.dimension}:${c.term} (${c.weight})`);
  if (attr) {
    components.push({ dimension: 'attribute', term: attr.term, weight: attr.weight, source: 'taxonomy' });
    score = Math.min(1, score + attr.weight * 0.1); // bounded modifier boost
    reasons.push(`attribute:${attr.term} (+bounded)`);
  }
  const hasInventory = components.some((c) => c.source === 'inventory');
  const confidence = hasInventory || coreStrengths.length >= 2 ? 'high' : 'medium';
  return { score: Math.round(score * 100) / 100, band: band(score), confidence, components, reasons };
}

/** Commercial intent — INDEPENDENT of business relevance. */
export function scoreCommercialIntent(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): CommercialIntentResult {
  const k = norm(keyword);
  const signals: string[] = [];
  for (const t of taxonomy.businessChannel) if (containsTerm(k, t)) signals.push(t);
  for (const m of taxonomy.commercialModifiers) if (containsTerm(k, m)) signals.push(m);
  const informational = taxonomy.informationalModifiers.some((m) => containsTerm(k, m));

  let score = 0;
  if (signals.some((s) => taxonomy.businessChannel.includes(s))) score += 0.6;
  if (signals.some((s) => ['buy', 'order', 'price', 'shop', 'bulk', 'wholesale', 'supplier', 'manufacturer'].includes(s))) score += 0.4;
  if (signals.some((s) => ['online', 'near me', 'cheap', 'discount', 'best price'].includes(s))) score += 0.2;
  if (informational && score > 0) score *= 0.4; // "what is / benefits" dampens commercial intent
  score = Math.min(1, score);
  return { score: Math.round(score * 100) / 100, band: band(score), signals: [...new Set(signals)] };
}

// The two catch-all single-word taxonomy terms — never sufficient as an anchor on their own.
const GENERIC_ENTITY_TERMS = new Set(['tea', 'chai']);

/**
 * Word-boundary term containment against arbitrary prose, exported so consumers
 * outside 4b — Phase 6.1's page-content coverage check — decide "does this text
 * contain this taxonomy term" using the EXACT rule the relevance scorer uses.
 * Reimplementing the match would let page coverage and keyword relevance drift
 * apart on punctuation and casing.
 */
export function containsTaxonomyTerm(haystack: string, term: string): boolean {
  return containsTerm(norm(haystack), term);
}

/**
 * Specific (non-generic) core-taxonomy matches + matched businessChannel phrases.
 * Shared by 4b.3's clustering engine AND 4b.4's URL mapper/cannibalization guard —
 * a single anchor-extraction rule for the whole 4b pipeline (extracted here, not
 * duplicated, so both consumers always agree on what counts as a "specific anchor").
 */
export function anchorTermsOf(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): Set<string> {
  const anchors = new Set<string>();
  const relevance = scoreBusinessRelevance(keyword, taxonomy);
  for (const c of relevance.components) {
    if (c.dimension === 'attribute') continue;
    if (GENERIC_ENTITY_TERMS.has(c.term)) continue;
    anchors.add(c.term);
  }
  const commercial = scoreCommercialIntent(keyword, taxonomy);
  for (const s of commercial.signals) if (taxonomy.businessChannel.includes(s)) anchors.add(s);
  return anchors;
}

/**
 * commercialModifiers/informationalModifiers matches, EXCLUDING businessChannel
 * (those are anchors, not generic modifiers — see anchorTermsOf). Shared by
 * clustering.engine.ts and 4b.4's cannibalization-guard.ts.
 */
export function modifierEvidenceOf(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): Set<string> {
  const evidence = new Set<string>();
  const commercial = scoreCommercialIntent(keyword, taxonomy);
  for (const s of commercial.signals) if (!taxonomy.businessChannel.includes(s)) evidence.add(s);
  const k = norm(keyword);
  for (const m of taxonomy.informationalModifiers) if (containsTerm(k, m)) evidence.add(m);
  return evidence;
}

/** Full classification: relevance + commercial + competitor/hard-negative flags. */
export function classifyKeyword(keyword: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): KeywordClassification {
  const k = norm(keyword);
  const businessRelevance = scoreBusinessRelevance(keyword, taxonomy);
  const commercialIntent = scoreCommercialIntent(keyword, taxonomy);
  const competitor = taxonomy.competitorBrands.find((b) => containsTerm(k, b));
  const hardNeg = taxonomy.hardNegatives.find((n) => containsTerm(k, n));
  return {
    businessRelevance,
    commercialIntent,
    competitorBranded: !!competitor,
    targetingPolicy: competitor ? (taxonomy.informationalModifiers.some((m) => containsTerm(k, m)) ? 'comparison-potential' : 'review') : null,
    hardNegative: !!hardNeg,
    hardNegativeReason: hardNeg ? `matched "${hardNeg}"` : undefined,
  };
}
