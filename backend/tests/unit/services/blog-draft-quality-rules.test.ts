import { evaluateBlogDraftQuality } from '../../../src/modules/seo/ai/blog-draft-quality-rules';
import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from '../../../src/modules/seo/ai/blog-ai.types';

const BASE_URL = 'https://rajhanstea.com';

function makeEvidence(overrides: Partial<BlogContentEvidence> = {}): BlogContentEvidence {
  return {
    product: {
      productId: 'p1',
      name: 'Rajhans Royal Darjeeling',
      slug: 'rajhans-royal-darjeeling',
      region: 'Darjeeling',
      description: 'Rajhans Royal Darjeeling is a light, aromatic black tea grown in the hills of Darjeeling.',
      shortDescription: 'Light and aromatic, from the hills of Darjeeling.',
      bestTakenFor: ['Evening'],
      packOptions: [{ label: '250 gm' }, { label: '500 gm' }],
      url: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
    },
    opportunity: {
      recommendationId: 'topical-authority-gap',
      recommendationType: 'topical-authority',
      entity: 'Darjeeling',
      targetUrl: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
      rationale: 'No educational content exists for Darjeeling tea.',
    },
    existingCorpus: [
      {
        title: 'The Art of Perfect Tea Brewing',
        slug: 'art-of-perfect-tea-brewing',
        url: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`,
        tags: ['brewing'],
        topicSummary: 'Making the perfect cup of tea is an art form.',
        keyIntents: ['brewing'],
      },
    ],
    siteFacts: { baseUrl: BASE_URL },
    ...overrides,
  };
}

function makePlan(overrides: Partial<ArticlePlan> = {}): ArticlePlan {
  return {
    primaryQuestion: 'What is Darjeeling tea?',
    scope: ['origin', 'flavour'],
    topicsAllowed: ['facts from evidence'],
    topicsToAvoid: [],
    allowedLinkTargets: [
      { href: `${BASE_URL}/product/rajhans-royal-darjeeling/`, anchor: 'Rajhans Royal Darjeeling product page' },
      { href: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`, anchor: 'brewing guide' },
    ],
    cannibalizationNotes: [],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<GroundedBlogDraft> = {}): GroundedBlogDraft {
  return {
    status: 'ok',
    title: 'What Is Darjeeling Tea?',
    slug: 'darjeeling-tea-guide',
    metaTitle: 'Darjeeling Tea Guide: Flavour, Origin & Brewing — Rajhans Tea',
    metaDescription: 'Learn about Rajhans Royal Darjeeling\'s light, aromatic character and its Darjeeling origin.',
    h1: 'What Is Darjeeling Tea?',
    contentHtml:
      '<p>Rajhans Royal Darjeeling is a light, aromatic black tea grown in the hills of Darjeeling.</p>' +
      '<h2>Where It Comes From</h2>' +
      '<p>Rajhans Royal Darjeeling comes from the hills of Darjeeling. See <a href="https://rajhanstea.com/blog/art-of-perfect-tea-brewing/">our brewing guide</a> for preparation tips.</p>' +
      '<h2>Choosing Your Pack</h2>' +
      '<p>Rajhans Royal Darjeeling is available in 250 gm and 500 gm packs. See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>',
    proposedLinks: [
      { href: 'https://rajhanstea.com/blog/art-of-perfect-tea-brewing/', anchor: 'our brewing guide' },
      { href: 'https://rajhanstea.com/product/rajhans-royal-darjeeling/', anchor: 'Rajhans Royal Darjeeling product page' },
    ],
    claimsUsed: ['grown in the hills of Darjeeling', 'light, aromatic'],
    unsupportedClaims: [],
    notes: [],
    ...overrides,
  };
}

describe('evaluateBlogDraftQuality', () => {
  it('A: a grounded article passes', () => {
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), makeDraft());
    expect(errors).toEqual([]);
  });

  it('B/C: an unsupported geography/health claim pattern fails', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml + '<p>This tea is rich in antioxidants and boosts immunity.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('unsupported health/scientific claim'))).toBe(true);
  });

  it('E: generic filler is rejected', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml + '<p>This is truly the perfect choice for any tea lover.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('generic filler'))).toBe(true);
  });

  it('F: material repetition is rejected', () => {
    const html =
      '<p>Rajhans Royal Darjeeling comes from the hills of Darjeeling every single season without fail.</p>' +
      '<h2>Section</h2>' +
      '<p>As mentioned, Rajhans Royal Darjeeling comes from the hills of Darjeeling every single season without fail.</p>' +
      '<h2>Second</h2><p>More text here to pad out the body content a little.</p>';
    const draft = makeDraft({ contentHtml: html });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('repeats the same phrase'))).toBe(true);
  });

  it('G: duplicated H1/body heading is rejected', () => {
    const draft = makeDraft({
      contentHtml:
        '<p>Intro paragraph text here about the tea.</p>' +
        '<h2>What Is Darjeeling Tea?</h2>' +
        '<p>Body text about origin and flavour goes here.</p>' +
        '<h2>Choosing Your Pack</h2><p>Pack sizes are 250 gm and 500 gm.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('duplicated as a body heading'))).toBe(true);
  });

  it('H: misleading pack-exclusivity framing is rejected', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml!.replace('is available in 250 gm and 500 gm packs', 'is only available in a 250 gm pack'),
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('exclusive pack size'))).toBe(true);
  });

  it('I: a competing bestTakenFor recommendation is rejected (recommendation-time framing)', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml + '<p>This tea is best enjoyed in the morning as a daily ritual.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('recommends the product for "Morning"'))).toBe(true);
  });

  it('J: an external link is rejected', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml + '<p>Read more at <a href="https://example.com/tea-facts/">this external site</a>.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('external/non-Rajhans URL'))).toBe(true);
  });

  it('K: a link outside the planned allowed set is rejected (destination-intent/relevance mismatch)', () => {
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml + '<p>See our <a href="https://rajhanstea.com/blog/black-tea-health-benefits/">health benefits guide</a>.</p>',
    });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('outside the deterministically planned/allowed link set'))).toBe(true);
  });

  it('L: substantive overlap with an existing post is rejected (cannibalization)', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'The Art of Perfect Tea Brewing',
          slug: 'art-of-perfect-tea-brewing',
          url: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`,
          tags: ['brewing'],
          topicSummary: 'Rajhans Royal Darjeeling comes from the hills of Darjeeling in every meaningful respect',
          keyIntents: ['brewing'],
        },
      ],
    });
    const draft = makeDraft({
      contentHtml: makeDraft().contentHtml!.replace(
        'Rajhans Royal Darjeeling comes from the hills of Darjeeling.',
        'Rajhans Royal Darjeeling comes from the hills of Darjeeling in every meaningful respect.',
      ),
    });
    const errors = evaluateBlogDraftQuality(evidence, makePlan(), draft);
    expect(errors.some((e) => e.includes('substantially overlaps existing post'))).toBe(true);
  });

  it('unsafe HTML (script tag) is rejected', () => {
    const draft = makeDraft({ contentHtml: makeDraft().contentHtml + '<script>alert(1)</script>' });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('Unsafe or malformed article HTML'))).toBe(true);
  });

  it('missing/unreasonable meta title or description is rejected', () => {
    const draft = makeDraft({ metaTitle: 'X', metaDescription: '' });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('metaTitle'))).toBe(true);
    expect(errors.some((e) => e.includes('metaDescription'))).toBe(true);
  });

  it('overtly promotional/sales content is rejected (materially educational rule)', () => {
    const draft = makeDraft({ contentHtml: makeDraft().contentHtml + '<p>Buy now and enjoy a limited time discount on every order.</p>' });
    const errors = evaluateBlogDraftQuality(makeEvidence(), makePlan(), draft);
    expect(errors.some((e) => e.includes('promotional/sales sentence'))).toBe(true);
  });
});
