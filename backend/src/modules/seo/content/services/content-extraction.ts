import { FaqSignals } from '../../seo.types';
import {
  RelevanceTaxonomy,
  BASE_TAXONOMY,
  anchorTermsOf,
  containsTaxonomyTerm,
  scoreBusinessRelevance,
} from '../../market/relevance.taxonomy';
import { contentConfig } from '../content.config';
import { PageContentState, TopicCoverageEntry } from '../content.types';

/**
 * Phase 6.1 — PURE derivations over stored page-content signals.
 *
 * No database, no network, no clock, no LLM. Everything here is a function of
 * its arguments, which is what makes an analysis reproducible: the same
 * snapshot and the same demand evidence always yield the same signals.
 *
 * The hard rule this module exists to enforce: **a term's absence is only ever
 * interesting when real demand points at it**. There is no path here from
 * "phrase X does not appear on the page" to a finding. See
 * `deriveCoverageCandidates`, which is the only producer of coverage terms and
 * requires a demand signal above an impression/volume floor for every one.
 */

// ─────────────────────────────────────────────────────────────────────────────
// FAQ presence — a judgement over raw signals, kept OUT of the parser so it can
// be revised without recrawling.
// ─────────────────────────────────────────────────────────────────────────────

export interface FaqPresence {
  present: boolean;
  reasons: string[];
}

/**
 * Null when the signals were never captured (a pre-6.1 snapshot) — the caller
 * must then report missing evidence rather than "this page has no FAQ".
 *
 * A single question-shaped heading is not an FAQ; two or more is a pattern.
 * An explicit FAQ heading or FAQPage schema is decisive on its own.
 */
export function deriveFaqPresence(signals: FaqSignals | null): FaqPresence | null {
  if (!signals) return null;
  const reasons: string[] = [];
  if (signals.faqSchemaPresent) reasons.push('FAQPage/Question JSON-LD present');
  if (signals.faqHeadingPresent) reasons.push('a heading names an FAQ section');
  if (signals.questionHeadings >= 2) reasons.push(`${signals.questionHeadings} question-shaped headings`);
  return { present: reasons.length > 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading structure
// ─────────────────────────────────────────────────────────────────────────────

export interface HeadingStructure {
  /** False when the snapshot predates the Phase 6.1 extractor. */
  known: boolean;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  /** An H3 appearing before any H2 — a skipped level. */
  skipsLevel: boolean;
}

export function describeHeadingStructure(state: PageContentState): HeadingStructure {
  if (!state.captureComplete) {
    return { known: false, h1Count: state.h1.length, h2Count: 0, h3Count: 0, skipsLevel: false };
  }
  const firstH2 = state.headingOutline.findIndex((h) => h.level === 2);
  const firstH3 = state.headingOutline.findIndex((h) => h.level === 3);
  return {
    known: true,
    h1Count: state.h1.length,
    h2Count: state.h2.length,
    h3Count: state.h3.length,
    skipsLevel: firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded-query classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when a query matches a Rajhans brand/entity term. Branded queries behave
 * differently from the rest of the corpus — they rank first by default and
 * their CTR carries no information about page quality — so the detectors
 * exclude them from CTR and intent-mismatch reasoning while still counting them
 * in the page totals.
 *
 * Uses the taxonomy's own `rajhansEntity` dimension (which
 * `buildRelevanceModel()` enriches with real inventory names), so this needs no
 * separate brand list to maintain.
 */
export function isBrandedQuery(query: string, taxonomy: RelevanceTaxonomy = BASE_TAXONOMY): boolean {
  return taxonomy.core.rajhansEntity.some((t) => containsTaxonomyTerm(query, t.term));
}

// ─────────────────────────────────────────────────────────────────────────────
// Topic coverage
// ─────────────────────────────────────────────────────────────────────────────

/** A term that real demand points at, and which the taxonomy considers defining. */
export interface CoverageCandidate {
  dimension: string;
  term: string;
  weight: number;
  demandSource: 'gsc-query' | 'market-keyword';
  /** The query/keyword that supplied the demand — kept for the explanation. */
  demandTerm: string;
  demandMagnitude: number;
}

export interface CoverageDemandInput {
  /** GSC queries for this page, with their impressions. */
  queries: { query: string; impressions: number }[];
  /** Mapped market keywords, with known volume (null volume is never a floor pass). */
  marketKeywords: { keyword: string; searchVolume: number | null }[];
}

/**
 * The ONLY producer of coverage terms, and therefore the single place the
 * anti-keyword-stuffing guardrails live. A term becomes a candidate only when
 * ALL of the following hold:
 *
 *   1. It came from a REAL demand signal — a GSC query with at least
 *      `coverageMinQueryImpressions` impressions, or a market keyword with a
 *      KNOWN search volume at or above the same floor. A null/unknown volume
 *      never qualifies (UNKNOWN is not zero, and it is not evidence either).
 *   2. The taxonomy recognises it as a CORE, non-generic anchor — the exact
 *      `anchorTermsOf()` rule the whole 4b pipeline uses, which already drops
 *      the 'attribute' dimension and the generic 'tea'/'chai' terms.
 *   3. Its taxonomy weight clears `minCoverageDimensionWeight`, so weak
 *      modifiers whose absence means nothing cannot produce a finding.
 *
 * Branded queries are excluded: "rajhans tea" pointing at the brand term says
 * nothing about a page's topical coverage.
 */
export function deriveCoverageCandidates(
  demand: CoverageDemandInput,
  taxonomy: RelevanceTaxonomy = BASE_TAXONOMY,
): CoverageCandidate[] {
  const floor = contentConfig.coverageMinQueryImpressions;
  const byTerm = new Map<string, CoverageCandidate>();

  const consider = (
    phrase: string,
    magnitude: number,
    demandSource: CoverageCandidate['demandSource'],
  ): void => {
    if (isBrandedQuery(phrase, taxonomy)) return;
    // Same anchor rule as clustering and URL mapping: core dimensions only,
    // no generic entity terms.
    const anchors = anchorTermsOf(phrase, taxonomy);
    if (anchors.size === 0) return;
    for (const component of scoreBusinessRelevance(phrase, taxonomy).components) {
      if (!anchors.has(component.term)) continue;
      if (component.weight < contentConfig.minCoverageDimensionWeight) continue;
      const existing = byTerm.get(component.term);
      // Keep the strongest demand signal for a term, so the explanation cites
      // the query that actually justifies it.
      if (existing && existing.demandMagnitude >= magnitude) continue;
      byTerm.set(component.term, {
        dimension: component.dimension,
        term: component.term,
        weight: component.weight,
        demandSource,
        demandTerm: phrase,
        demandMagnitude: magnitude,
      });
    }
  };

  for (const q of demand.queries) {
    if (q.impressions < floor) continue;
    consider(q.query, q.impressions, 'gsc-query');
  }
  for (const k of demand.marketKeywords) {
    // UNKNOWN volume is not evidence of demand — never treated as passing.
    if (k.searchVolume === null || k.searchVolume < floor) continue;
    consider(k.keyword, k.searchVolume, 'market-keyword');
  }

  return [...byTerm.values()].sort(
    (a, b) => b.demandMagnitude - a.demandMagnitude || a.term.localeCompare(b.term),
  );
}

/**
 * Where — if anywhere — the page visibly addresses each candidate term.
 *
 * Matching runs against the page's own title, headings, meta description and
 * normalized body text using the taxonomy's word-boundary rule, so a term is
 * "covered" when the page genuinely says it, in any of those places. This is a
 * PRESENCE test, never a frequency one: a term mentioned once is exactly as
 * covered as a term mentioned twenty times, so nothing here can ever be read as
 * "say it more often".
 */
export function computeTopicCoverage(
  state: PageContentState,
  candidates: CoverageCandidate[],
  normalizedText: string,
): TopicCoverageEntry[] {
  const headingText = [...state.h1, ...state.h2, ...state.h3].join(' · ');

  return candidates.slice(0, contentConfig.limits.maxTopicCoverageEntries).map((c) => {
    let foundIn: TopicCoverageEntry['foundIn'] = null;
    if (state.title && containsTaxonomyTerm(state.title, c.term)) foundIn = 'title';
    else if (headingText && containsTaxonomyTerm(headingText, c.term)) foundIn = 'heading';
    else if (state.metaDescription && containsTaxonomyTerm(state.metaDescription, c.term)) foundIn = 'metaDescription';
    else if (normalizedText && containsTaxonomyTerm(normalizedText, c.term)) foundIn = 'body';

    return {
      dimension: c.dimension,
      term: c.term,
      covered: foundIn !== null,
      foundIn,
      demandSource: c.demandSource,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata length facts
// ─────────────────────────────────────────────────────────────────────────────

export interface MetadataLengthFacts {
  titleLength: number | null;
  descriptionLength: number | null;
  titleMissing: boolean;
  descriptionMissing: boolean;
}

/**
 * Lengths are read from the RENDERED values the audit observed, because that is
 * what a SERP truncates and what `PREFLIGHT_THRESHOLDS.renderedTitle*` is
 * expressed in. No storage-form conversion happens here: the known CMS
 * double-suffix issue is a separate, out-of-scope defect, and converting would
 * quietly mask it.
 */
export function describeMetadataLengths(state: PageContentState): MetadataLengthFacts {
  const title = state.title?.trim() ?? '';
  const description = state.metaDescription?.trim() ?? '';
  return {
    titleLength: state.title === null ? null : title.length,
    descriptionLength: state.metaDescription === null ? null : description.length,
    titleMissing: title.length === 0,
    descriptionMissing: description.length === 0,
  };
}
