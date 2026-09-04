// =============================================================================
// UNIT TESTS — SEO Phase 6.1 page eligibility
//
// Pure over one page candidate. Asserts the three exclusion rules that decide
// whether a URL ever reaches a detector: page type, system/per-user route
// (reusing the audit's own exclusion list), and indexability.
// =============================================================================

import mongoose from 'mongoose';
import { toEligiblePage } from '../../../src/modules/seo/content/services/page-state.assembler';
import { PageCandidate, PageType } from '../../../src/modules/seo/market/market.types';

const BASE = 'https://rajhanstea.com';
const noSourceIds = new Map<string, mongoose.Types.ObjectId>();

function candidate(over: Partial<PageCandidate> = {}): PageCandidate {
  return {
    url: `${BASE}/product/assam-ctc/`,
    canonicalUrl: `${BASE}/product/assam-ctc/`,
    pageType: 'product' as PageType,
    title: 'Assam CTC',
    slug: 'assam-ctc',
    indexable: true,
    anchors: [],
    normalizedTerms: [],
    pageHealth: 'GOOD',
    healthReasons: [],
    qualityFacts: { wordCount: 800, hasSnapshot: true, openCriticalIssueCount: 0 },
    ...over,
  };
}

describe('toEligiblePage — supported page types', () => {
  it.each<PageType>(['product', 'category', 'blog', 'static', 'home'])('accepts %s pages', (pageType) => {
    const e = toEligiblePage(candidate({ pageType }), noSourceIds);
    expect(e.eligible).toBe(true);
    expect(e.ineligibleReason).toBeNull();
  });
});

describe('toEligiblePage — unsupported page types', () => {
  it('rejects any page type outside the Phase 6.1 scope, by construction', () => {
    // PageType itself is closed to product|category|blog|static|home, so an
    // "unsupported" type can only reach here via a widened candidate source —
    // this proves the gate still fires if that ever happens.
    const weird = candidate({ pageType: 'collection' as unknown as PageType });
    const e = toEligiblePage(weird, noSourceIds);
    expect(e.eligible).toBe(false);
    expect(e.ineligibleReason).toMatch(/outside Phase 6.1 scope/);
  });
});

describe('toEligiblePage — system / per-user routes are excluded even if offered', () => {
  it.each([
    '/auth/login/',
    '/admin/dashboard/',
    '/checkout/',
    '/wishlist/',
    '/dashboard/',
    '/orders/',
    '/cart/',
    '/track-order/',
  ])('excludes %s as a defence-in-depth gate', (path) => {
    const e = toEligiblePage(
      candidate({ canonicalUrl: `${BASE}${path}`, pageType: 'static' as PageType, indexable: true }),
      noSourceIds,
    );
    expect(e.eligible).toBe(false);
    expect(e.ineligibleReason).toMatch(/system \/ per-user route/);
  });

  it('does not exclude an ordinary static page whose path merely contains a similar word', () => {
    const e = toEligiblePage(
      candidate({ canonicalUrl: `${BASE}/page/return-refund-policy/`, pageType: 'static' as PageType }),
      noSourceIds,
    );
    expect(e.eligible).toBe(true);
  });
});

describe('toEligiblePage — non-indexable targets', () => {
  it('excludes a page the latest audit did not find indexable (noindex, redirecting, or non-self-canonical)', () => {
    const e = toEligiblePage(candidate({ indexable: false }), noSourceIds);
    expect(e.eligible).toBe(false);
    expect(e.ineligibleReason).toMatch(/not an indexable, self-canonical 200 page/);
  });

  it('accepts the same URL once it IS indexable', () => {
    const e = toEligiblePage(candidate({ indexable: true }), noSourceIds);
    expect(e.eligible).toBe(true);
  });
});

describe('toEligiblePage — precedence when multiple problems apply', () => {
  it('reports the page-type reason first when both type and route are wrong', () => {
    const e = toEligiblePage(
      candidate({ pageType: 'collection' as unknown as PageType, canonicalUrl: `${BASE}/checkout/`, indexable: false }),
      noSourceIds,
    );
    expect(e.ineligibleReason).toMatch(/outside Phase 6.1 scope/);
  });
});

describe('toEligiblePage — identity fields carried through', () => {
  it('preserves the canonical URL as both normalizedUrl and canonicalUrl, and resolves the source model', () => {
    const id = new mongoose.Types.ObjectId();
    const sourceIds = new Map([['product:assam-ctc', id]]);
    const e = toEligiblePage(candidate(), sourceIds);
    expect(e.normalizedUrl).toBe(e.canonicalUrl);
    expect(e.sourceModel).toBe('Product');
    expect(e.documentId).toBe(id.toString());
  });

  it('leaves documentId null when no source row was found', () => {
    const e = toEligiblePage(candidate(), noSourceIds);
    expect(e.documentId).toBeNull();
  });
});
