import { buildRelevanceModel } from '../../../src/modules/seo/market/relevance.taxonomy';

function chain(result: unknown) {
  return { select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(result) }) }) };
}

jest.mock('../../../src/modules/catalog/models/product.model', () => ({
  Product: { find: jest.fn(() => chain([{ slug: 'royal-assam', name: 'Rajhans Royal Assam' }])) },
}));
jest.mock('../../../src/modules/catalog/models/category.model', () => ({
  Category: { find: jest.fn(() => chain([{ slug: 'kadak-strong', name: 'Kadak & Strong' }])) },
}));
jest.mock('../../../src/modules/cms/models/blog.model', () => ({
  Blog: { find: jest.fn(() => chain([{ slug: 'ctc-guide', title: 'What is CTC tea' }])) },
}));
jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: { find: jest.fn(() => chain([{ slug: 'about-us', title: 'About Us' }])) },
}));
jest.mock('../../../src/modules/seo/models/seo-issue.model', () => ({
  SeoIssue: { find: jest.fn(() => chain([])) },
}));

const mockFacts = new Map<string, { inSnapshot: boolean; title: string | null; wordCount: number }>();
jest.mock('../../../src/modules/seo/services/gsc.sync.service', () => ({
  buildSeoContext: jest.fn(async () => ({ canonicalSet: new Set(Array.from(mockFacts.keys())), facts: mockFacts })),
}));

import { buildPageCandidates } from '../../../src/modules/seo/market/services/page-candidate.builder';
import { seoConfig } from '../../../src/modules/seo/seo.config';
import { normalizeUrl } from '../../../src/modules/seo/seo.util';

const taxonomy = buildRelevanceModel([{ name: 'Rajhans Royal Assam' }, { name: 'Kadak & Strong' }]);

beforeEach(() => {
  mockFacts.clear();
});

describe('buildPageCandidates', () => {
  it('builds product/category/blog/static/home candidates with correct pageType and URL', async () => {
    const candidates = await buildPageCandidates(taxonomy);
    const byType = Object.fromEntries(candidates.map((c) => [c.pageType, c]));
    expect(byType.product.url).toBe(normalizeUrl(`${seoConfig.baseUrl}/product/royal-assam/`));
    expect(byType.category.url).toBe(normalizeUrl(`${seoConfig.baseUrl}/catalog/kadak-strong/`));
    expect(byType.blog.url).toBe(normalizeUrl(`${seoConfig.baseUrl}/blog/ctc-guide/`));
    expect(byType.static.url).toBe(normalizeUrl(`${seoConfig.baseUrl}/page/about-us/`));
    expect(byType.home.url).toBe(normalizeUrl(`${seoConfig.baseUrl}/`));
  });

  it('never produces a collection candidate', async () => {
    const candidates = await buildPageCandidates(taxonomy);
    expect(candidates.some((c) => (c.pageType as string) === 'collection')).toBe(false);
  });

  it('derives pageHealth UNKNOWN when no snapshot exists for the URL', async () => {
    const candidates = await buildPageCandidates(taxonomy);
    const product = candidates.find((c) => c.pageType === 'product')!;
    expect(product.pageHealth).toBe('UNKNOWN');
    expect(product.indexable).toBe(false);
  });

  it('derives pageHealth GOOD when a healthy snapshot exists', async () => {
    const url = normalizeUrl(`${seoConfig.baseUrl}/product/royal-assam/`);
    mockFacts.set(url, { inSnapshot: true, title: 'Rajhans Royal Assam', wordCount: 1200 });
    const candidates = await buildPageCandidates(taxonomy);
    const product = candidates.find((c) => c.pageType === 'product')!;
    expect(product.pageHealth).toBe('GOOD');
    expect(product.indexable).toBe(true);
  });

  it('derives pageHealth NEEDS_OPT for a thin page', async () => {
    const url = normalizeUrl(`${seoConfig.baseUrl}/product/royal-assam/`);
    mockFacts.set(url, { inSnapshot: true, title: 'Rajhans Royal Assam', wordCount: 50 });
    const candidates = await buildPageCandidates(taxonomy);
    const product = candidates.find((c) => c.pageType === 'product')!;
    expect(product.pageHealth).toBe('NEEDS_OPT');
  });

  it('extracts anchors via the shared anchorTermsOf (region + brand entity, sorted)', async () => {
    const candidates = await buildPageCandidates(taxonomy);
    const product = candidates.find((c) => c.pageType === 'product')!;
    // strongest() keeps the first equal-weight rajhansEntity match ('rajhans'),
    // not the more specific inventory-appended term — existing 4b.1 behavior,
    // unchanged here; see url-mapper.ts's navigational-routing comment.
    expect(product.anchors).toEqual(['assam', 'rajhans']);
  });

  it('anchors/normalizedTerms are sorted plain arrays, not Sets', async () => {
    const candidates = await buildPageCandidates(taxonomy);
    for (const c of candidates) {
      expect(Array.isArray(c.anchors)).toBe(true);
      expect(Array.isArray(c.normalizedTerms)).toBe(true);
      expect([...c.anchors].sort()).toEqual(c.anchors);
    }
  });
});
