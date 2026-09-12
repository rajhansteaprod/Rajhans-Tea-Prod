/**
 * Post-build SEO gate. Fails the build (exit 1) if representative dynamic routes
 * were NOT prerendered with real content — so an unreachable/incomplete API at
 * build time fails SAFELY instead of shipping the homepage shell.
 *
 * Run automatically in the Docker build right after `ng build`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, '..', 'src', 'prerender-routes.json'), 'utf8'));
const BROWSER = resolve(here, '..', 'dist', 'frontend', 'browser');

// The homepage <title>; if a dynamic page carries it, we got the shell, not SSG.
const SHELL_TITLE = 'D2C Loose Leaf CTC Chai';

const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(`  ✗ [${name}] ${detail}`);
}

function verify(routePrefix, slug, { requireJsonLdProduct = false, requireCards = false, requireDescription = false } = {}) {
  const url = `/${routePrefix}/${slug}/`;
  const file = resolve(BROWSER, routePrefix, slug, 'index.html');
  if (!existsSync(file)) {
    failures.push(`  ✗ [${url}] not prerendered (file missing: ${file})`);
    return;
  }
  const html = readFileSync(file, 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const canonical = (html.match(/<link rel="canonical"[^>]*href="([^"]*)"/) || [])[1] || '';
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/<[^>]*>/g, '').trim() || '';

  check(url, !title.includes(SHELL_TITLE) && title.length > 0, `title looks like the homepage shell / empty: "${title}"`);
  check(url, canonical.endsWith(url), `canonical is not self-referential: "${canonical}" (expected to end with "${url}")`);
  check(url, h1.length > 0, 'no <h1> content');
  if (requireJsonLdProduct) check(url, /"@type"\s*:\s*"Product"/.test(html), 'missing Product JSON-LD');
  if (requireCards) check(url, /app-product-card/.test(html), 'no product cards rendered');
  if (requireDescription) {
    // Regression guard: the description accordion panel used to be removed
    // from the DOM entirely via @if when collapsed, so Product.description
    // never reached prerendered/crawlable HTML even though it was real,
    // user-visible content. The panel now stays in the DOM (visibility
    // toggled via [hidden]), so its text must be present here regardless of
    // the accordion's default collapsed state.
    const panel = (html.match(/data-seo="product-description"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
    const text = panel.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    check(url, text.length > 40, `product description panel missing/too short in prerendered HTML (got ${text.length} chars)`);
  }
}

/**
 * Homepage brand/entity signals.
 *
 * The homepage intentionally has NO standalone H1 — its one semantic H1 is
 * the active hero slide's own title (see hero.html), conditionally rendered
 * only when that slide has a non-empty title. An empty hero title is a
 * deliberate, valid content state, not a defect: this checks that the
 * PRERENDERED H1 COUNT MATCHES the live CMS state exactly (0 when the active
 * slide has no title, 1 when it does), rather than asserting a fixed count.
 * More than one H1, or any H1 when the active slide has no title, still
 * fails — as does the retired standalone `.home__brand-kicker` element ever
 * reappearing. Also checks WebSite/Organization JSON-LD, the removed legacy
 * headline text, and the hero section itself actually having rendered.
 */
async function verifyHomepageEntitySignals() {
  const url = '/';
  const file = resolve(BROWSER, 'index.html');
  if (!existsSync(file)) {
    failures.push(`  ✗ [${url}] not prerendered (file missing: ${file})`);
    return;
  }
  const html = readFileSync(file, 'utf8');

  // The obsolete standalone SEO headline must never come back, in any form.
  check(url, !/home__brand-kicker/.test(html), 'the obsolete standalone .home__brand-kicker element is present');
  check(url, !html.includes('Premium Loose-Leaf CTC Chai'), 'the retired standalone SEO headline text is still present');
  check(url, !html.includes('Ethically Sourced'), '"Ethically Sourced" is still present on the homepage');

  // The hero section must have actually rendered (independent of whether its
  // title happens to be empty) — an empty H1 count must never mean a broken
  // hero, only a titleless active slide.
  check(url, /class="hero"/.test(html) || /class="hero__frame"/.test(html), 'hero section did not render');

  const h1Matches = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/g)];
  check(url, h1Matches.length <= 1, `expected at most one homepage <h1>, found ${h1Matches.length}`);

  // Cross-check the actual prerendered H1 count against the SAME API this
  // build's manifest was generated from — the one live-data signal that
  // decides whether 0 or 1 is the correct count right now.
  let activeSlideTitle = '';
  try {
    const res = await fetch(`${manifest.source}/hero-slides`, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const json = await res.json();
      activeSlideTitle = (json?.data?.[0]?.title ?? '').trim();
    } else {
      failures.push(`  ✗ [${url}] could not fetch hero-slides to validate H1 count (HTTP ${res.status})`);
    }
  } catch (err) {
    failures.push(`  ✗ [${url}] could not fetch hero-slides to validate H1 count (${err.message})`);
  }

  const expectedH1Count = activeSlideTitle ? 1 : 0;
  check(
    url,
    h1Matches.length === expectedH1Count,
    `homepage <h1> count (${h1Matches.length}) does not match the active hero slide's title state ` +
      `(expected ${expectedH1Count}; active slide title is ${activeSlideTitle ? `"${activeSlideTitle}"` : 'empty'})`,
  );

  if (h1Matches.length === 1) {
    const [, attrs, inner] = h1Matches[0];
    const text = inner.replace(/<[^>]*>/g, '').trim();
    check(url, text === activeSlideTitle, `homepage H1 text ("${text}") does not match the active hero slide's title ("${activeSlideTitle}")`);
    check(url, !/visually-hidden/.test(attrs), 'homepage H1 is visually-hidden, not genuinely visible — no visually-hidden workaround is allowed');
  }

  check(url, /"@type"\s*:\s*"WebSite"/.test(html), 'missing WebSite JSON-LD');
  check(
    url,
    /"@type"\s*:\s*"WebSite"[\s\S]{0,300}"url"\s*:\s*"https:\/\/rajhanstea\.com\/?"/.test(html),
    'WebSite JSON-LD missing or does not declare the canonical homepage url',
  );
  check(url, /"@type"\s*:\s*"Organization"/.test(html), 'Organization JSON-LD is no longer present');

  const canonical = (html.match(/<link rel="canonical"[^>]*href="([^"]*)"/) || [])[1] || '';
  check(url, canonical === 'https://rajhanstea.com/', `homepage canonical is not self-referential: "${canonical}"`);
}

/** One in-body link to the homepage with anchor text "Rajhans Tea" on a given static route. */
function verifyInternalBrandLink(routePath) {
  const url = routePath.endsWith('/') ? routePath : `${routePath}/`;
  const file = resolve(BROWSER, ...url.split('/').filter(Boolean), 'index.html');
  if (!existsSync(file)) {
    failures.push(`  ✗ [${url}] not prerendered (file missing: ${file})`);
    return;
  }
  const html = readFileSync(file, 'utf8');
  check(
    url,
    /<a[^>]*href="\/"[^>]*>\s*Rajhans Tea\s*<\/a>/.test(html),
    'expected an in-body link to "/" with anchor text "Rajhans Tea"',
  );
}

// One representative of each dynamic route type (first slug in the manifest).
verify('product', manifest.product[0], { requireJsonLdProduct: true });
verify('catalog', manifest.catalog[0], { requireCards: true });
if (manifest.blog[0]) verify('blog', manifest.blog[0]);
// A DB-backed CMS page (content comes from the API at build, like the dynamic routes).
verify('page', 'faq');
// Known-good production data with a real Product.description — a targeted
// regression check for the prerender gap above, not a tautology.
verify('product', 'rajhans-rajdoot-dooars', { requireJsonLdProduct: true, requireDescription: true });

await verifyHomepageEntitySignals();
verifyInternalBrandLink('/page/about-us');
verifyInternalBrandLink('/buy-in-bulk');

if (failures.length) {
  console.error('\n[verify-prerender] FAILED — dynamic SEO routes are incomplete:\n' + failures.join('\n'));
  console.error('\nThe API was likely unreachable during the build. Refusing to ship an incomplete SEO build.\n');
  process.exit(1);
}
console.log('[verify-prerender] OK — product/catalog/blog routes prerendered with real content.');
