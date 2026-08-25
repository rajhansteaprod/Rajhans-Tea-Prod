// =============================================================================
// UNIT TESTS — SEO Phase 2b cross-page checks
// Pure detection over collected run data. No DB, no network (fetch is injected).
// =============================================================================

import {
  normalizeText,
  isGenericAlt,
  buildInboundCounts,
  resolveLinkTargets,
  runCrossPageRules,
} from '../../../src/modules/seo/services/crosspage.service';
import { AuditContext, FetchResultLike, LinkResolution, PageObservation } from '../../../src/modules/seo/seo.types';
import { fingerprint, normalizeUrl } from '../../../src/modules/seo/seo.util';

const BASE = 'https://rajhanstea.com';
const abs = (p: string) => normalizeUrl(`${BASE}${p}`);

/** Build a fully-formed, indexable 200 HTML observation; override any field. */
function page(path: string, over: Partial<PageObservation> = {}): PageObservation {
  const url = `${BASE}${path}`;
  const normalizedUrl = normalizeUrl(url);
  return {
    url,
    normalizedUrl,
    fetched: true,
    transientFailure: false,
    httpStatus: 200,
    redirectChain: [],
    finalUrl: url,
    finalStatus: 200,
    title: 'Default Title',
    metaDescription: 'A sufficiently long meta description for testing purposes here.',
    robotsMeta: null,
    canonical: normalizedUrl, // self-canonical by default
    h1: ['Heading'],
    imagesTotal: 0,
    imagesMissingAlt: 0,
    internalLinks: [],
    internalLinkDetails: [],
    images: [],
    structuredDataTypes: [],
    wordCount: 100,
    contentHash: 'hash',
    inSitemap: true,
    fetchError: null,
    ...over,
  };
}

function ctxOf(observations: PageObservation[]): AuditContext {
  const pagesByNormalizedUrl = new Map<string, PageObservation>();
  for (const o of observations) pagesByNormalizedUrl.set(o.normalizedUrl, o);
  return { baseUrl: BASE, sitemapUrls: new Set(), robotsAccessible: true, pagesByNormalizedUrl };
}

/** Run the cross-page rules with an explicit resolution map. */
function run(observations: PageObservation[], resolutions: Map<string, LinkResolution> = new Map()) {
  return runCrossPageRules(observations, ctxOf(observations), resolutions);
}
const byCheck = (issues: ReturnType<typeof run>, id: string) => issues.filter((i) => i.checkId === id);

// A link detail + a matching resolution helper.
function res(target: string, over: Partial<LinkResolution> = {}): LinkResolution {
  return {
    target: abs(target),
    finalUrl: `${BASE}${target}`,
    finalNormalizedUrl: abs(target),
    finalStatus: 200,
    redirectChain: [],
    redirects: false,
    transient: false,
    finalCanonicalUrl: null,
    ...over,
  };
}
const link = (path: string, anchor = 'go') => ({ href: path, target: abs(path), anchor });

// -----------------------------------------------------------------------------
describe('normalizeText', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeText('  Hello   World ')).toBe('hello world');
    expect(normalizeText('Hello World')).toBe(normalizeText('hello   world'));
  });
  it('treats null/empty as empty', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

// -----------------------------------------------------------------------------
describe('isGenericAlt', () => {
  it('flags generic filler words', () => {
    for (const w of ['image', 'IMG', 'Photo', 'picture', 'product', 'banner', 'logo', 'icon']) {
      expect(isGenericAlt(w)).toBeTruthy();
    }
  });
  it('flags numbered/camera/filename patterns', () => {
    expect(isGenericAlt('image1')).toBeTruthy();
    expect(isGenericAlt('image-1')).toBeTruthy();
    expect(isGenericAlt('IMG_1234')).toBeTruthy();
    expect(isGenericAlt('DSC01234')).toBeTruthy();
    expect(isGenericAlt('product.jpg')).toBeTruthy();
  });
  it('flags alt that equals the image filename', () => {
    expect(isGenericAlt('nilgiri-tea', 'https://cdn.x.com/media/nilgiri-tea.jpg')).toBeTruthy();
  });
  it('does NOT flag legitimate brand/product names, even short ones', () => {
    expect(isGenericAlt('Tea')).toBeNull();
    expect(isGenericAlt('Rajhans Premium Nilgiri Tea')).toBeNull();
    expect(isGenericAlt('Assam CTC — 250g pack')).toBeNull();
    expect(isGenericAlt('')).toBeNull(); // empty is a different check
  });
});

// -----------------------------------------------------------------------------
describe('duplicate-title / duplicate-description', () => {
  it('flags every URL sharing a normalized title, grouped', () => {
    const pages = [
      page('/product/a/', { title: 'Rajhans Premium Tea' }),
      page('/product/b/', { title: '  rajhans   premium tea ' }), // same after normalization
      page('/product/c/', { title: 'Something Unique' }),
    ];
    const dup = byCheck(run(pages), 'duplicate-title');
    expect(dup).toHaveLength(2);
    const urls = dup.map((d) => d.normalizedUrl).sort();
    expect(urls).toEqual([abs('/product/a/'), abs('/product/b/')]);
    // group evidence lists both affected URLs
    expect(dup[0].evidence.extra?.duplicateUrls).toEqual([abs('/product/a/'), abs('/product/b/')]);
  });

  it('ignores empty titles (handled by missing-title)', () => {
    const pages = [page('/x/', { title: null }), page('/y/', { title: '' })];
    expect(byCheck(run(pages), 'duplicate-title')).toHaveLength(0);
  });

  it('does not flag intentional duplicates that canonicalize elsewhere', () => {
    const pages = [
      page('/product/a/', { title: 'Same' }),
      page('/product/a-variant/', { title: 'Same', canonical: abs('/product/a/') }), // points away → intentional
    ];
    expect(byCheck(run(pages), 'duplicate-title')).toHaveLength(0);
  });

  it('flags duplicate descriptions with whitespace/case normalized', () => {
    const pages = [
      page('/x/', { metaDescription: 'Buy the best tea online today.' }),
      page('/y/', { metaDescription: 'buy the BEST tea   online today.' }),
    ];
    expect(byCheck(run(pages), 'duplicate-description')).toHaveLength(2);
  });

  it('does NOT cluster a REDIRECTING URL as a phantom duplicate of its destination', () => {
    // Legacy /page/return-refund/ 301s to the canonical, which shares its content.
    const canonical = page('/page/return-refund-policy/', { title: 'Refund & Returns Policy — Rajhans Tea' });
    const legacy = page('/page/return-refund/', {
      title: 'Refund & Returns Policy — Rajhans Tea', // observed via the redirect
      finalUrl: `${BASE}/page/return-refund-policy/`,
      canonical: abs('/page/return-refund-policy/'),
      redirectChain: [{ url: `${BASE}/page/return-refund/`, status: 301 }],
    });
    expect(byCheck(run([canonical, legacy]), 'duplicate-title')).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('broken-internal-link', () => {
  it('flags a link resolving to 404', () => {
    const src = page('/products/', { internalLinkDetails: [link('/product/missing/', 'Missing')] });
    const resolutions = new Map([[abs('/product/missing/'), res('/product/missing/', { finalStatus: 404 })]]);
    const found = byCheck(run([src], resolutions), 'broken-internal-link');
    expect(found).toHaveLength(1);
    expect(found[0].normalizedUrl).toBe(abs('/products/'));
    expect(found[0].evidence.extra?.target).toBe(abs('/product/missing/'));
    expect(found[0].evidence.actual).toBe(404);
  });

  it('never flags transient (5xx/network) targets as broken', () => {
    const src = page('/products/', { internalLinkDetails: [link('/product/flaky/')] });
    const resolutions = new Map([[abs('/product/flaky/'), res('/product/flaky/', { finalStatus: null, transient: true })]]);
    expect(byCheck(run([src], resolutions), 'broken-internal-link')).toHaveLength(0);
  });

  it('skips asset / api / mailto targets', () => {
    const src = page('/x/', {
      internalLinkDetails: [
        { href: '/api/v1/thing', target: abs('/api/v1/thing'), anchor: 'api' },
        { href: '/logo.png', target: abs('/logo.png'), anchor: 'img' },
      ],
    });
    const resolutions = new Map([
      [abs('/api/v1/thing'), res('/api/v1/thing', { finalStatus: 404 })],
      [abs('/logo.png'), res('/logo.png', { finalStatus: 404 })],
    ]);
    expect(byCheck(run([src], resolutions), 'broken-internal-link')).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('internal-link-to-redirect (grouped reporting)', () => {
  // Build a redirect resolution: target 301s to its trailing-slash canonical.
  const redirectRes = (target: string, finalPath: string, chain?: { url: string; status: number }[]): LinkResolution =>
    res(target, {
      finalUrl: `${BASE}${finalPath}`,
      finalNormalizedUrl: abs(finalPath),
      finalStatus: 200,
      redirectChain: chain ?? [{ url: `${BASE}${target}`, status: 301 }],
      redirects: true,
    });

  it('does NOT flag a link that already points to the canonical 200 URL', () => {
    const src = page('/products/', { internalLinkDetails: [link('/product/foo/')] });
    const resolutions = new Map([[abs('/product/foo/'), res('/product/foo/')]]);
    expect(byCheck(run([src], resolutions), 'internal-link-to-redirect')).toHaveLength(0);
  });

  it('classifies a redirect that ends in 404 as broken, not redirect', () => {
    const src = page('/x/', { internalLinkDetails: [link('/gone')] });
    const resolutions = new Map([[abs('/gone'), res('/gone', {
      finalStatus: 404,
      redirectChain: [{ url: `${BASE}/gone`, status: 301 }],
      redirects: true,
    })]]);
    const issues = run([src], resolutions);
    expect(byCheck(issues, 'broken-internal-link')).toHaveLength(1);
    expect(byCheck(issues, 'internal-link-to-redirect')).toHaveLength(0);
  });

  // Case A — many sources → the SAME redirect target → ONE grouped finding.
  it('Case A: N sources linking to one redirecting target → one grouped finding', () => {
    const target = page('/products/');
    const srcA = page('/source-a/', { internalLinkDetails: [link('/products')] });
    const srcB = page('/source-b/', { internalLinkDetails: [link('/products')] });
    const srcC = page('/source-c/', { internalLinkDetails: [link('/products')] });
    const resolutions = new Map([[abs('/products'), redirectRes('/products', '/products/')]]);

    const found = byCheck(run([target, srcA, srcB, srcC], resolutions), 'internal-link-to-redirect');
    expect(found).toHaveLength(1);
    expect(found[0].normalizedUrl).toBe(abs('/products/')); // anchored on the canonical destination
    expect(found[0].evidence.extra?.affectedLinks).toBe(3);
    expect(found[0].evidence.extra?.affectedSourcePages).toBe(3);
    expect(found[0].evidence.extra?.uniqueTargets).toEqual([abs('/products')]);
    expect(found[0].evidence.extra?.finalUrl).toBe(abs('/products/'));
  });

  // Case B — different redirect targets → separate grouped findings.
  it('Case B: distinct redirect targets → separate grouped findings', () => {
    const src = page('/home/', { internalLinkDetails: [link('/products'), link('/blog')] });
    const resolutions = new Map([
      [abs('/products'), redirectRes('/products', '/products/')],
      [abs('/blog'), redirectRes('/blog', '/blog/')],
    ]);
    const found = byCheck(run([src], resolutions), 'internal-link-to-redirect');
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.evidence.extra?.finalUrl).sort()).toEqual([abs('/blog/'), abs('/products/')]);
    for (const f of found) expect(f.evidence.extra?.affectedLinks).toBe(1);
  });

  // Case C — no redirect → no finding.
  it('Case C: no redirect → no finding', () => {
    const src = page('/home/', { internalLinkDetails: [link('/products/'), link('/blog/')] });
    const resolutions = new Map([
      [abs('/products/'), res('/products/')],
      [abs('/blog/'), res('/blog/')],
    ]);
    expect(byCheck(run([src], resolutions), 'internal-link-to-redirect')).toHaveLength(0);
  });

  // Case D — redirect chain /foo → /bar → /bar/ → report the final canonical dest.
  it('Case D: multi-hop chain reports the final canonical destination', () => {
    const src = page('/home/', { internalLinkDetails: [link('/foo')] });
    const resolutions = new Map([[abs('/foo'), redirectRes('/foo', '/bar/', [
      { url: `${BASE}/foo`, status: 301 },
      { url: `${BASE}/bar`, status: 301 },
    ])]]);
    const found = byCheck(run([src], resolutions), 'internal-link-to-redirect');
    expect(found).toHaveLength(1);
    expect(found[0].evidence.extra?.finalUrl).toBe(abs('/bar/'));
    expect(String((found[0].evidence.extra?.examples as string[])?.[0])).toContain('/bar/');
  });

  // Case E — deterministic fingerprint across runs (open→open, never re-NEW).
  it('Case E: grouping is fingerprint-stable across runs', () => {
    const src = page('/home/', { internalLinkDetails: [link('/products')] });
    const resolutions = new Map([[abs('/products'), redirectRes('/products', '/products/')]]);
    const r1 = byCheck(run([src], resolutions), 'internal-link-to-redirect');
    const r2 = byCheck(run([src], resolutions), 'internal-link-to-redirect');
    const fp = (i: (typeof r1)[number]) => fingerprint(i.normalizedUrl, i.checkId, i.discriminator ?? '');
    expect(fp(r1[0])).toBe(fp(r2[0]));
    expect(r1[0].discriminator).toBe(''); // grouped by canonical dest, empty discriminator
  });

  // The underlying TRUTH is preserved — affectedLinks still sums to every edge.
  it('preserves the full link count across grouped findings', () => {
    const src1 = page('/a/', { internalLinkDetails: [link('/products'), link('/blog')] });
    const src2 = page('/b/', { internalLinkDetails: [link('/products')] });
    const resolutions = new Map([
      [abs('/products'), redirectRes('/products', '/products/')],
      [abs('/blog'), redirectRes('/blog', '/blog/')],
    ]);
    const found = byCheck(run([src1, src2], resolutions), 'internal-link-to-redirect');
    const totalLinks = found.reduce((n, f) => n + (f.evidence.extra?.affectedLinks as number), 0);
    expect(totalLinks).toBe(3); // 2 edges → /products/, 1 edge → /blog/
  });
});

// -----------------------------------------------------------------------------
describe('orphan-page + inbound counting (trailing-slash aware)', () => {
  it('flags an indexable page with zero inbound links', () => {
    const orphan = page('/catalog/lonely/');
    const other = page('/products/'); // links to nothing
    expect(byCheck(run([orphan, other]), 'orphan-page').map((i) => i.normalizedUrl)).toContain(abs('/catalog/lonely/'));
  });

  it('does NOT flag a page linked via its non-canonical (redirecting) form', () => {
    // /products/ links to /product/foo (no slash) which resolves to /product/foo/.
    const products = page('/products/', { internalLinkDetails: [link('/product/foo')] });
    const target = page('/product/foo/');
    const resolutions = new Map([
      [abs('/product/foo'), res('/product/foo', {
        finalUrl: `${BASE}/product/foo/`,
        finalNormalizedUrl: abs('/product/foo/'),
        redirectChain: [{ url: `${BASE}/product/foo`, status: 301 }],
        redirects: true,
      })],
    ]);
    const orphans = byCheck(run([products, target], resolutions), 'orphan-page').map((i) => i.normalizedUrl);
    expect(orphans).not.toContain(abs('/product/foo/'));
    expect(orphans).toContain(abs('/products/')); // /products/ itself has no inbound
  });

  it('self-links do not count toward inbound', () => {
    const p = page('/x/', { internalLinkDetails: [link('/x/')] }); // links to itself
    const inbound = buildInboundCounts([p], new Map([[abs('/x/'), res('/x/')]]), BASE);
    expect(inbound.get(abs('/x/')) ?? 0).toBe(0);
  });

  it('does not flag pages that canonicalize elsewhere (intentional)', () => {
    const variant = page('/product/a-variant/', { canonical: abs('/product/a/') });
    expect(byCheck(run([variant]), 'orphan-page')).toHaveLength(0);
  });

  // ── query-variant canonical fold (the /contact/ false-positive fix) ──
  it('folds a query-variant inbound link onto its declared canonical → NOT orphan', () => {
    // Footer links /contact?reason=bulk → 301 → /contact/?reason=bulk, canonical /contact/.
    const footerPage = page('/products/', { internalLinkDetails: [link('/contact?reason=bulk', 'Buy in Bulk')] });
    const contact = page('/contact/'); // the canonical page, otherwise unlinked
    const resolutions = new Map([
      [abs('/contact?reason=bulk'), res('/contact?reason=bulk', {
        finalUrl: `${BASE}/contact/?reason=bulk`,
        finalNormalizedUrl: abs('/contact/?reason=bulk'),
        redirectChain: [{ url: `${BASE}/contact?reason=bulk`, status: 301 }],
        redirects: true,
        finalCanonicalUrl: abs('/contact/'), // the query-variant page declares this
      })],
    ]);
    const inbound = buildInboundCounts([footerPage, contact], resolutions, BASE);
    expect(inbound.get(abs('/contact/'))).toBe(1); // attributed to the canonical
    const orphans = byCheck(run([footerPage, contact], resolutions), 'orphan-page').map((i) => i.normalizedUrl);
    expect(orphans).not.toContain(abs('/contact/'));
  });

  it('preserves identity for a self-canonical query URL (no blind query stripping)', () => {
    // /search?q=tea self-canonicalizes → the inbound link must NOT fold onto /search/.
    const src = page('/products/', { internalLinkDetails: [link('/search?q=tea')] });
    const resolutions = new Map([
      [abs('/search?q=tea'), res('/search?q=tea', {
        finalUrl: `${BASE}/search?q=tea`,
        finalNormalizedUrl: abs('/search?q=tea'),
        finalCanonicalUrl: null, // self-canonical ⇒ no fold
      })],
    ]);
    const inbound = buildInboundCounts([src], resolutions, BASE);
    expect(inbound.get(abs('/search?q=tea'))).toBe(1); // identity preserved
    expect(inbound.get(abs('/search/')) ?? 0).toBe(0);
  });

  it('attributes inbound to the target’s declared canonical even when it differs from the source', () => {
    const src = page('/blog/', { internalLinkDetails: [link('/promo?ref=home')] });
    const canonicalPage = page('/products/');
    const resolutions = new Map([
      [abs('/promo?ref=home'), res('/promo?ref=home', {
        finalUrl: `${BASE}/promo?ref=home`,
        finalNormalizedUrl: abs('/promo?ref=home'),
        finalCanonicalUrl: abs('/products/'), // declares a different canonical
      })],
    ]);
    const inbound = buildInboundCounts([src, canonicalPage], resolutions, BASE);
    expect(inbound.get(abs('/products/'))).toBe(1);
  });

  it('resolveLinkTargets reads the declared canonical from a freshly fetched target', async () => {
    const src = page('/products/', { internalLinkDetails: [link('/contact?reason=bulk')] });
    const html = `<html><head><link rel="canonical" href="${BASE}/contact/"></head><body>x</body></html>`;
    const fetchFn = async (): Promise<FetchResultLike> => ({
      finalUrl: `${BASE}/contact/?reason=bulk`,
      finalStatus: 200,
      redirectChain: [{ url: `${BASE}/contact?reason=bulk`, status: 301 }],
      transient: false,
      html,
    });
    const resolutions = await resolveLinkTargets([src], ctxOf([src]).pagesByNormalizedUrl, BASE, fetchFn, 4);
    expect(resolutions.get(abs('/contact?reason=bulk'))?.finalCanonicalUrl).toBe(abs('/contact/'));
  });
});

// -----------------------------------------------------------------------------
describe('generic-image-alt', () => {
  it('flags an image whose alt is generic', () => {
    const p = page('/x/', {
      images: [
        { src: `${BASE}/a.jpg`, alt: 'image', decorative: false },
        { src: `${BASE}/b.jpg`, alt: 'Rajhans Premium Nilgiri Tea', decorative: false }, // clean
      ],
    });
    const found = byCheck(run([p]), 'generic-image-alt');
    expect(found).toHaveLength(1);
    expect(found[0].evidence.actual).toBe('image');
    expect(found[0].evidence.extra?.imageUrl).toBe(`${BASE}/a.jpg`);
  });

  it('does not flag empty alt (that is images-missing-alt)', () => {
    const p = page('/x/', { images: [{ src: `${BASE}/a.jpg`, alt: '', decorative: false }] });
    expect(byCheck(run([p]), 'generic-image-alt')).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('resolveLinkTargets — fetches each unique target once, reuses observations', () => {
  it('reuses observed pages and fetches only the unobserved, one call each', async () => {
    const observed = page('/product/foo/');
    const src = page('/products/', {
      internalLinkDetails: [
        link('/product/foo/'), // already observed → no fetch
        link('/product/bar'), // not observed → fetch once
        link('/product/bar'), // duplicate target from same page → still one fetch
      ],
    });
    const src2 = page('/blog/', { internalLinkDetails: [link('/product/bar')] }); // another source, same target
    const observations = [observed, src, src2];
    const pageMap = ctxOf(observations).pagesByNormalizedUrl;

    const calls: string[] = [];
    const fetchFn = async (url: string): Promise<FetchResultLike> => {
      calls.push(url);
      return { finalUrl: `${BASE}/product/bar/`, finalStatus: 200, redirectChain: [{ url, status: 301 }], transient: false };
    };

    const resolutions = await resolveLinkTargets(observations, pageMap, BASE, fetchFn, 4);
    expect(calls).toHaveLength(1); // /product/bar fetched exactly once
    expect(resolutions.get(abs('/product/foo/'))?.finalStatus).toBe(200);
    expect(resolutions.get(abs('/product/bar'))?.redirects).toBe(true);
  });

  it('does not fetch asset/api targets', async () => {
    const src = page('/x/', {
      internalLinkDetails: [
        { href: '/style.css', target: abs('/style.css'), anchor: '' },
        { href: '/api/v1/x', target: abs('/api/v1/x'), anchor: '' },
      ],
    });
    const calls: string[] = [];
    const fetchFn = async (url: string): Promise<FetchResultLike> => {
      calls.push(url);
      return { finalUrl: url, finalStatus: 200, redirectChain: [], transient: false };
    };
    await resolveLinkTargets([src], ctxOf([src]).pagesByNormalizedUrl, BASE, fetchFn, 4);
    expect(calls).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('issue identity & state transitions (fingerprint stability)', () => {
  it('gives each source→target link its own stable, independent fingerprint', () => {
    const src = page('/products/', {
      internalLinkDetails: [link('/product/a'), link('/product/b')],
    });
    const resolutions = new Map([
      [abs('/product/a'), res('/product/a', { finalStatus: 404 })],
      [abs('/product/b'), res('/product/b', { finalStatus: 410 })],
    ]);
    const found = byCheck(run([src], resolutions), 'broken-internal-link');
    expect(found).toHaveLength(2); // no collision on the shared source URL
    const fps = found.map((i) => fingerprint(i.normalizedUrl, i.checkId, i.discriminator ?? ''));
    expect(new Set(fps).size).toBe(2);
  });

  it('same finding across runs → same fingerprint (open→open); fixed → absent (resolves)', () => {
    const withBad = page('/products/', { internalLinkDetails: [link('/product/a')] });
    const resBad = new Map([[abs('/product/a'), res('/product/a', { finalStatus: 404 })]]);
    const run1 = byCheck(run([withBad], resBad), 'broken-internal-link');

    // Run 2: identical problem → identical fingerprint (diff treats as the same open issue).
    const run2 = byCheck(run([withBad], resBad), 'broken-internal-link');
    const fp = (i: (typeof run1)[number]) => fingerprint(i.normalizedUrl, i.checkId, i.discriminator ?? '');
    expect(fp(run1[0])).toBe(fp(run2[0]));

    // Run 3: the bad link removed → not detected at all → diff will mark it resolved.
    const fixed = page('/products/', { internalLinkDetails: [] });
    expect(byCheck(run([fixed]), 'broken-internal-link')).toHaveLength(0);
  });

  it('page-level checks keep an empty discriminator (unchanged fingerprint scheme)', () => {
    // orphan-page is anchored per-URL with no discriminator.
    const orphan = page('/catalog/lonely/');
    const found = byCheck(run([orphan]), 'orphan-page');
    expect(found[0].discriminator).toBe('');
  });
});
