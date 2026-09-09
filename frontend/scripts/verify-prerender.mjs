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
 * Homepage brand/entity signals: exactly one genuinely visible H1 containing
 * "Rajhans Tea", WebSite JSON-LD with the canonical homepage URL, and the
 * existing Organization JSON-LD still present.
 */
function verifyHomepageEntitySignals() {
  const url = '/';
  const file = resolve(BROWSER, 'index.html');
  if (!existsSync(file)) {
    failures.push(`  ✗ [${url}] not prerendered (file missing: ${file})`);
    return;
  }
  const html = readFileSync(file, 'utf8');

  const h1Matches = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/g)];
  check(url, h1Matches.length === 1, `expected exactly one homepage <h1>, found ${h1Matches.length}`);
  if (h1Matches.length >= 1) {
    const [, attrs, inner] = h1Matches[0];
    const text = inner.replace(/<[^>]*>/g, '').trim();
    check(url, text.includes('Rajhans Tea'), `homepage H1 does not contain "Rajhans Tea": "${text}"`);
    check(url, !/visually-hidden/.test(attrs), 'homepage H1 is visually-hidden, not genuinely visible');
  }

  check(url, /"@type"\s*:\s*"WebSite"/.test(html), 'missing WebSite JSON-LD');
  check(
    url,
    /"@type"\s*:\s*"WebSite"[\s\S]{0,300}"url"\s*:\s*"https:\/\/rajhanstea\.com\/?"/.test(html),
    'WebSite JSON-LD missing or does not declare the canonical homepage url',
  );
  check(url, /"@type"\s*:\s*"Organization"/.test(html), 'Organization JSON-LD is no longer present');
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

verifyHomepageEntitySignals();
verifyInternalBrandLink('/page/about-us');
verifyInternalBrandLink('/buy-in-bulk');

if (failures.length) {
  console.error('\n[verify-prerender] FAILED — dynamic SEO routes are incomplete:\n' + failures.join('\n'));
  console.error('\nThe API was likely unreachable during the build. Refusing to ship an incomplete SEO build.\n');
  process.exit(1);
}
console.log('[verify-prerender] OK — product/catalog/blog routes prerendered with real content.');
