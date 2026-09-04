// =============================================================================
// UNIT TESTS — SEO parser Phase 2b additions (image src/alt + link anchor text)
// =============================================================================

import { EXTRACTOR_VERSION, parseHtml } from '../../../src/modules/seo/services/parser.service';

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
    expect(p.imagesMissingAlt).toBe(1); // only the third (no alt attr); second is alt="" = decorative
    expect(p.images[0]).toEqual({ src: `${BASE}/media/a.jpg`, alt: 'Rajhans Tea', decorative: false });
    expect(p.images[1].src).toBe('https://cdn.x.com/b.png');
    expect(p.images[1].decorative).toBe(true); // alt="" → decorative
    expect(p.images[2].src).toBe(`${BASE}/media/c.webp`); // data-src fallback
    expect(p.images[2].decorative).toBe(false); // no alt attribute → truly missing
  });
});

describe('parseHtml — decorative image / missing-alt refinement', () => {
  it('does NOT count explicitly-decorative images as missing alt', () => {
    const html = `
      <img src="/hero.png" class="hero__bg-img" alt>
      <img src="/a.png" alt="">
      <img src="/b.png" role="presentation">
      <img src="/c.png" aria-hidden="true">
    `;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.imagesTotal).toBe(4);
    expect(p.imagesMissingAlt).toBe(0); // all four are decorative
    expect(p.images.every((i) => i.decorative)).toBe(true);
  });

  it('DOES count a content image with no alt attribute at all', () => {
    const html = `<img src="/product.png"> <img src="/logo.png" alt="Rajhans Tea">`;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.imagesMissingAlt).toBe(1); // only the alt-less content image
    expect(p.images[0].decorative).toBe(false);
    expect(p.images[1].decorative).toBe(false); // has real alt text
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

// =============================================================================
// Phase 6.1 — deterministic content-signal extraction
// =============================================================================

describe('parseHtml — Phase 6.1 heading capture', () => {
  it('captures h1/h2/h3 inner text and a document-order outline', () => {
    const html = `
      <h1>Assam CTC Tea</h1>
      <h2>How to brew</h2>
      <h3>With milk</h3>
      <h2>Sourcing</h2>
      <h1>Second H1</h1>
    `;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.h1).toEqual(['Assam CTC Tea', 'Second H1']);
    expect(p.h2).toEqual(['How to brew', 'Sourcing']);
    expect(p.h3).toEqual(['With milk']);
    // The outline preserves the INTERLEAVING that the flat arrays lose.
    expect(p.headingOutline).toEqual([
      { level: 1, text: 'Assam CTC Tea' },
      { level: 2, text: 'How to brew' },
      { level: 3, text: 'With milk' },
      { level: 2, text: 'Sourcing' },
      { level: 1, text: 'Second H1' },
    ]);
  });

  it('strips nested markup, decodes entities, and drops empty headings', () => {
    const html = `<h2><span>Kadak</span> &amp; Strong</h2><h2>  </h2><h3><em></em></h3>`;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.h2).toEqual(['Kadak & Strong']);
    expect(p.h3).toEqual([]);
  });

  it('keeps h1 behaviour identical to the pre-6.1 extractor', () => {
    const html = `<h1>Only One</h1><h2>Not an h1</h2>`;
    expect(parseHtml(html, PAGE, BASE).h1).toEqual(['Only One']);
  });
});

describe('parseHtml — Phase 6.1 normalized text', () => {
  it('strips scripts, styles and markup, decodes entities, collapses whitespace', () => {
    const html = `
      <style>.a{color:red}</style>
      <script>var x = "hidden";</script>
      <h1>Assam   Tea</h1>
      <p>Strong &amp; malty.&nbsp;Great with milk.</p>
    `;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.normalizedText).toBe('Assam Tea Strong & malty. Great with milk.');
    expect(p.normalizedText).not.toContain('color:red');
    expect(p.normalizedText).not.toContain('var x');
    expect(p.normalizedTextTruncated).toBe(false);
    expect(p.normalizedTextChars).toBe(p.normalizedText.length);
  });

  it('is deterministic — the same HTML always yields the same signals', () => {
    const html = `<h1>A</h1><h2>B</h2><p>Body text &amp; more.</p>`;
    const a = parseHtml(html, PAGE, BASE);
    const b = parseHtml(html, PAGE, BASE);
    expect(b.normalizedText).toBe(a.normalizedText);
    expect(b.headingOutline).toEqual(a.headingOutline);
    expect(b.contentHash).toBe(a.contentHash);
    expect(b.extractorVersion).toBe(a.extractorVersion);
  });

  it('truncates at a word boundary and SIGNALS the truncation explicitly', () => {
    const long = 'word '.repeat(12000).trim(); // ~60,000 chars — over the 24,000 cap
    const p = parseHtml(`<p>${long}</p>`, PAGE, BASE);
    expect(p.normalizedTextTruncated).toBe(true);
    expect(p.normalizedText.length).toBeLessThanOrEqual(24000);
    expect(p.normalizedTextChars).toBe(long.length); // full length still reported
    expect(p.normalizedText.endsWith('word')).toBe(true); // never cut mid-token
  });

  it('leaves wordCount and contentHash on their pre-6.1 derivation', () => {
    // Entity decoding applies to normalizedText ONLY, so a hash taken before
    // Phase 6.1 still compares equal for unchanged content.
    const p = parseHtml('<p>Tea &amp; chai</p>', PAGE, BASE);
    expect(p.wordCount).toBe(3); // 'Tea', '&amp;', 'chai' — undecoded, as before
    expect(p.normalizedText).toBe('Tea & chai'); // decoded, for coverage matching
  });
});

describe('parseHtml — Phase 6.1 FAQ signals', () => {
  it('counts question headings and detects an FAQ heading', () => {
    const html = `<h2>FAQs</h2><h3>How do I brew this?</h3><h3>Is it organic?</h3><h3>Sourcing</h3>`;
    const p = parseHtml(html, PAGE, BASE);
    expect(p.faqSignals).toEqual({ questionHeadings: 2, faqHeadingPresent: true, faqSchemaPresent: false });
  });

  it('detects FAQPage JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@type":"FAQPage"}</script>`;
    expect(parseHtml(html, PAGE, BASE).faqSignals.faqSchemaPresent).toBe(true);
  });

  it('reports no FAQ signal on an ordinary page rather than guessing', () => {
    const p = parseHtml('<h1>Assam Tea</h1><h2>Sourcing</h2>', PAGE, BASE);
    expect(p.faqSignals).toEqual({ questionHeadings: 0, faqHeadingPresent: false, faqSchemaPresent: false });
  });
});

describe('parseHtml — Phase 6.1 provenance', () => {
  it('stamps the extractor version on every parse', () => {
    expect(parseHtml('<h1>x</h1>', PAGE, BASE).extractorVersion).toBe(EXTRACTOR_VERSION);
  });
});

describe('parseHtml — Phase 6.1 main-content scoping', () => {
  it('uses <main> for Phase 6.1 headings/text while preserving legacy full-document wordCount', () => {
    const html = `
      <header>
        <h2>MENU</h2>
        <p>Global header words</p>
      </header>
      <main>
        <h1>Rajhans Royal Assam</h1>
        <h2>Why it tastes malty</h2>
        <p>Assam tea body content.</p>
      </main>
      <aside>
        <h2>Your Cart</h2>
        <p>Global cart words</p>
      </aside>
    `;

    const p = parseHtml(html, PAGE, BASE);

    expect(p.h1).toEqual(['Rajhans Royal Assam']);
    expect(p.h2).toEqual(['Why it tastes malty']);
    expect(p.headingOutline).toEqual([
      { level: 1, text: 'Rajhans Royal Assam' },
      { level: 2, text: 'Why it tastes malty' },
    ]);
    expect(p.normalizedText).toBe(
      'Rajhans Royal Assam Why it tastes malty Assam tea body content.',
    );
    expect(p.normalizedText).not.toContain('MENU');
    expect(p.normalizedText).not.toContain('Your Cart');

    // Legacy metric intentionally still sees the whole document.
    expect(p.wordCount).toBeGreaterThan(
      p.normalizedText.split(' ').filter(Boolean).length,
    );
  });

  it('falls back to the full document when no <main> element exists', () => {
    const p = parseHtml(
      '<h1>Fallback H1</h1><h2>Fallback H2</h2><p>Fallback body.</p>',
      PAGE,
      BASE,
    );

    expect(p.h1).toEqual(['Fallback H1']);
    expect(p.h2).toEqual(['Fallback H2']);
    expect(p.normalizedText).toBe('Fallback H1 Fallback H2 Fallback body.');
  });
});

describe('parseHtml — Phase 6.1 component heading exclusions', () => {
  it('excludes product-card headings from the editorial heading outline but keeps their text in normalizedText', () => {
    const html = `
      <main>
        <h1>Kadak And Strong</h1>
        <app-product-card>
          <div class="product-card">
            <h3 class="product-card__name">
              <a href="/product/rajhans-royal-assam/">Rajhans Royal Assam</a>
            </h3>
          </div>
        </app-product-card>
        <app-product-card>
          <div class="product-card">
            <h3 class="product-card__name">
              <a href="/product/rajhans-rajdoot-dooars/">Rajhans Rajdoot Dooars</a>
            </h3>
          </div>
        </app-product-card>
      </main>
    `;

    const p = parseHtml(html, PAGE, BASE);

    expect(p.h1).toEqual(['Kadak And Strong']);
    expect(p.h2).toEqual([]);
    expect(p.h3).toEqual([]);
    expect(p.headingOutline).toEqual([
      { level: 1, text: 'Kadak And Strong' },
    ]);

    expect(p.normalizedText).toContain('Rajhans Royal Assam');
    expect(p.normalizedText).toContain('Rajhans Rajdoot Dooars');
  });
});
