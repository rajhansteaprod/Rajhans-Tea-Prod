// =============================================================================
// UNIT TESTS — SEO Phase 3A recommendation generators + scoring
// Pure over audit output (issues + snapshots + inbound graph). No DB / network.
// =============================================================================

import {
  recommendDuplicateMetadata,
  recommendInternalLinking,
  recommendThinContent,
  recommendMissingSchema,
  recommendIndexability,
  recommendTopicalAuthority,
  generateDrafts,
  RecoContext,
} from '../../../src/modules/seo/services/recommendation.generators';
import { scoreRecommendation, classifyUrl } from '../../../src/modules/seo/services/recommendation.scoring';
import { DetectedIssue, PageObservation } from '../../../src/modules/seo/seo.types';
import { normalizeUrl, fingerprint } from '../../../src/modules/seo/seo.util';

const BASE = 'https://rajhanstea.com';
const abs = (p: string) => normalizeUrl(`${BASE}${p}`);

function page(path: string, over: Partial<PageObservation> = {}): PageObservation {
  const url = `${BASE}${path}`;
  const normalizedUrl = normalizeUrl(url);
  return {
    url, normalizedUrl, fetched: true, transientFailure: false, httpStatus: 200,
    redirectChain: [], finalUrl: url, finalStatus: 200, title: 'Title', metaDescription: 'Desc that is reasonably long enough here.',
    robotsMeta: null, canonical: normalizedUrl, h1: ['H1'], imagesTotal: 0, imagesMissingAlt: 0,
    internalLinks: [], internalLinkDetails: [], images: [], structuredDataTypes: [], wordCount: 800,
    contentHash: 'h', inSitemap: true, fetchError: null, ...over,
  };
}

function issue(checkId: string, path: string, extra: Record<string, unknown> = {}, actual: unknown = null): DetectedIssue {
  return {
    checkId, severity: 'warning', url: `${BASE}${path}`, normalizedUrl: abs(path),
    explanation: '', evidence: { actual, expected: null, extra }, automationLevel: 'observe', discriminator: '',
  };
}

const ctx = (over: Partial<RecoContext> = {}): RecoContext => ({
  baseUrl: BASE, detected: [], observations: [], inbound: new Map(), ...over,
});

// -----------------------------------------------------------------------------
describe('scoring engine', () => {
  it('classifies URL types', () => {
    expect(classifyUrl(abs('/'), BASE)).toBe('homepage');
    expect(classifyUrl(abs('/product/x/'), BASE)).toBe('product');
    expect(classifyUrl(abs('/catalog/x/'), BASE)).toBe('category');
    expect(classifyUrl(abs('/blog/x/'), BASE)).toBe('blog');
    expect(classifyUrl(abs('/page/faq/'), BASE)).toBe('other');
  });

  it('homepage + multiple + duplicate-metadata → high priority / high impact', () => {
    const r = scoreRecommendation([abs('/'), abs('/tea-finder/')], BASE, { isDuplicateMetadata: true });
    expect(r.score).toBe(30 + 10 + 15); // 55
    expect(r.priority).toBe('high');
    expect(r.impact).toBe('high');
  });

  it('a single non-priority URL → low priority', () => {
    const r = scoreRecommendation([abs('/page/faq/')], BASE, {});
    expect(r.score).toBe(0);
    expect(r.priority).toBe('low');
    expect(r.impact).toBe('low');
  });

  it('indexability issue weight lifts priority', () => {
    const r = scoreRecommendation([abs('/product/x/')], BASE, { isIndexability: true });
    expect(r.score).toBe(20 + 25); // product + indexability = 45
    expect(r.priority).toBe('medium');
  });
});

// -----------------------------------------------------------------------------
describe('duplicate-metadata (multiple issues → one grouped recommendation)', () => {
  it('merges duplicate-title + duplicate-description into a single recommendation', () => {
    const detected = [
      issue('duplicate-title', '/', { sharedValue: 'Shared Title' }, 'Shared Title'),
      issue('duplicate-title', '/tea-finder/', { sharedValue: 'Shared Title' }, 'Shared Title'),
      issue('duplicate-description', '/', { sharedValue: 'Shared Desc' }, 'Shared Desc'),
      issue('duplicate-description', '/contact/', { sharedValue: 'Shared Desc' }, 'Shared Desc'),
    ];
    const recs = recommendDuplicateMetadata(ctx({ detected }));
    expect(recs).toHaveLength(1);
    expect(recs[0].recommendationId).toBe('duplicate-metadata');
    expect(recs[0].category).toBe('metadata');
    expect(recs[0].affectedUrls).toEqual([abs('/'), abs('/contact/'), abs('/tea-finder/')]);
    expect(recs[0].relatedCheckIds).toEqual(['duplicate-title', 'duplicate-description']);
    expect(recs[0].signals.isDuplicateMetadata).toBe(true);
  });

  it('produces nothing when there are no duplicate-metadata issues (→ resolves)', () => {
    expect(recommendDuplicateMetadata(ctx({ detected: [] }))).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('internal-linking', () => {
  it('recommends adding links for orphan pages', () => {
    const detected = [issue('orphan-page', '/catalog/lonely/')];
    const recs = recommendInternalLinking(ctx({ detected }));
    const orphan = recs.find((r) => r.recommendationId === 'link-orphan-pages');
    expect(orphan?.affectedUrls).toEqual([abs('/catalog/lonely/')]);
  });

  it('recommends replacing redirecting links and reports the total link count', () => {
    const detected = [
      issue('internal-link-to-redirect', '/products/', { affectedLinks: 23, affectedSourcePages: 23 }),
      issue('internal-link-to-redirect', '/blog/', { affectedLinks: 5, affectedSourcePages: 5 }),
    ];
    const rec = recommendInternalLinking(ctx({ detected })).find((r) => r.recommendationId === 'fix-redirecting-links');
    expect(rec?.evidence.totalAffectedLinks).toBe(28);
    expect(rec?.affectedUrls).toEqual([abs('/blog/'), abs('/products/')]);
  });

  it('recommends boosting pages with low (but non-zero) inbound links', () => {
    const obs = [page('/catalog/kadak/'), page('/products/')];
    const inbound = new Map([[abs('/catalog/kadak/'), 1], [abs('/products/'), 12]]);
    const rec = recommendInternalLinking(ctx({ observations: obs, inbound })).find((r) => r.recommendationId === 'boost-low-inbound-pages');
    expect(rec?.affectedUrls).toEqual([abs('/catalog/kadak/')]); // /products/ has plenty
  });
});

// -----------------------------------------------------------------------------
describe('thin-content', () => {
  it('flags a low-word-count content page and excludes policy/utility pages', () => {
    const obs = [
      page('/product/thin-tea/', { wordCount: 90 }), // thin product page
      page('/page/shipping-policy/', { wordCount: 40 }), // excluded (policy)
      page('/contact/', { wordCount: 30 }), // excluded (contact)
      page('/product/rich/', { wordCount: 900 }), // fine
    ];
    const recs = recommendThinContent(ctx({ observations: obs }));
    expect(recs).toHaveLength(1);
    expect(recs[0].affectedUrls).toEqual([abs('/product/thin-tea/')]);
  });

  it('does not flag listing/home pages that are legitimately short', () => {
    const obs = [page('/', { wordCount: 50 }), page('/products/', { wordCount: 40 }), page('/blog/', { wordCount: 30 })];
    expect(recommendThinContent(ctx({ observations: obs }))).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('missing-schema', () => {
  it('recommends Organization schema when the homepage lacks it', () => {
    const obs = [page('/', { structuredDataTypes: [] })];
    const recs = recommendMissingSchema(ctx({ observations: obs }));
    expect(recs.map((r) => r.recommendationId)).toContain('add-organization-schema');
  });

  it('does not recommend a schema type that is already present', () => {
    const obs = [
      page('/', { structuredDataTypes: ['Organization', 'WebSite'] }),
      page('/product/x/', { structuredDataTypes: ['Product', 'BreadcrumbList'] }),
    ];
    const ids = recommendMissingSchema(ctx({ observations: obs })).map((r) => r.recommendationId);
    expect(ids).not.toContain('add-organization-schema');
    expect(ids).not.toContain('product-schema-completeness');
    expect(ids).not.toContain('add-breadcrumb-schema');
  });

  it('recommends breadcrumb + article schema where missing', () => {
    const obs = [
      page('/catalog/kadak/', { structuredDataTypes: [] }),
      page('/blog/my-post/', { structuredDataTypes: [] }),
    ];
    const ids = recommendMissingSchema(ctx({ observations: obs })).map((r) => r.recommendationId);
    expect(ids).toContain('add-breadcrumb-schema');
    expect(ids).toContain('add-article-schema');
  });
});

// -----------------------------------------------------------------------------
describe('indexability (multiple risks on one page → one recommendation)', () => {
  it('recommends only when a page has ≥2 indexing risks, keyed per URL', () => {
    const detected = [
      issue('canonical-not-self', '/product/x/'),
      issue('orphan-page', '/product/x/'),
      issue('orphan-page', '/product/y/'), // single risk → no rec
    ];
    const recs = recommendIndexability(ctx({ detected }));
    expect(recs).toHaveLength(1);
    expect(recs[0].discriminator).toBe(abs('/product/x/'));
    expect(recs[0].signals.isIndexability).toBe(true);
    expect((recs[0].relatedCheckIds ?? []).sort()).toEqual(['canonical-not-self', 'orphan-page']);
  });
});

// -----------------------------------------------------------------------------
describe('topical-authority (inventory-only gaps)', () => {
  it('flags a tea type the store sells but has no article for', () => {
    const obs = [
      page('/product/rajhans-royal-assam/', { title: 'Rajhans Royal Assam' }),
      page('/blog/art-of-brewing/', { title: 'The Art of Brewing' }), // not about Assam
    ];
    const recs = recommendTopicalAuthority(ctx({ observations: obs }));
    const assam = recs.find((r) => r.discriminator === 'assam');
    expect(assam?.title).toContain('No educational content');
    expect(assam?.affectedUrls).toEqual([abs('/product/rajhans-royal-assam/')]);
  });

  it('does not flag a tea type with adequate article coverage', () => {
    const obs = [
      page('/product/rajhans-premium-nilgiri/', { title: 'Rajhans Premium Nilgiri' }),
      page('/blog/nilgiri-guide/', { title: 'Nilgiri Buying Guide' }),
      page('/blog/nilgiri-brewing/', { title: 'Brewing Nilgiri Tea' }),
    ];
    const recs = recommendTopicalAuthority(ctx({ observations: obs }));
    expect(recs.find((r) => r.discriminator === 'nilgiri')).toBeUndefined();
  });

  it('does not flag a tea type the store does not sell', () => {
    const obs = [page('/product/rajhans-royal-assam/', { title: 'Rajhans Royal Assam' })];
    const recs = recommendTopicalAuthority(ctx({ observations: obs }));
    expect(recs.find((r) => r.discriminator === 'darjeeling')).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
describe('persistence identity (deterministic fingerprints across runs)', () => {
  const recoFp = (id: string, disc = '') => fingerprint(id, 'reco', disc);

  it('the same audit output yields identical drafts (stable ids) → open→open', () => {
    const detected = [issue('duplicate-title', '/', { sharedValue: 'X' }), issue('duplicate-title', '/a/', { sharedValue: 'X' })];
    const run1 = generateDrafts(ctx({ detected }));
    const run2 = generateDrafts(ctx({ detected }));
    const key = (d: (typeof run1)[number]) => recoFp(d.recommendationId, d.discriminator ?? '');
    expect(run1.map(key)).toEqual(run2.map(key));
  });

  it('per-URL indexability recs get distinct, stable fingerprints', () => {
    const detected = [
      issue('canonical-not-self', '/a/'), issue('orphan-page', '/a/'),
      issue('canonical-not-self', '/b/'), issue('orphan-page', '/b/'),
    ];
    const recs = recommendIndexability(ctx({ detected }));
    const fps = recs.map((r) => recoFp(r.recommendationId, r.discriminator ?? ''));
    expect(new Set(fps).size).toBe(2);
  });
});
