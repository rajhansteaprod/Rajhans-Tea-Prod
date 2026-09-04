// =============================================================================
// UNIT TESTS — SEO Phase 6.1 pure content extraction / derivation
// No DB, no network, no clock. Everything here is a function of its arguments.
// =============================================================================

import {
  computeTopicCoverage,
  deriveCoverageCandidates,
  deriveFaqPresence,
  describeHeadingStructure,
  describeMetadataLengths,
  isBrandedQuery,
} from '../../../src/modules/seo/content/services/content-extraction';
import { PageContentState } from '../../../src/modules/seo/content/content.types';
import { EXTRACTOR_VERSION } from '../../../src/modules/seo/services/parser.service';

function state(over: Partial<PageContentState> = {}): PageContentState {
  return {
    title: 'Assam CTC Tea — Rajhans Tea',
    titleLength: 27,
    metaDescription: 'Strong, malty everyday chai.',
    metaDescriptionLength: 27,
    h1: ['Assam CTC Tea'],
    h2: ['Brewing', 'Sourcing'],
    h3: [],
    headingOutline: [
      { level: 1, text: 'Assam CTC Tea' },
      { level: 2, text: 'Brewing' },
      { level: 2, text: 'Sourcing' },
    ],
    wordCount: 600,
    contentHash: 'hash',
    normalizedTextChars: 3200,
    normalizedTextTruncated: false,
    faqSignals: { questionHeadings: 0, faqHeadingPresent: false, faqSchemaPresent: false },
    canonical: 'https://rajhanstea.com/product/x/',
    robotsMeta: null,
    indexable: true,
    inSitemap: true,
    structuredDataTypes: ['Product'],
    internalLinks: { outboundCount: 5, inboundCount: 3, outboundTargets: [] },
    captureComplete: true,
    extractorVersion: EXTRACTOR_VERSION,
    ...over,
  };
}

describe('deriveFaqPresence', () => {
  it('returns null when signals were never captured, so the caller reports missing evidence', () => {
    expect(deriveFaqPresence(null)).toBeNull();
  });

  it('treats a single question heading as NOT an FAQ', () => {
    const r = deriveFaqPresence({ questionHeadings: 1, faqHeadingPresent: false, faqSchemaPresent: false });
    expect(r).toEqual({ present: false, reasons: [] });
  });

  it('treats two or more question headings as a pattern', () => {
    const r = deriveFaqPresence({ questionHeadings: 2, faqHeadingPresent: false, faqSchemaPresent: false });
    expect(r!.present).toBe(true);
    expect(r!.reasons).toContain('2 question-shaped headings');
  });

  it('accepts an explicit FAQ heading or FAQPage schema on its own', () => {
    expect(deriveFaqPresence({ questionHeadings: 0, faqHeadingPresent: true, faqSchemaPresent: false })!.present).toBe(true);
    expect(deriveFaqPresence({ questionHeadings: 0, faqHeadingPresent: false, faqSchemaPresent: true })!.present).toBe(true);
  });
});

describe('describeHeadingStructure', () => {
  it('reports known:false for a pre-6.1 snapshot instead of "no headings"', () => {
    const s = describeHeadingStructure(state({ captureComplete: false, h2: [], headingOutline: [] }));
    expect(s.known).toBe(false);
  });

  it('counts levels and detects no skipped levels on a well-formed page', () => {
    const s = describeHeadingStructure(state());
    expect(s).toEqual({ known: true, h1Count: 1, h2Count: 2, h3Count: 0, skipsLevel: false });
  });

  it('detects an H3 appearing before any H2', () => {
    const s = describeHeadingStructure(
      state({
        h2: ['Later'],
        h3: ['Too deep'],
        headingOutline: [
          { level: 1, text: 'Title' },
          { level: 3, text: 'Too deep' },
          { level: 2, text: 'Later' },
        ],
      }),
    );
    expect(s.skipsLevel).toBe(true);
  });
});

describe('isBrandedQuery', () => {
  it('matches brand terms and ignores ordinary product queries', () => {
    expect(isBrandedQuery('rajhans tea')).toBe(true);
    expect(isBrandedQuery('buy rajhans online')).toBe(true);
    expect(isBrandedQuery('assam ctc tea')).toBe(false);
    expect(isBrandedQuery('best kadak chai')).toBe(false);
  });
});

describe('deriveCoverageCandidates — anti-keyword-stuffing guardrails', () => {
  it('requires a real demand signal above the impression floor', () => {
    const belowFloor = deriveCoverageCandidates({
      queries: [{ query: 'darjeeling tea', impressions: 5 }],
      marketKeywords: [],
    });
    expect(belowFloor).toEqual([]);

    const aboveFloor = deriveCoverageCandidates({
      queries: [{ query: 'darjeeling tea', impressions: 200 }],
      marketKeywords: [],
    });
    expect(aboveFloor.map((c) => c.term)).toContain('darjeeling');
  });

  it('never treats an UNKNOWN market volume as demand', () => {
    const out = deriveCoverageCandidates({
      queries: [],
      marketKeywords: [{ keyword: 'nilgiri tea', searchVolume: null }],
    });
    expect(out).toEqual([]);
  });

  it('drops generic entity terms so "tea" can never become a coverage finding', () => {
    const out = deriveCoverageCandidates({ queries: [{ query: 'tea', impressions: 5000 }], marketKeywords: [] });
    expect(out.map((c) => c.term)).not.toContain('tea');
  });

  it('excludes branded queries — brand demand says nothing about topical coverage', () => {
    const out = deriveCoverageCandidates({ queries: [{ query: 'rajhans tea', impressions: 900 }], marketKeywords: [] });
    expect(out).toEqual([]);
  });

  it('keeps the strongest demand signal per term and orders deterministically', () => {
    const out = deriveCoverageCandidates({
      queries: [
        { query: 'assam tea', impressions: 100 },
        { query: 'assam ctc tea', impressions: 400 },
      ],
      marketKeywords: [],
    });
    const assam = out.find((c) => c.term === 'assam')!;
    expect(assam.demandTerm).toBe('assam ctc tea');
    expect(assam.demandMagnitude).toBe(400);
    // Deterministic ordering: same input, same output, every time.
    expect(deriveCoverageCandidates({ queries: [
      { query: 'assam tea', impressions: 100 },
      { query: 'assam ctc tea', impressions: 400 },
    ], marketKeywords: [] })).toEqual(out);
  });
});

describe('computeTopicCoverage', () => {
  const candidates = deriveCoverageCandidates({
    queries: [
      { query: 'assam ctc tea', impressions: 400 },
      { query: 'darjeeling tea', impressions: 300 },
    ],
    marketKeywords: [],
  });

  it('reports where a term is addressed, preferring title over body', () => {
    const cov = computeTopicCoverage(state(), candidates, 'assam ctc from the finest gardens');
    const assam = cov.find((c) => c.term === 'assam')!;
    expect(assam.covered).toBe(true);
    expect(assam.foundIn).toBe('title');
  });

  it('finds a term in the body when the title and headings do not mention it', () => {
    const cov = computeTopicCoverage(
      state({ title: 'Tea', h1: [], h2: [], h3: [], metaDescription: null }),
      candidates,
      'we also stock darjeeling leaves',
    );
    expect(cov.find((c) => c.term === 'darjeeling')!.foundIn).toBe('body');
  });

  it('marks a demanded term absent from every surface as not covered', () => {
    const cov = computeTopicCoverage(
      state({ title: 'Assam CTC Tea', h1: ['Assam CTC Tea'], h2: [], h3: [], metaDescription: null }),
      candidates,
      'strong malty everyday chai',
    );
    expect(cov.find((c) => c.term === 'darjeeling')).toMatchObject({ covered: false, foundIn: null });
  });

  it('is a PRESENCE test — one mention is as covered as many', () => {
    const once = computeTopicCoverage(state({ title: null, h1: [], h2: [], h3: [], metaDescription: null }), candidates, 'assam');
    const many = computeTopicCoverage(state({ title: null, h1: [], h2: [], h3: [], metaDescription: null }), candidates, 'assam assam assam assam');
    expect(once.find((c) => c.term === 'assam')).toEqual(many.find((c) => c.term === 'assam'));
  });

  it('matches on word boundaries, not substrings', () => {
    const cov = computeTopicCoverage(
      state({ title: null, h1: [], h2: [], h3: [], metaDescription: null }),
      candidates,
      'assamese literature',
    );
    expect(cov.find((c) => c.term === 'assam')!.covered).toBe(false);
  });
});

describe('describeMetadataLengths', () => {
  it('distinguishes a missing value from an empty one', () => {
    expect(describeMetadataLengths(state({ title: null }))).toMatchObject({ titleLength: null, titleMissing: true });
    expect(describeMetadataLengths(state({ title: '   ' }))).toMatchObject({ titleLength: 0, titleMissing: true });
  });

  it('measures the rendered value the audit observed', () => {
    const f = describeMetadataLengths(state({ title: 'Assam CTC Tea — Rajhans Tea' }));
    expect(f.titleLength).toBe(27);
    expect(f.titleMissing).toBe(false);
  });
});
