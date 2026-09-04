import { seoConfig } from '../../seo.config';
import { OpportunityConfidence, OpportunityDraft, QueryPageMetric, SeoJoinFacts } from '../../gsc.types';
import { RecommendationPriority } from '../../seo.types';
import {
  analyzeCannibalization,
  analyzeHighImpressionLowCtr,
  analyzeStrikingDistance,
  confidence,
} from '../../services/gsc.analyzers';
import { opportunityPriority } from '../../services/gsc.opportunity.service';
import { recoConfig } from '../../services/recommendation.generators';
import { scoreRecommendation } from '../../services/recommendation.scoring';
import { PREFLIGHT_THRESHOLDS } from '../../services/change-execution-preflight.service';
import { TYPE_COMPATIBILITY } from '../../market/services/url-mapper';
import { Intent, PageType } from '../../market/market.types';
import { RelevanceTaxonomy } from '../../market/relevance.taxonomy';
import { contentConfig } from '../content.config';
import {
  ContentOpportunity,
  ContentOpportunityType,
  EligiblePage,
  EvidenceRef,
  MissingEvidence,
  PageContentState,
  PageExistingWork,
  PageMarketEvidence,
  PageSearchPerformance,
  TopicCoverageEntry,
} from '../content.types';
import { CoverageCandidate, describeHeadingStructure, describeMetadataLengths } from './content-extraction';

/**
 * Phase 6.1 — the opportunity detectors. PURE: no database, no network, no
 * clock, no LLM. Given the same assembled evidence they always produce the same
 * findings, which is what makes a persisted analysis reproducible.
 *
 * Three of the ten types are not implemented here at all — they are the
 * EXISTING GSC analyzers, re-run over one page's rows
 * (`analyzeHighImpressionLowCtr`, `analyzeStrikingDistance`,
 * `analyzeCannibalization`). Their thresholds, CTR curve and confidence rubric
 * are the pipeline's, not a second copy, so a page-scoped finding can never
 * disagree with the site-wide one.
 *
 * Every opportunity carries at least one EvidenceRef. A finding with no
 * supporting evidence is not emitted — there is no path here to an assertion
 * the stored data does not support.
 */

export interface DetectorInput {
  page: EligiblePage;
  /** Null when the page has no snapshot in the latest run. */
  state: PageContentState | null;
  normalizedText: string;
  searchPerformance: PageSearchPerformance;
  marketEvidence: PageMarketEvidence;
  existingWork: PageExistingWork;
  topicCoverage: TopicCoverageEntry[];
  coverageCandidates: CoverageCandidate[];
  /** This page's rows for the stored period. */
  gscRows: QueryPageMetric[];
  /** Every page's rows for the same period — cannibalization is cross-page. */
  allGscRows: QueryPageMetric[];
  gscConfigured: boolean;
  gscPeriod: { start: string; end: string } | null;
  auditRun: { runId: string | null; runAt: Date | null; stale: boolean; ageDays: number | null };
  taxonomy: RelevanceTaxonomy;
}

export interface DetectorOutput {
  opportunities: ContentOpportunity[];
  missingEvidence: MissingEvidence[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const STRENGTH_ORDER: OpportunityConfidence[] = ['low', 'medium', 'high'];

/**
 * A stale audit run means `currentState` may describe a page that has since
 * changed, so any finding derived from page state is one notch less certain.
 * Applied to state-derived detectors only: GSC findings rest on GSC rows, whose
 * freshness is tracked separately by the evidence period.
 */
function downgradeIfStale(strength: OpportunityConfidence, stale: boolean): OpportunityConfidence {
  if (!stale) return strength;
  return STRENGTH_ORDER[Math.max(0, STRENGTH_ORDER.indexOf(strength) - 1)];
}

/** Priority for a state-derived finding, from the EXISTING structural scorer. */
function statePriority(url: string, bonus = 0): RecommendationPriority {
  return scoreRecommendation([url], seoConfig.baseUrl, { bonus }).priority;
}

const snapshotEvidence = (
  input: DetectorInput,
  summary: string,
  facts: Record<string, string | number | boolean | null>,
): EvidenceRef => ({
  source: 'snapshot',
  collection: 'SeoPageSnapshot',
  key: input.page.normalizedUrl,
  observedAt: input.auditRun.runAt,
  freshness: input.auditRun.stale ? 'stale-but-usable' : 'fresh',
  summary,
  facts,
});

const queryEvidence = (input: DetectorInput, row: QueryPageMetric, summary: string): EvidenceRef => ({
  source: 'gsc',
  collection: 'GscQueryPageMetric',
  key: `${input.page.normalizedUrl}::${row.query}`,
  observedAt: null, // GSC rows are identified by their period, not a timestamp
  freshness: 'fresh',
  summary,
  facts: {
    query: row.query,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: Number(row.ctr.toFixed(4)),
    position: Number(row.position.toFixed(1)),
    periodStart: input.gscPeriod?.start ?? null,
    periodEnd: input.gscPeriod?.end ?? null,
  },
});

/** Non-branded rows: branded demand says nothing about a page's optimisation. */
function nonBrandedRows(input: DetectorInput): QueryPageMetric[] {
  const branded = new Set(input.searchPerformance.queries.filter((q) => q.branded).map((q) => q.query));
  return input.gscRows.filter((r) => !branded.has(r.query));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Phase 6.1 content-length reasoning uses the scoped page-content text. */
function scopedWordCount(input: DetectorInput): number {
  // Pre-6.1 snapshots never captured scoped page text, so preserve their
  // historical behaviour instead of treating missing text as zero words.
  if (!input.state?.captureComplete) return input.state?.wordCount ?? 0;

  const text = input.normalizedText.trim();
  return text ? text.split(/\s+/).length : 0;
}

function seoJoinFacts(input: DetectorInput): Map<string, SeoJoinFacts> {
  return new Map([
    [
      input.page.normalizedUrl,
      {
        inSnapshot: !!input.state,
        title: input.state?.title ?? null,
        wordCount: input.state?.wordCount ?? 0,
        openIssueCheckIds: input.existingWork.openIssueCheckIds,
        openRecommendationIds: input.existingWork.openRecommendations.map((r) => r.recommendationId),
      },
    ],
  ]);
}

/** Map an existing GSC analyzer draft onto a page-scoped content opportunity. */
function fromGscDraft(
  input: DetectorInput,
  draft: OpportunityDraft,
  type: ContentOpportunityType,
  discriminatorSuffix: string,
): ContentOpportunity {
  const { priority } = opportunityPriority(draft.score, draft.confidence);
  const row = input.gscRows.find((r) => r.query === draft.query);
  return {
    type,
    priority,
    evidenceStrength: draft.confidence,
    explanation: draft.why,
    affectedQueries: draft.query ? [draft.query] : [],
    evidence: row
      ? [queryEvidence(input, row, `impr ${row.impressions}, pos ${row.position.toFixed(1)}, ctr ${(row.ctr * 100).toFixed(1)}%`)]
      : [
          {
            source: 'gsc',
            collection: 'GscQueryPageMetric',
            key: input.page.normalizedUrl,
            observedAt: null,
            freshness: 'fresh',
            summary: draft.why,
            facts: { periodStart: input.gscPeriod?.start ?? null, periodEnd: input.gscPeriod?.end ?? null },
          },
        ],
    discriminator: `${input.page.normalizedUrl}::${discriminatorSuffix}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1–2) CTR and striking distance — the EXISTING analyzers, page-scoped
// ─────────────────────────────────────────────────────────────────────────────

function detectGscQueryOpportunities(input: DetectorInput): ContentOpportunity[] {
  if (!input.gscPeriod) return [];
  const rows = nonBrandedRows(input);
  if (!rows.length) return [];
  const ctx = { window: input.gscPeriod, seo: seoJoinFacts(input) };

  return [
    ...analyzeHighImpressionLowCtr(rows, ctx).map((d) =>
      fromGscDraft(input, d, 'high-impression-low-ctr', `low-ctr::${d.query}`),
    ),
    ...analyzeStrikingDistance(rows, ctx).map((d) =>
      fromGscDraft(input, d, 'striking-distance', `striking::${d.query}`),
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Cannibalization — a property of a QUERY across pages
// ─────────────────────────────────────────────────────────────────────────────

function detectCannibalization(input: DetectorInput): ContentOpportunity[] {
  if (!input.gscPeriod || !input.allGscRows.length) return [];
  const ctx = { window: input.gscPeriod, seo: seoJoinFacts(input) };
  const url = input.page.normalizedUrl;

  return analyzeCannibalization(input.allGscRows, ctx)
    .filter((d) => {
      const competing = (d.evidence.competingUrls ?? []) as { normalizedUrl: string }[];
      return competing.some((c) => c.normalizedUrl === url);
    })
    .map((d) => {
      const competing = (d.evidence.competingUrls ?? []) as {
        normalizedUrl: string;
        impressions: number;
        share: number;
        position: number;
      }[];
      const others = competing.filter((c) => c.normalizedUrl !== url);
      const mine = competing.find((c) => c.normalizedUrl === url)!;
      return {
        type: 'suspected-query-cannibalization' as const,
        priority: opportunityPriority(d.score, d.confidence).priority,
        evidenceStrength: d.confidence,
        explanation:
          `This page takes ${(mine.share * 100).toFixed(0)}% of "${d.query}" impressions at position ` +
          `${mine.position.toFixed(1)}, competing with ${others.map((o) => o.normalizedUrl).join(', ')}. ` +
          'Splitting one query across pages splits its ranking signals.',
        affectedQueries: [d.query ?? ''],
        evidence: competing.slice(0, contentConfig.limits.maxEvidenceRefsPerOpportunity).map((c) => ({
          source: 'gsc' as const,
          collection: 'GscQueryPageMetric',
          key: `${c.normalizedUrl}::${d.query}`,
          observedAt: null,
          freshness: 'fresh' as const,
          summary: `${c.normalizedUrl}: ${c.impressions} impr (${(c.share * 100).toFixed(0)}% share), pos ${c.position.toFixed(1)}`,
          facts: {
            competingUrl: c.normalizedUrl,
            impressions: c.impressions,
            share: Number(c.share.toFixed(3)),
            position: Number(c.position.toFixed(1)),
          },
        })),
        // Query-scoped, so the two competing pages produce two distinct,
        // independently reviewable findings rather than one ambiguous one.
        discriminator: `${url}::cannibalization::${d.query}`,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Thin content — the EXISTING threshold and path exclusions
// ─────────────────────────────────────────────────────────────────────────────

function detectThinContent(input: DetectorInput): ContentOpportunity[] {
  const state = input.state;
  if (!state || state.wordCount === null) return [];
  const path = pathOf(input.page.normalizedUrl);
  // Pages that are legitimately short are excluded by the audit's own list.
  if (recoConfig.thinContentExcludePatterns.some((re) => re.test(path))) return [];

  const words = scopedWordCount(input);
  const threshold = recoConfig.thinContentWordCount;
  if (words >= threshold) return [];

  // Well under the bar is a stronger observation than a word off it.
  const strength: OpportunityConfidence = words < threshold * 0.5 ? 'high' : 'medium';

  return [
    {
      type: 'thin-content',
      priority: statePriority(input.page.normalizedUrl),
      evidenceStrength: downgradeIfStale(strength, input.auditRun.stale),
      explanation:
        `The page carries ${words} words of visible page content, below the ${threshold}-word bar the audit ` +
        'already uses. Little unique text gives search engines few relevance signals to rank on.',
      affectedQueries: [],
      evidence: [
        snapshotEvidence(input, `wordCount ${words} < ${threshold}`, {
          wordCount: words,
          threshold,
          normalizedTextChars: state.normalizedTextChars,
        }),
      ],
      discriminator: `${input.page.normalizedUrl}::thin-content`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Metadata — measured against the bars Phase 5.5 already enforces
// ─────────────────────────────────────────────────────────────────────────────

function detectMetadataOpportunity(input: DetectorInput): ContentOpportunity[] {
  const state = input.state;
  if (!state) return [];
  const lengths = describeMetadataLengths(state);
  const problems: string[] = [];
  const facts: Record<string, string | number | boolean | null> = {
    titleLength: lengths.titleLength,
    descriptionLength: lengths.descriptionLength,
    titleMin: PREFLIGHT_THRESHOLDS.renderedTitleMinLength,
    titleMax: PREFLIGHT_THRESHOLDS.renderedTitleMaxLength,
    descriptionMin: seoConfig.descriptionMinLength,
    descriptionMax: seoConfig.descriptionMaxLength,
  };
  // A direct, measured observation of stored state.
  let strength: OpportunityConfidence = 'high';

  if (lengths.titleMissing) problems.push('the page has no title');
  else if (lengths.titleLength! < PREFLIGHT_THRESHOLDS.renderedTitleMinLength) {
    problems.push(`the rendered title is ${lengths.titleLength} characters, under the ${PREFLIGHT_THRESHOLDS.renderedTitleMinLength}-character guideline`);
    strength = 'medium'; // a guideline, not a fault
  } else if (lengths.titleLength! > PREFLIGHT_THRESHOLDS.renderedTitleMaxLength) {
    problems.push(`the rendered title is ${lengths.titleLength} characters, over the ${PREFLIGHT_THRESHOLDS.renderedTitleMaxLength}-character guideline and likely truncated in results`);
    strength = 'medium';
  }

  if (lengths.descriptionMissing) problems.push('the page has no meta description');
  else if (lengths.descriptionLength! < seoConfig.descriptionMinLength) {
    problems.push(`the meta description is ${lengths.descriptionLength} characters, under the ${seoConfig.descriptionMinLength}-character guideline`);
  } else if (lengths.descriptionLength! > seoConfig.descriptionMaxLength) {
    problems.push(`the meta description is ${lengths.descriptionLength} characters, over the ${seoConfig.descriptionMaxLength}-character guideline`);
  }

  // Duplicate metadata is the audit's own finding — reused, never re-detected.
  const duplicateChecks = input.existingWork.openIssueCheckIds.filter(
    (c) => c === 'duplicate-title' || c === 'duplicate-description',
  );
  for (const check of duplicateChecks) {
    problems.push(`the audit has an open ${check} finding on this URL`);
    facts[check] = true;
  }

  if (!problems.length) return [];

  // Real demand makes a metadata weakness matter more; its absence does not
  // make the observation wrong, only less urgent.
  const impressions = input.searchPerformance.totals?.impressions ?? 0;
  const bonus = impressions >= contentConfig.minPageImpressions ? 10 : 0;

  const evidence: EvidenceRef[] = [
    snapshotEvidence(input, `title ${lengths.titleLength ?? 'absent'} chars, description ${lengths.descriptionLength ?? 'absent'} chars`, facts),
  ];
  for (const check of duplicateChecks) {
    evidence.push({
      source: 'audit',
      collection: 'SeoIssue',
      key: `${input.page.normalizedUrl}::${check}`,
      observedAt: input.auditRun.runAt,
      freshness: input.auditRun.stale ? 'stale-but-usable' : 'fresh',
      summary: `open ${check} finding`,
      facts: { checkId: check },
    });
  }

  return [
    {
      type: 'metadata-opportunity',
      priority: statePriority(input.page.normalizedUrl, bonus),
      evidenceStrength: downgradeIfStale(duplicateChecks.length ? 'high' : strength, input.auditRun.stale),
      explanation: `Metadata needs attention: ${problems.join('; ')}.`,
      affectedQueries: [],
      evidence,
      discriminator: `${input.page.normalizedUrl}::metadata`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Heading structure — suppressed entirely when structure was not captured
// ─────────────────────────────────────────────────────────────────────────────

function detectHeadingStructure(input: DetectorInput): ContentOpportunity[] {
  const state = input.state;
  if (!state) return [];
  const structure = describeHeadingStructure(state);
  // A pre-6.1 snapshot: absence of headings is not evidence of absent headings.
  if (!structure.known) return [];

  const problems: string[] = [];
  if (structure.h1Count === 0) problems.push('the page has no H1');
  else if (structure.h1Count > 1) problems.push(`the page has ${structure.h1Count} H1 elements`);

  const words = scopedWordCount(input);
  if (structure.h2Count === 0 && words >= contentConfig.headingStructureMinWords) {
    problems.push(`${words} words run without a single H2, so the content has no scannable structure`);
  }
  if (structure.skipsLevel) problems.push('an H3 appears before any H2, skipping a heading level');

  if (!problems.length) return [];

  return [
    {
      type: 'heading-structure-opportunity',
      priority: statePriority(input.page.normalizedUrl),
      evidenceStrength: downgradeIfStale('high', input.auditRun.stale),
      explanation: `Heading structure needs attention: ${problems.join('; ')}.`,
      affectedQueries: [],
      evidence: [
        snapshotEvidence(input, `h1×${structure.h1Count}, h2×${structure.h2Count}, h3×${structure.h3Count}, ${words} words`, {
          h1Count: structure.h1Count,
          h2Count: structure.h2Count,
          h3Count: structure.h3Count,
          wordCount: words,
          skipsLevel: structure.skipsLevel,
          minWordsForSubheadings: contentConfig.headingStructureMinWords,
        }),
      ],
      discriminator: `${input.page.normalizedUrl}::heading-structure`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Internal linking — only when the page has demand worth routing to
// ─────────────────────────────────────────────────────────────────────────────

function detectInternalLinkOpportunity(input: DetectorInput): ContentOpportunity[] {
  const state = input.state;
  if (!state) return [];
  const inbound = state.internalLinks.inboundCount;
  if (inbound > recoConfig.lowInboundThreshold) return [];

  const impressions = input.searchPerformance.totals?.impressions ?? 0;
  // Without demand evidence, a thinly-linked page is not yet an opportunity —
  // it is just a page. The demand is what makes the link worth adding.
  if (!input.searchPerformance.known || impressions < contentConfig.minPageImpressions) return [];

  const strength = confidence({
    impressions,
    floor: contentConfig.minPageImpressions,
    hasClicks: (input.searchPerformance.totals?.clicks ?? 0) > 0,
  });

  return [
    {
      type: 'internal-link-opportunity',
      priority: statePriority(input.page.normalizedUrl, 10),
      evidenceStrength: downgradeIfStale(strength, input.auditRun.stale),
      explanation:
        `The page draws ${impressions} impressions but has only ${inbound} inbound internal link${inbound === 1 ? '' : 's'} ` +
        `(the audit treats ≤ ${recoConfig.lowInboundThreshold} as low). Internal links pass relevance and crawl priority to it.`,
      affectedQueries: [],
      evidence: [
        snapshotEvidence(input, `${inbound} inbound, ${state.internalLinks.outboundCount} outbound`, {
          inboundCount: inbound,
          outboundCount: state.internalLinks.outboundCount,
          lowInboundThreshold: recoConfig.lowInboundThreshold,
          impressions,
        }),
      ],
      discriminator: `${input.page.normalizedUrl}::internal-link`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) Missing topic coverage — demand-gated by construction (see extraction)
// ─────────────────────────────────────────────────────────────────────────────

function detectMissingTopicCoverage(input: DetectorInput): ContentOpportunity[] {
  const uncovered = input.topicCoverage.filter((c) => !c.covered);
  if (!uncovered.length) return [];

  const byTerm = new Map(input.coverageCandidates.map((c) => [c.term, c]));
  const out: ContentOpportunity[] = [];

  for (const entry of uncovered) {
    const candidate = byTerm.get(entry.term);
    if (!candidate) continue; // no demand behind it ⇒ no finding, by design

    const strength = confidence({
      impressions: candidate.demandMagnitude,
      floor: contentConfig.coverageMinQueryImpressions,
      hasClicks: false,
    });

    out.push({
      type: 'missing-topic-coverage',
      priority: statePriority(input.page.normalizedUrl, candidate.demandSource === 'gsc-query' ? 10 : 0),
      evidenceStrength: downgradeIfStale(strength, input.auditRun.stale),
      explanation:
        `Search demand reaches this page through "${candidate.demandTerm}" ` +
        `(${candidate.demandMagnitude} ${candidate.demandSource === 'gsc-query' ? 'impressions' : 'monthly searches'}), ` +
        `but the page never addresses ${entry.dimension} "${entry.term}" in its title, headings, description or body. ` +
        'This is about whether the page covers the topic at all — not about how often a phrase appears.',
      affectedQueries: candidate.demandSource === 'gsc-query' ? [candidate.demandTerm] : [],
      evidence: [
        {
          source: candidate.demandSource === 'gsc-query' ? 'gsc' : 'market',
          collection: candidate.demandSource === 'gsc-query' ? 'GscQueryPageMetric' : 'SearchKeyword',
          key: `${input.page.normalizedUrl}::${candidate.demandTerm}`,
          observedAt: candidate.demandSource === 'gsc-query' ? null : (input.marketEvidence.keywords[0]?.capturedAt ?? null),
          freshness: candidate.demandSource === 'gsc-query' ? 'fresh' : input.marketEvidence.freshness,
          summary: `"${candidate.demandTerm}" — ${candidate.demandMagnitude} ${candidate.demandSource === 'gsc-query' ? 'impressions' : 'searches'}`,
          facts: {
            demandTerm: candidate.demandTerm,
            demandMagnitude: candidate.demandMagnitude,
            demandSource: candidate.demandSource,
            dimension: entry.dimension,
            term: entry.term,
            taxonomyWeight: candidate.weight,
          },
        },
        snapshotEvidence(input, `"${entry.term}" absent from title, headings, description and body`, {
          term: entry.term,
          searchedTitle: true,
          searchedHeadings: true,
          searchedMetaDescription: true,
          searchedBody: true,
          bodyTruncated: input.state?.normalizedTextTruncated ?? false,
        }),
      ],
      discriminator: `${input.page.normalizedUrl}::topic::${entry.term}`,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) Type compatibility — the EXISTING TYPE_COMPATIBILITY table
// ─────────────────────────────────────────────────────────────────────────────

function detectTypeCompatibilityMismatch(input: DetectorInput): ContentOpportunity[] {
  if (!input.searchPerformance.known) return [];
  const pageType: PageType = input.page.pageType;

  // Consider only non-branded queries with enough demand to mean something.
  const candidates = input.searchPerformance.queries.filter(
    (q) => !q.branded && q.impressions >= contentConfig.coverageMinQueryImpressions,
  );
  if (!candidates.length) return [];

  const mismatched: { query: string; intent: Intent; impressions: number; allowed: PageType[] }[] = [];
  for (const q of candidates) {
    // The query's strongest intent, matching how the pipeline picks one.
    const primary = [...q.intents].sort((a, b) => b.confidence - a.confidence)[0];
    if (!primary) continue;
    const allowed = TYPE_COMPATIBILITY[primary.intent];
    // No entry ⇒ the table has NO OPINION (e.g. NAVIGATIONAL). Never a mismatch.
    if (!allowed) continue;
    if (allowed.includes(pageType)) continue;
    mismatched.push({ query: q.query, intent: primary.intent, impressions: q.impressions, allowed });
  }
  if (!mismatched.length) return [];

  const totalImpressions = mismatched.reduce((n, m) => n + m.impressions, 0);
  const strength = confidence({
    impressions: totalImpressions,
    floor: contentConfig.coverageMinQueryImpressions,
    hasClicks: false,
  });
  const allowedTypes = [...new Set(mismatched.flatMap((m) => m.allowed))];

  return [
    {
      type: 'type-compatibility-mismatch',
      priority: statePriority(input.page.normalizedUrl),
      evidenceStrength: strength,
      explanation:
        `${mismatched.length} quer${mismatched.length === 1 ? 'y' : 'ies'} reaching this ${pageType} page ` +
        `(${totalImpressions} impressions) carry intents this page type does not serve — ` +
        `${[...new Set(mismatched.map((m) => m.intent))].join(', ')}, which belong on ${allowedTypes.join(' or ')} pages. ` +
        'Either the demand needs a different page, or this page is ranking for something it does not answer.',
      affectedQueries: mismatched.map((m) => m.query),
      evidence: mismatched.slice(0, contentConfig.limits.maxEvidenceRefsPerOpportunity).map((m) => ({
        source: 'gsc' as const,
        collection: 'GscQueryPageMetric',
        key: `${input.page.normalizedUrl}::${m.query}`,
        observedAt: null,
        freshness: 'fresh' as const,
        summary: `"${m.query}" (${m.intent}, ${m.impressions} impr) expects ${m.allowed.join('/')} , got ${pageType}`,
        facts: {
          query: m.query,
          intent: m.intent,
          impressions: m.impressions,
          pageType,
          compatibleTypes: m.allowed.join(','),
        },
      })),
      discriminator: `${input.page.normalizedUrl}::type-compatibility`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Missing evidence
// ─────────────────────────────────────────────────────────────────────────────

const GSC_DEPENDENT: ContentOpportunityType[] = [
  'high-impression-low-ctr',
  'striking-distance',
  'suspected-query-cannibalization',
  'internal-link-opportunity',
  'type-compatibility-mismatch',
];
const STRUCTURE_DEPENDENT: ContentOpportunityType[] = ['heading-structure-opportunity', 'missing-topic-coverage'];

function collectMissingEvidence(input: DetectorInput): MissingEvidence[] {
  const out: MissingEvidence[] = [];

  if (!input.gscConfigured) {
    out.push({
      source: 'gsc',
      reason: 'gsc_not_configured',
      suppressedOpportunityTypes: GSC_DEPENDENT,
      detail: 'Search Console is not provisioned, so the absence of query data proves nothing about this page.',
    });
  } else if (!input.searchPerformance.known) {
    out.push({
      source: 'gsc',
      reason: 'gsc_no_rows_for_page',
      suppressedOpportunityTypes: GSC_DEPENDENT,
      detail: `No stored Search Console rows joined to this page for period ${input.gscPeriod?.start ?? '?'}…${input.gscPeriod?.end ?? '?'}.`,
    });
  }

  if (!input.state) {
    out.push({
      source: 'snapshot',
      reason: 'no_audit_snapshot',
      suppressedOpportunityTypes: [
        'thin-content',
        'metadata-opportunity',
        'heading-structure-opportunity',
        'internal-link-opportunity',
        'missing-topic-coverage',
      ],
      detail: 'The latest completed audit run holds no snapshot for this URL.',
    });
  } else {
    if (!input.state.captureComplete) {
      out.push({
        source: 'snapshot',
        reason: 'page_structure_not_captured',
        suppressedOpportunityTypes: STRUCTURE_DEPENDENT,
        detail:
          'This snapshot predates the Phase 6.1 extractor, so headings and body text were never captured. ' +
          'Absent structure is NOT evidence of absent headings — re-run the audit to populate it.',
      });
    }
    if (input.state.normalizedTextTruncated) {
      out.push({
        source: 'snapshot',
        reason: 'page_text_truncated',
        suppressedOpportunityTypes: ['missing-topic-coverage'],
        detail:
          `Visible text was truncated at capture (${input.state.normalizedTextChars} characters observed), ` +
          'so a term appearing only in the tail could be misreported as uncovered.',
      });
    }
    if (input.auditRun.stale) {
      out.push({
        source: 'audit',
        reason: 'audit_run_stale',
        suppressedOpportunityTypes: [],
        detail:
          `The latest completed audit run is ${input.auditRun.ageDays} days old (limit ` +
          `${contentConfig.maxAuditRunAgeDays}); page state may describe a page that has since changed. ` +
          'State-derived findings are reported one confidence level lower.',
      });
    }
  }

  if (!input.marketEvidence.known) {
    out.push({
      source: 'market',
      reason: 'market_no_mapped_keywords',
      suppressedOpportunityTypes: [],
      detail: 'No stored Phase 4B keyword maps to this page. Analysis proceeds on Search Console and page state.',
    });
  } else if (input.marketEvidence.freshness === 'too-old') {
    out.push({
      source: 'market',
      reason: 'market_evidence_too_old',
      suppressedOpportunityTypes: [],
      detail:
        'Stored market evidence for this page is past the usable age. It is reported as-is and NOT refreshed — ' +
        'refreshing costs money and is never automatic.',
    });
  }
  if (input.marketEvidence.known && !input.marketEvidence.serpSnapshotAt) {
    out.push({
      source: 'market',
      reason: 'serp_evidence_absent',
      suppressedOpportunityTypes: [],
      detail: 'No cached SERP snapshot exists for this page’s keywords. Phase 6.1 never fetches one.',
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_ORDER: ContentOpportunityType[] = [
  'high-impression-low-ctr',
  'striking-distance',
  'suspected-query-cannibalization',
  'type-compatibility-mismatch',
  'missing-topic-coverage',
  'thin-content',
  'metadata-opportunity',
  'heading-structure-opportunity',
  'internal-link-opportunity',
  'insufficient-evidence',
];
const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

/** Run every detector. Deterministic: same input ⇒ identical, identically-ordered output. */
export function detectOpportunities(input: DetectorInput): DetectorOutput {
  const opportunities = [
    ...detectGscQueryOpportunities(input),
    ...detectCannibalization(input),
    ...detectTypeCompatibilityMismatch(input),
    ...detectMissingTopicCoverage(input),
    ...detectThinContent(input),
    ...detectMetadataOpportunity(input),
    ...detectHeadingStructure(input),
    ...detectInternalLinkOpportunity(input),
  ];

  const missingEvidence = collectMissingEvidence(input);

  // Terminal state: the page is in scope, but nothing could be concluded about
  // it. Reported explicitly so "analysed and healthy" is never confused with
  // "analysed and unknowable".
  if (!opportunities.length) {
    const impressions = input.searchPerformance.totals?.impressions ?? 0;
    const noUsableDemand = !input.searchPerformance.known || impressions < contentConfig.minPageImpressions;
    if (noUsableDemand || !input.state) {
      opportunities.push({
        type: 'insufficient-evidence',
        priority: 'low',
        evidenceStrength: 'low',
        explanation: input.state
          ? `No opportunity could be assessed: the page has ${input.searchPerformance.known ? `${impressions} impressions` : 'no stored Search Console rows'}, ` +
            `below the ${contentConfig.minPageImpressions}-impression floor for demand-based reasoning, and its page state raised nothing.`
          : 'No opportunity could be assessed: the latest audit run holds no snapshot for this page.',
        affectedQueries: [],
        evidence: [
          {
            source: 'gsc',
            collection: 'GscQueryPageMetric',
            key: input.page.normalizedUrl,
            observedAt: null,
            freshness: input.searchPerformance.known ? 'fresh' : 'unknown',
            summary: input.searchPerformance.known ? `${impressions} impressions in the stored period` : 'no stored rows for this page',
            facts: {
              impressions: input.searchPerformance.known ? impressions : null,
              floor: contentConfig.minPageImpressions,
              hasSnapshot: !!input.state,
            },
          },
        ],
        discriminator: `${input.page.normalizedUrl}::insufficient-evidence`,
      });
    }
  }

  opportunities.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.discriminator.localeCompare(b.discriminator),
  );

  return {
    opportunities: opportunities.map((o) => ({
      ...o,
      evidence: o.evidence.slice(0, contentConfig.limits.maxEvidenceRefsPerOpportunity),
    })),
    missingEvidence,
  };
}
