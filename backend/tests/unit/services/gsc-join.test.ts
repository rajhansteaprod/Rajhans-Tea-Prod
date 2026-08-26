// =============================================================================
// UNIT TESTS — GSC URL → canonical-page resolution/join (BLOCKER 1)
// Verifies the exact 10 previously-unmatched dry-run URLs + safety cases.
// =============================================================================

import { resolveGscUrl, resolveMetrics, resolvePageDaily } from '../../../src/modules/seo/services/gsc.join';
import { normalizeUrl } from '../../../src/modules/seo/seo.util';
import { FetchedMetrics } from '../../../src/modules/seo/services/gsc.sync.service';
import { QueryPageMetric, PageDailyRow } from '../../../src/modules/seo/gsc.types';

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

describe('metric persistence filtering (BLOCKER: no invalid rows persisted)', () => {
  const win = { start: '2026-07-27', end: '2026-08-23' };
  const prev = { start: '2026-06-29', end: '2026-07-26' };
  const qp = (page: string, over: Partial<QueryPageMetric> = {}): QueryPageMetric =>
    ({ query: 'q', page, normalizedUrl: normalizeUrl(page), clicks: 1, impressions: 50, ctr: 0.02, position: 8, ...over });
  const raw = (queryPage: QueryPageMetric[], pageDaily: PageDailyRow[] = []): FetchedMetrics =>
    ({ window: win, previousWindow: prev, backfill: win, queryPage, pageDaily, pageLatest: [], pagePrevious: [] });

  it('excludes noindex-system / obsolete-soft404 / unresolved; retains query/host/legacy against canonical', () => {
    const rows = [
      qp('https://rajhanstea.com/auth/login'),                       // noindex-system → excluded
      qp('https://rajhanstea.com/page/reseller'),                    // obsolete-soft404 → excluded
      qp('https://rajhanstea.com/nonexistent?x=1'),                  // unresolved → excluded
      qp('https://rajhanstea.com/contact/?reason=bulk'),             // query-variant → /contact/
      qp('https://www.rajhanstea.com/products'),                     // host-alias+slash → /products/
      qp('https://rajhanstea.com/page/return-refund'),               // legacy → /page/return-refund-policy/
    ];
    const { metrics, ignored } = resolveMetrics(raw(rows), CANONICAL);

    const persistedUrls = metrics.queryPage.map((r) => r.normalizedUrl);
    expect(persistedUrls).toContain(abs('/contact/'));
    expect(persistedUrls).toContain(abs('/products/'));
    expect(persistedUrls).toContain(abs('/page/return-refund-policy/'));
    expect(persistedUrls).not.toContain(abs('/auth/login'));
    expect(persistedUrls).not.toContain(abs('/page/reseller'));
    expect(persistedUrls.every((u) => CANONICAL.has(u))).toBe(true); // ONLY canonical pages persisted
    expect(ignored).toEqual({ noindexSystem: 1, obsoleteSoft404: 1, unresolved: 1 });
  });

  it('merges two source forms of one page (query,canonical) by summing demand', () => {
    const rows = [
      qp('https://rajhanstea.com/blog', { impressions: 30, clicks: 1 }),   // → /blog/
      qp('https://www.rajhanstea.com/blog/', { impressions: 20, clicks: 2 }), // → /blog/
    ];
    const { metrics } = resolveMetrics(raw(rows), CANONICAL);
    const blog = metrics.queryPage.filter((r) => r.normalizedUrl === abs('/blog/'));
    expect(blog).toHaveLength(1);
    expect(blog[0].impressions).toBe(50);
    expect(blog[0].clicks).toBe(3);
  });

  it('page-daily resolution drops invalid rows and merges same (date, canonical)', () => {
    const pd = (page: string, date: string, impressions: number): PageDailyRow =>
      ({ date, page, normalizedUrl: normalizeUrl(page), clicks: 0, impressions, ctr: 0, position: 5 });
    const daily = [
      pd('https://rajhanstea.com/auth/login', '2026-08-20', 10),          // excluded
      pd('https://rajhanstea.com/blog', '2026-08-20', 5),                 // → /blog/
      pd('https://www.rajhanstea.com/blog/', '2026-08-20', 7),           // → /blog/ (same date → merged)
      pd('https://rajhanstea.com/blog/', '2026-08-21', 4),               // → /blog/ (different date)
    ];
    const { merged } = resolvePageDaily(daily, CANONICAL);
    expect(merged.every((r) => CANONICAL.has(r.normalizedUrl))).toBe(true);
    const d20 = merged.find((r) => r.date === '2026-08-20');
    expect(d20?.normalizedUrl).toBe(abs('/blog/'));
    expect(d20?.impressions).toBe(12); // 5 + 7 merged; auth/login dropped
    expect(merged.filter((r) => r.date === '2026-08-20')).toHaveLength(1);
  });
});
