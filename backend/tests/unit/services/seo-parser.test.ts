// =============================================================================
// UNIT TESTS — SEO parser Phase 2b additions (image src/alt + link anchor text)
// =============================================================================

import { parseHtml } from '../../../src/modules/seo/services/parser.service';

const BASE = 'https://rajhanstea.com';
const PAGE = `${BASE}/products/`;

describe('parseHtml — image extraction', () => {
  it('captures src (absolutized) and alt for every image', () => {
    const html = `
      <img src="/media/a.jpg" alt="Rajhans Tea">
      <img src="https://cdn.x.com/b.png" alt="">
      <img data-src="/media/c.webp">
    `;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.imagesTotal).toBe(3);
    expect(p.imagesMissingAlt).toBe(2); // second (empty) + third (none)
    expect(p.images[0]).toEqual({ src: `${BASE}/media/a.jpg`, alt: 'Rajhans Tea' });
    expect(p.images[1].src).toBe('https://cdn.x.com/b.png');
    expect(p.images[2].src).toBe(`${BASE}/media/c.webp`); // data-src fallback
  });
});

describe('parseHtml — internal link details', () => {
  it('captures raw href, normalized same-origin target, and anchor text', () => {
    const html = `
      <a href="/product/foo">Foo Tea</a>
      <a href="/product/foo/"><span>Foo</span> Slash</a>
      <a href="https://external.com/x">External</a>
      <a href="mailto:hi@x.com">Mail</a>
      <a href="#section">Frag</a>
    `;
    const p = parseHtml(html, PAGE, BASE);
    const targets = p.internalLinkDetails.map((l) => l.target);
    expect(targets).toContain(`${BASE}/product/foo`);
    expect(targets).toContain(`${BASE}/product/foo/`);
    expect(targets).not.toContain('https://external.com/x'); // external excluded
    expect(p.internalLinkDetails.find((l) => l.href === '/product/foo')?.anchor).toBe('Foo Tea');
    expect(p.internalLinkDetails.find((l) => l.href === '/product/foo/')?.anchor).toBe('Foo Slash'); // nested tags stripped
  });

  it('keeps the existing normalized internalLinks output intact', () => {
    const html = `<a href="/blog/">Blog</a><a href="/blog/">Blog again</a>`;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.internalLinks).toEqual([`${BASE}/blog/`]); // deduped set, unchanged behavior
  });
});
