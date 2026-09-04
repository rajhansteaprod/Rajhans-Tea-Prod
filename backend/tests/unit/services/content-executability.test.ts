// =============================================================================
// UNIT TESTS — SEO Phase 6.1 executability
//
// Executability must be DERIVED from real Phase 5 capability, never assumed
// from a page type. These tests mock only the executor's own target resolver,
// so they assert exactly that: the answer follows what Phase 5 can resolve.
// =============================================================================

const resolveCmsPageTarget = jest.fn();

jest.mock('../../../src/modules/seo/services/change-execution-preflight.service', () => ({
  resolveCmsPageTarget: (...args: unknown[]) => resolveCmsPageTarget(...args),
  EXECUTION_CAPABILITY: {
    changeKind: 'metadata',
    targetType: 'cms_page',
    fields: ['metaTitle', 'metaDescription'],
  },
  PREFLIGHT_THRESHOLDS: { renderedTitleMinLength: 30, renderedTitleMaxLength: 60 },
}));

import { deriveExecutability } from '../../../src/modules/seo/content/services/page-state.assembler';
import { EXECUTION_CAPABILITY } from '../../../src/modules/seo/services/change-execution-preflight.service';

const BASE = 'https://rajhanstea.com';

beforeEach(() => jest.clearAllMocks());

describe('deriveExecutability — CMS pages', () => {
  it('is executable when Phase 5 resolves a live published target', async () => {
    resolveCmsPageTarget.mockResolvedValue({ ok: true, page: { slug: 'about-us' } });
    const e = await deriveExecutability(`${BASE}/page/about-us/`, 'static');
    expect(e.status).toBe('executable');
    expect(e.targetType).toBe('cms_page');
    expect(e.supportedFields).toEqual(['metaTitle', 'metaDescription']);
  });

  it('reports the writable fields from the executor, not a hardcoded list', async () => {
    resolveCmsPageTarget.mockResolvedValue({ ok: true, page: { slug: 'about-us' } });
    const e = await deriveExecutability(`${BASE}/page/about-us/`, 'static');
    expect(e.supportedFields).toEqual([...EXECUTION_CAPABILITY.fields]);
  });

  it('is unsupported when the URL has the executable shape but nothing published behind it', async () => {
    resolveCmsPageTarget.mockResolvedValue({ ok: false, reason: 'not_found' });
    const e = await deriveExecutability(`${BASE}/page/ghost/`, 'static');
    expect(e.status).toBe('unsupported');
    expect(e.supportedFields).toEqual([]);
    expect(e.reason).toMatch(/no published CMS page resolves/);
  });
});

describe('deriveExecutability — page types no executor covers', () => {
  it.each([
    ['product', `${BASE}/product/assam-ctc/`],
    ['category', `${BASE}/catalog/kadak-and-strong/`],
    ['blog', `${BASE}/blog/how-to-brew/`],
    ['home', `${BASE}/`],
  ])('marks a %s page recommendation_only, not executable and not excluded', async (pageType, url) => {
    resolveCmsPageTarget.mockResolvedValue({ ok: false, reason: 'unsupported_target' });
    const e = await deriveExecutability(url, pageType as 'product');
    expect(e.status).toBe('recommendation_only');
    expect(e.supportedFields).toEqual([]);
    expect(e.targetType).toBeNull();
    // The finding is still real — the status says how it can be applied, not
    // whether it is worth surfacing.
    expect(e.reason).toMatch(/still real/);
  });

  it('names the real constraint rather than the page type alone', async () => {
    resolveCmsPageTarget.mockResolvedValue({ ok: false, reason: 'unsupported_target' });
    const e = await deriveExecutability(`${BASE}/product/assam-ctc/`, 'product');
    expect(e.reason).toContain('metadata');
    expect(e.reason).toContain('cms_page');
  });

  it('asks the executor for every page type — the answer is never assumed', async () => {
    resolveCmsPageTarget.mockResolvedValue({ ok: false, reason: 'unsupported_target' });
    await deriveExecutability(`${BASE}/product/assam-ctc/`, 'product');
    await deriveExecutability(`${BASE}/blog/x/`, 'blog');
    expect(resolveCmsPageTarget).toHaveBeenCalledTimes(2);
  });

  it('would report a product page as executable if Phase 5 ever resolved one', async () => {
    // Guards the derivation itself: widening execution in Phase 6.4 must change
    // this answer automatically, with no edit to the content module.
    resolveCmsPageTarget.mockResolvedValue({ ok: true, page: { slug: 'assam-ctc' } });
    const e = await deriveExecutability(`${BASE}/product/assam-ctc/`, 'product');
    expect(e.status).toBe('executable');
  });
});
