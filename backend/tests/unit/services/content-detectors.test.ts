// =============================================================================
// UNIT TESTS — SEO Phase 6.1 opportunity detectors
// Pure over assembled evidence. No DB, no network, no clock.
// =============================================================================

import { detectOpportunities, DetectorInput } from '../../../src/modules/seo/content/services/opportunity-detectors';
import { deriveCoverageCandidates, computeTopicCoverage } from '../../../src/modules/seo/content/services/content-extraction';
import { BASE_TAXONOMY } from '../../../src/modules/seo/market/relevance.taxonomy';
import { buildSearchPerformance } from '../../../src/modules/seo/content/services/gsc-page-evidence';
import { EXTRACTOR_VERSION } from '../../../src/modules/seo/services/parser.service';
import { PageContentState, EligiblePage, PageMarketEvidence } from '../../../src/modules/seo/content/content.types';
import { QueryPageMetric } from '../../../src/modules/seo/gsc.types';
import { PageType } from '../../../src/modules/seo/market/market.types';

const BASE = 'https://rajhanstea.com';
const URL = `${BASE}/product/assam-ctc/`;
const PERIOD = { start: '2026-08-01', end: '2026-08-28' };

function page(over: Partial<EligiblePage> = {}): EligiblePage {
  return {
    normalizedUrl: URL,
    canonicalUrl: URL,
    pageType: 'product' as PageType,
    slug: 'assam-ctc',
    title: 'Assam CTC',
    sourceModel: 'Product',
    documentId: null,
    eligible: true,
    ineligibleReason: null,
    ...over,
  };
}

function state(over: Partial<PageContentState> = {}): PageContentState {
  return {
    title: 'Assam CTC Tea — Strong Malty Everyday Chai | Rajhans',
    titleLength: 53,
    metaDescription: 'Strong, malty Assam CTC chai from the finest gardens — full-bodied and made for milk.',
    metaDescriptionLength: 83,
    h1: ['Assam CTC Tea'],
    h2: ['How to brew', 'Sourcing'],
    h3: [],
    headingOutline: [
      { level: 1, text: 'Assam CTC Tea' },
      { level: 2, text: 'How to brew' },
      { level: 2, text: 'Sourcing' },
    ],
    wordCount: 800,
    contentHash: 'hash',
    normalizedTextChars: 4200,
    visibleWordCount: 0,
    normalizedTextTruncated: false,
    faqSignals: { questionHeadings: 0, faqHeadingPresent: false, faqSchemaPresent: false },
    canonical: URL,
    robotsMeta: null,
    indexable: true,
    inSitemap: true,
    structuredDataTypes: ['Product'],
    internalLinks: { outboundCount: 12, inboundCount: 4, outboundTargets: [] },
    captureComplete: true,
    extractorVersion: EXTRACTOR_VERSION,
    ...over,
  };
}

const emptyMarket = (over: Partial<PageMarketEvidence> = {}): PageMarketEvidence => ({
  known: false,
  freshness: 'unknown',
  keywords: [],
  keywordCount: 0,
  keywordsTruncated: false,
  clusters: [],
  serpSnapshotAt: null,
  openMarketRecommendationIds: [],
  ...over,
});

const row = (query: string, over: Partial<QueryPageMetric> = {}): QueryPageMetric => ({
  query,
  page: URL,
  normalizedUrl: URL,
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 10,
  ...over,
});

function input(over: Partial<DetectorInput> = {}): DetectorInput {
  const gscRows = over.gscRows ?? [];
  const searchPerformance = over.searchPerformance ?? buildSearchPerformance(gscRows, gscRows.length ? PERIOD : null, BASE_TAXONOMY);
  const base: DetectorInput = {
    page: page(),
    state: state(),
    normalizedText: 'strong malty assam ctc chai from the finest gardens, full bodied and made for milk',
    searchPerformance,
    marketEvidence: emptyMarket(),
    existingWork: { openIssueCheckIds: [], openRecommendations: [] },
    topicCoverage: [],
    coverageCandidates: [],
    gscRows,
    allGscRows: over.allGscRows ?? gscRows,
    gscConfigured: true,
    gscPeriod: gscRows.length ? PERIOD : null,
    auditRun: { runId: 'run1', runAt: new Date('2026-08-30T00:00:00Z'), stale: false, ageDays: 2 },
    taxonomy: BASE_TAXONOMY,
  };
  return { ...base, ...over, searchPerformance, gscRows, allGscRows: over.allGscRows ?? gscRows };
}

const typesOf = (out: { opportunities: { type: string }[] }) => out.opportunities.map((o) => o.type);
const reasonsOf = (out: { missingEvidence: { reason: string }[] }) => out.missingEvidence.map((m) => m.reason);

// ─────────────────────────────────────────────────────────────────────────────

describe('no GSC evidence', () => {
  it('records gsc_no_rows_for_page and names the suppressed types, without inventing zeros', () => {
    const out = detectOpportunities(input());
    expect(reasonsOf(out)).toContain('gsc_no_rows_for_page');
    const entry = out.missingEvidence.find((m) => m.reason === 'gsc_no_rows_for_page')!;
    expect(entry.suppressedOpportunityTypes).toEqual(
      expect.arrayContaining(['high-impression-low-ctr', 'striking-distance', 'suspected-query-cannibalization']),
    );
    expect(typesOf(out)).not.toContain('high-impression-low-ctr');
  });

  it('distinguishes "not provisioned" from "provisioned but no rows"', () => {
    const out = detectOpportunities(input({ gscConfigured: false }));
    expect(reasonsOf(out)).toContain('gsc_not_configured');
    expect(reasonsOf(out)).not.toContain('gsc_no_rows_for_page');
  });

  it('still finds page-state opportunities without any GSC data', () => {
    const out = detectOpportunities(input({ state: state({ wordCount: 40 }) }));
    expect(typesOf(out)).toContain('thin-content');
  });
});

describe('strong GSC evidence', () => {
  it('detects low CTR using the shared CTR curve and thresholds', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('assam ctc tea', { impressions: 900, clicks: 4, ctr: 0.0044, position: 6.2 })] }),
    );
    expect(typesOf(out)).toContain('high-impression-low-ctr');
    const finding = out.opportunities.find((o) => o.type === 'high-impression-low-ctr')!;
    expect(finding.affectedQueries).toEqual(['assam ctc tea']);
    expect(finding.evidence.length).toBeGreaterThan(0);
    expect(finding.evidence[0].facts.impressions).toBe(900);
  });

  it('detects striking distance in the existing 4–20 band', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('kadak chai online', { impressions: 300, clicks: 9, ctr: 0.03, position: 8.4 })] }),
    );
    expect(typesOf(out)).toContain('striking-distance');
  });

  it('does not fire striking distance for a page-one-top-three position', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('kadak chai online', { impressions: 300, clicks: 90, ctr: 0.3, position: 1.4 })] }),
    );
    expect(typesOf(out)).not.toContain('striking-distance');
  });
});

describe('low-volume / noisy queries', () => {
  it('raises no demand-based opportunity and falls through to insufficient-evidence', () => {
    const out = detectOpportunities(
      input({
        gscRows: [row('some obscure phrase', { impressions: 3, clicks: 0, ctr: 0, position: 42 })],
        normalizedText: Array(800).fill('tea').join(' '),
      }),
    );
    expect(typesOf(out)).not.toContain('high-impression-low-ctr');
    expect(typesOf(out)).not.toContain('striking-distance');
    expect(typesOf(out)).toContain('insufficient-evidence');
  });

  it('keeps the noisy row visible in evidence with the pipeline eligibility reason', () => {
    const perf = buildSearchPerformance([row('obscure', { impressions: 3, position: 42 })], PERIOD, BASE_TAXONOMY);
    expect(perf.queries[0].eligibleFor).toEqual([]);
    expect(perf.queries[0].eligibilityReason).toMatch(/excluded/);
  });
});

describe('branded queries', () => {
  const brandedRow = row('rajhans tea', { impressions: 5000, clicks: 20, ctr: 0.004, position: 5 });

  it('are excluded from CTR reasoning — brand CTR says nothing about the page', () => {
    const out = detectOpportunities(input({ gscRows: [brandedRow] }));
    expect(typesOf(out)).not.toContain('high-impression-low-ctr');
    expect(typesOf(out)).not.toContain('striking-distance');
  });

  it('are still counted in the page totals and flagged in evidence', () => {
    const perf = buildSearchPerformance([brandedRow], PERIOD, BASE_TAXONOMY);
    expect(perf.totals!.impressions).toBe(5000);
    expect(perf.queries[0].branded).toBe(true);
  });

  it('do not suppress a genuine finding on a non-branded query on the same page', () => {
    const out = detectOpportunities(
      input({ gscRows: [brandedRow, row('assam ctc tea', { impressions: 900, clicks: 3, ctr: 0.0033, position: 6.2 })] }),
    );
    expect(typesOf(out)).toContain('high-impression-low-ctr');
    expect(out.opportunities.find((o) => o.type === 'high-impression-low-ctr')!.affectedQueries).toEqual(['assam ctc tea']);
  });
});

describe('thin content', () => {
  it('fires under the existing 250-word bar', () => {
    const out = detectOpportunities(
      input({
        state: state({ wordCount: 120 }),
        normalizedText: Array(120).fill('tea').join(' '),
      }),
    );
    const finding = out.opportunities.find((o) => o.type === 'thin-content')!;
    expect(finding.evidence[0].facts).toMatchObject({ wordCount: 120, threshold: 250 });
  });

  it('does not fire on a page over the bar', () => {
    expect(
      typesOf(
        detectOpportunities(
          input({
            state: state({ wordCount: 800 }),
            normalizedText: Array(800).fill('tea').join(' '),
          }),
        ),
      ),
    ).not.toContain('thin-content');
  });

  it('respects the audit’s own path exclusions for legitimately short pages', () => {
    const out = detectOpportunities(
      input({
        page: page({ normalizedUrl: `${BASE}/catalog/kadak-and-strong/`, pageType: 'category' as PageType }),
        state: state({ wordCount: 60 }),
      }),
    );
    expect(typesOf(out)).not.toContain('thin-content');
  });
});

describe('metadata', () => {
  it('fires when the title is missing', () => {
    const out = detectOpportunities(input({ state: state({ title: null, titleLength: null }) }));
    expect(out.opportunities.find((o) => o.type === 'metadata-opportunity')!.explanation).toMatch(/no title/);
  });

  it('measures against the same bounds Phase 5.5 enforces', () => {
    const out = detectOpportunities(input({ state: state({ title: 'Tea', titleLength: 3 }) }));
    const finding = out.opportunities.find((o) => o.type === 'metadata-opportunity')!;
    expect(finding.evidence[0].facts).toMatchObject({ titleMin: 30, titleMax: 60, descriptionMin: 50, descriptionMax: 160 });
  });

  it('detects a repeated trailing rendered-title segment without needing GSC evidence', () => {
    const title = 'Frequently Asked Questions — Rajhans Tea — Rajhans Tea';
    const out = detectOpportunities(
      input({
        state: state({ title, titleLength: title.length }),
      }),
    );

    const finding = out.opportunities.find((o) => o.type === 'metadata-opportunity')!;
    expect(finding.explanation).toMatch(/repeats the trailing segment/i);
    expect(finding.evidence[0].facts).toMatchObject({
      repeatedTrailingTitleSegment: 'Rajhans Tea',
    });
  });

  it('reuses the audit’s open duplicate findings rather than re-detecting them', () => {
    const out = detectOpportunities(
      input({ existingWork: { openIssueCheckIds: ['duplicate-title'], openRecommendations: [] } }),
    );
    const finding = out.opportunities.find((o) => o.type === 'metadata-opportunity')!;
    expect(finding.explanation).toMatch(/duplicate-title/);
    expect(finding.evidence.some((e) => e.source === 'audit' && e.collection === 'SeoIssue')).toBe(true);
  });

  it('stays silent on healthy metadata', () => {
    expect(typesOf(detectOpportunities(input()))).not.toContain('metadata-opportunity');
  });
});

describe('heading structure', () => {
  it('fires when a long page has no H2 at all', () => {
    const out = detectOpportunities(
      input({
        state: state({ h2: [], headingOutline: [{ level: 1, text: 'Assam CTC Tea' }], wordCount: 900 }),
        normalizedText: Array(900).fill('tea').join(' '),
      }),
    );
    expect(out.opportunities.find((o) => o.type === 'heading-structure-opportunity')!.explanation).toMatch(/without a single H2/);
  });

  it('does not demand sub-headings on a short page', () => {
    const out = detectOpportunities(
      input({ state: state({ h2: [], headingOutline: [{ level: 1, text: 'Policy' }], wordCount: 100 }) }),
    );
    const finding = out.opportunities.find((o) => o.type === 'heading-structure-opportunity');
    expect(finding).toBeUndefined();
  });

  it('fires on a missing or duplicated H1', () => {
    expect(typesOf(detectOpportunities(input({ state: state({ h1: [], headingOutline: [{ level: 2, text: 'x' }] }) })))).toContain(
      'heading-structure-opportunity',
    );
    expect(typesOf(detectOpportunities(input({ state: state({ h1: ['A', 'B'] }) })))).toContain('heading-structure-opportunity');
  });
});

describe('old snapshot missing the Phase 6.1 fields', () => {
  const old = state({ captureComplete: false, extractorVersion: null, h2: [], h3: [], headingOutline: [], normalizedTextChars: 0 });

  it('suppresses structure-dependent detectors instead of reporting "no headings"', () => {
    const out = detectOpportunities(input({ state: old }));
    expect(typesOf(out)).not.toContain('heading-structure-opportunity');
    const entry = out.missingEvidence.find((m) => m.reason === 'page_structure_not_captured')!;
    expect(entry.suppressedOpportunityTypes).toEqual(
      expect.arrayContaining(['heading-structure-opportunity', 'missing-topic-coverage']),
    );
  });

  it('still evaluates detectors that do not need structure', () => {
    const out = detectOpportunities(input({ state: state({ ...old, wordCount: 50 }) }));
    expect(typesOf(out)).toContain('thin-content');
  });
});

describe('truncated page text', () => {
  it('flags that coverage may be misreported rather than trusting the excerpt silently', () => {
    const out = detectOpportunities(input({ state: state({ normalizedTextTruncated: true, normalizedTextChars: 90000 }) }));
    const entry = out.missingEvidence.find((m) => m.reason === 'page_text_truncated')!;
    expect(entry.suppressedOpportunityTypes).toContain('missing-topic-coverage');
  });
});

describe('internal linking', () => {
  const lonely = state({ internalLinks: { outboundCount: 3, inboundCount: 0, outboundTargets: [] } });

  it('fires only when the page has demand worth routing to', () => {
    const withDemand = detectOpportunities(
      input({ state: lonely, gscRows: [row('assam ctc', { impressions: 400, clicks: 12, ctr: 0.03, position: 3 })] }),
    );
    expect(typesOf(withDemand)).toContain('internal-link-opportunity');

    const withoutDemand = detectOpportunities(input({ state: lonely }));
    expect(typesOf(withoutDemand)).not.toContain('internal-link-opportunity');
  });

  it('does not fire on a well-linked page', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('assam ctc', { impressions: 400, clicks: 12, ctr: 0.03, position: 3 })] }),
    );
    expect(typesOf(out)).not.toContain('internal-link-opportunity');
  });
});

describe('missing topic coverage', () => {
  function coverageInput(bodyText: string) {
    const queries = [{ query: 'darjeeling tea online', impressions: 300 }];
    const candidates = deriveCoverageCandidates({ queries, marketKeywords: [] });
    const pageState = state({ title: 'Assam CTC Tea', h1: ['Assam CTC Tea'], h2: [], h3: [], metaDescription: null });
    return input({
      state: pageState,
      normalizedText: bodyText,
      coverageCandidates: candidates,
      topicCoverage: computeTopicCoverage(pageState, candidates, bodyText),
      gscRows: [row('darjeeling tea online', { impressions: 300, clicks: 6, ctr: 0.02, position: 12 })],
    });
  }

  it('fires only for a demanded term the page never addresses', () => {
    const out = detectOpportunities(coverageInput('strong malty assam chai for milk'));
    const finding = out.opportunities.find((o) => o.type === 'missing-topic-coverage')!;
    expect(finding.explanation).toMatch(/darjeeling/);
    expect(finding.explanation).toMatch(/not about how often a phrase appears/);
  });

  it('does not fire when the page covers the topic anywhere', () => {
    const out = detectOpportunities(coverageInput('we also stock darjeeling first flush'));
    expect(typesOf(out)).not.toContain('missing-topic-coverage');
  });

  it('never fires from zero occurrences alone, with no demand behind the term', () => {
    const out = detectOpportunities(input({ coverageCandidates: [], topicCoverage: [] }));
    expect(typesOf(out)).not.toContain('missing-topic-coverage');
  });
});

describe('type compatibility', () => {
  it('flags an informational query landing on a product page', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('how to brew assam tea', { impressions: 200, clicks: 5, ctr: 0.025, position: 9 })] }),
    );
    const finding = out.opportunities.find((o) => o.type === 'type-compatibility-mismatch')!;
    expect(finding.evidence[0].facts).toMatchObject({ intent: 'HOW_TO', pageType: 'product' });
  });

  it('does not flag the same query on a blog page', () => {
    const out = detectOpportunities(
      input({
        page: page({ pageType: 'blog' as PageType, normalizedUrl: `${BASE}/blog/brewing/` }),
        gscRows: [row('how to brew assam tea', { impressions: 200, clicks: 5, ctr: 0.025, position: 9 })],
      }),
    );
    expect(typesOf(out)).not.toContain('type-compatibility-mismatch');
  });

  it('does not flag a transactional query on a product page', () => {
    const out = detectOpportunities(
      input({ gscRows: [row('buy assam ctc tea online', { impressions: 200, clicks: 8, ctr: 0.04, position: 7 })] }),
    );
    expect(typesOf(out)).not.toContain('type-compatibility-mismatch');
  });

  it('has NO OPINION when the compatibility table has no entry for the intent', () => {
    // A branded/navigational query is excluded before the table is consulted.
    const out = detectOpportunities(
      input({ gscRows: [row('rajhans', { impressions: 400, clicks: 100, ctr: 0.25, position: 1 })] }),
    );
    expect(typesOf(out)).not.toContain('type-compatibility-mismatch');
  });
});

describe('cannibalization', () => {
  const OTHER = `${BASE}/catalog/kadak-and-strong/`;
  const competing: QueryPageMetric[] = [
    { query: 'kadak chai', page: URL, normalizedUrl: URL, clicks: 4, impressions: 120, ctr: 0.033, position: 8 },
    { query: 'kadak chai', page: OTHER, normalizedUrl: OTHER, clicks: 3, impressions: 100, ctr: 0.03, position: 11 },
  ];

  it('fires on both competing pages and names the other URL', () => {
    const out = detectOpportunities(input({ gscRows: [competing[0]], allGscRows: competing }));
    const finding = out.opportunities.find((o) => o.type === 'suspected-query-cannibalization')!;
    expect(finding.explanation).toContain(OTHER);
    expect(finding.affectedQueries).toEqual(['kadak chai']);
    // Query-scoped discriminator keeps the two findings independently reviewable.
    expect(finding.discriminator).toBe(`${URL}::cannibalization::kadak chai`);
  });

  it('ignores a trivial secondary appearance below the existing share floor', () => {
    const trivial: QueryPageMetric[] = [
      { ...competing[0], impressions: 500 },
      { ...competing[1], impressions: 8 },
    ];
    const out = detectOpportunities(input({ gscRows: [trivial[0]], allGscRows: trivial }));
    expect(typesOf(out)).not.toContain('suspected-query-cannibalization');
  });

  it('does not fire on a page that is not one of the competitors', () => {
    const elsewhere = page({ normalizedUrl: `${BASE}/page/about-us/`, pageType: 'static' as PageType });
    const out = detectOpportunities(input({ page: elsewhere, gscRows: [], allGscRows: competing }));
    expect(typesOf(out)).not.toContain('suspected-query-cannibalization');
  });
});

describe('market evidence', () => {
  it('records absence and still completes the analysis', () => {
    const out = detectOpportunities(input({ gscRows: [row('assam ctc', { impressions: 400, position: 6, ctr: 0.004, clicks: 2 })] }));
    expect(reasonsOf(out)).toContain('market_no_mapped_keywords');
    expect(typesOf(out)).toContain('high-impression-low-ctr'); // GSC findings unaffected
  });

  it('marks stale market evidence and never refreshes it', () => {
    const out = detectOpportunities(
      input({
        marketEvidence: emptyMarket({
          known: true,
          freshness: 'too-old',
          keywords: [
            {
              keyword: 'assam ctc tea',
              normalizedKeyword: 'assam ctc tea',
              searchVolume: 500,
              volumeKnown: true,
              businessRelevanceBand: 'high',
              commercialIntentBand: 'medium',
              capturedAt: new Date('2025-01-01T00:00:00Z'),
              freshness: 'too-old',
            },
          ],
          keywordCount: 1,
          serpSnapshotAt: null,
        }),
        gscRows: [row('assam ctc', { impressions: 400, position: 6, ctr: 0.004, clicks: 2 })],
      }),
    );
    expect(reasonsOf(out)).toContain('market_evidence_too_old');
    expect(reasonsOf(out)).toContain('serp_evidence_absent');
    expect(typesOf(out)).toContain('high-impression-low-ctr');
  });
});

describe('stale audit run', () => {
  it('downgrades state-derived confidence by one level and says why', () => {
    const fresh = detectOpportunities(input({ state: state({ wordCount: 40 }) }));
    const stale = detectOpportunities(
      input({
        state: state({ wordCount: 40 }),
        auditRun: { runId: 'r', runAt: new Date('2026-06-01T00:00:00Z'), stale: true, ageDays: 90 },
      }),
    );
    expect(fresh.opportunities.find((o) => o.type === 'thin-content')!.evidenceStrength).toBe('high');
    expect(stale.opportunities.find((o) => o.type === 'thin-content')!.evidenceStrength).toBe('medium');
    expect(reasonsOf(stale)).toContain('audit_run_stale');
  });
});

describe('no snapshot at all', () => {
  it('suppresses every state-derived detector and reports insufficient evidence', () => {
    const out = detectOpportunities(input({ state: null }));
    expect(typesOf(out)).toEqual(['insufficient-evidence']);
    expect(reasonsOf(out)).toContain('no_audit_snapshot');
  });
});

describe('determinism and invariants', () => {
  const rich = () =>
    input({
      state: state({ wordCount: 90, internalLinks: { outboundCount: 2, inboundCount: 0, outboundTargets: [] } }),
      gscRows: [
        row('assam ctc tea', { impressions: 900, clicks: 4, ctr: 0.0044, position: 6.2 }),
        row('how to brew assam tea', { impressions: 200, clicks: 5, ctr: 0.025, position: 9 }),
      ],
    });

  it('produces identical, identically-ordered output for identical input', () => {
    expect(detectOpportunities(rich())).toEqual(detectOpportunities(rich()));
  });

  it('gives every opportunity at least one piece of supporting evidence', () => {
    for (const o of detectOpportunities(rich()).opportunities) {
      expect(o.evidence.length).toBeGreaterThan(0);
      expect(o.explanation.length).toBeGreaterThan(0);
    }
  });

  it('keeps discriminators free of timestamps, scores and windows', () => {
    for (const o of detectOpportunities(rich()).opportunities) {
      expect(o.discriminator.startsWith(URL)).toBe(true);
      expect(o.discriminator).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it('never emits insufficient-evidence alongside a real finding', () => {
    const out = detectOpportunities(rich());
    expect(out.opportunities.length).toBeGreaterThan(1);
    expect(typesOf(out)).not.toContain('insufficient-evidence');
  });
});

describe('scoped content word count', () => {
  it('uses scoped normalizedText for thin-content instead of legacy full-document wordCount', () => {
    const scopedText = Array(120).fill('tea').join(' ');
    const out = detectOpportunities(
      input({
        state: state({ wordCount: 800 }),
        normalizedText: scopedText,
      }),
    );

    const finding = out.opportunities.find((o) => o.type === 'thin-content');
    expect(finding).toBeDefined();
    expect(finding!.evidence[0].facts).toMatchObject({
      wordCount: 120,
      threshold: 250,
    });
  });

  it('does not demand an H2 when only the full document is long but scoped page content is short', () => {
    const scopedText = Array(100).fill('tea').join(' ');
    const out = detectOpportunities(
      input({
        state: state({
          h2: [],
          headingOutline: [{ level: 1, text: 'Assam CTC Tea' }],
          wordCount: 900,
        }),
        normalizedText: scopedText,
      }),
    );

    expect(typesOf(out)).not.toContain('heading-structure-opportunity');
  });
});
