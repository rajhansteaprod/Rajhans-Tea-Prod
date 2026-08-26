// =============================================================================
// UNIT TESTS — GSC URL → canonical-page resolution/join (BLOCKER 1)
// Verifies the exact 10 previously-unmatched dry-run URLs + safety cases.
// =============================================================================

import { resolveGscUrl } from '../../../src/modules/seo/services/gsc.join';
import { normalizeUrl } from '../../../src/modules/seo/seo.util';

const abs = (p: string) => normalizeUrl(`https://rajhanstea.com${p}`);

// The latest audit's canonical indexable pages (trailing-slash apex form).
const CANONICAL = new Set<string>([
  '/', '/products/', '/blog/', '/tea-finder/', '/contact/', '/buy-in-bulk/',
  '/page/about-us/', '/page/faq/', '/page/privacy-policy/', '/page/shipping-policy/',
  '/page/terms-and-conditions/', '/page/return-refund-policy/',
  '/catalog/balanced-flavourful/', '/catalog/kadak-and-strong/', '/catalog/smooth-aromatic/',
  '/product/rajhans-royal-assam/', '/blog/black-tea-health-benefits/',
].map(abs));

const R = (u: string) => resolveGscUrl(u, CANONICAL);

describe('resolveGscUrl — the 10 previously-unmatched dry-run URLs', () => {
  it('classifies every URL correctly and preserves demand for provable canonicals', () => {
    const cases: [string, string, string | null][] = [
      ['https://rajhanstea.com/auth/login', 'noindex-system', null],
      ['https://rajhanstea.com/blog', 'canonical-equivalent', '/blog/'],
      ['https://rajhanstea.com/catalog/kadak-and-strong', 'canonical-equivalent', '/catalog/kadak-and-strong/'],
      ['https://rajhanstea.com/page/about-us', 'canonical-equivalent', '/page/about-us/'],
      ['https://rajhanstea.com/page/reseller', 'obsolete-soft404', null],
      ['https://rajhanstea.com/contact/?reason=bulk', 'query-variant', '/contact/'],
      ['https://www.rajhanstea.com/blog/black-tea-health-benefits/', 'canonical-equivalent', '/blog/black-tea-health-benefits/'],
      ['https://rajhanstea.com/page/faq', 'canonical-equivalent', '/page/faq/'],
      ['https://www.rajhanstea.com/page/terms-conditions/', 'legacy-redirect', '/page/terms-and-conditions/'],
      ['https://rajhanstea.com/track-order', 'noindex-system', null],
    ];
    for (const [url, cls, canon] of cases) {
      const res = R(url);
      expect(res.classification).toBe(cls);
      expect(res.joined).toBe(canon !== null);
      expect(res.canonicalUrl).toBe(canon ? abs(canon) : null);
    }
  });

  it('joins 7 of the 10 (the 3 non-indexable/obsolete are classified, not join failures)', () => {
    const urls = [
      '/auth/login', '/blog', '/catalog/kadak-and-strong', '/page/about-us', '/page/reseller',
      '/contact/?reason=bulk', '/page/faq', '/track-order',
    ].map((p) => `https://rajhanstea.com${p}`).concat([
      'https://www.rajhanstea.com/blog/black-tea-health-benefits/',
      'https://www.rajhanstea.com/page/terms-conditions/',
    ]);
    const joined = urls.map(R).filter((r) => r.joined);
    expect(joined).toHaveLength(7);
  });
});

describe('resolveGscUrl — evidence-based safety', () => {
  it('exact canonical match is standalone-indexable', () => {
    expect(R('https://rajhanstea.com/products/').classification).toBe('standalone-indexable');
  });
  it('does NOT fold a query URL whose base path is not a known page', () => {
    const res = R('https://rajhanstea.com/nonexistent-thing?x=1');
    expect(res.joined).toBe(false);
    expect(res.canonicalUrl).toBeNull();
  });
  it('folds a query variant only onto a KNOWN canonical base page', () => {
    expect(R('https://rajhanstea.com/blog/?tag=assam').canonicalUrl).toBe(abs('/blog/')); // base is canonical
  });
  it('legacy return-refund slug maps to its canonical survivor', () => {
    const res = R('https://rajhanstea.com/page/return-refund');
    expect(res.classification).toBe('legacy-redirect');
    expect(res.canonicalUrl).toBe(abs('/page/return-refund-policy/'));
  });
  it('www + non-slash together resolve (host-alias then trailing-slash)', () => {
    expect(R('https://www.rajhanstea.com/products').canonicalUrl).toBe(abs('/products/'));
  });
});
