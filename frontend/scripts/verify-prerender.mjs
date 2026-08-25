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

function verify(routePrefix, slug, { requireJsonLdProduct = false, requireCards = false } = {}) {
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
}

// One representative of each dynamic route type (first slug in the manifest).
verify('product', manifest.product[0], { requireJsonLdProduct: true });
verify('catalog', manifest.catalog[0], { requireCards: true });
if (manifest.blog[0]) verify('blog', manifest.blog[0]);
// A DB-backed CMS page (content comes from the API at build, like the dynamic routes).
verify('page', 'faq');

if (failures.length) {
  console.error('\n[verify-prerender] FAILED — dynamic SEO routes are incomplete:\n' + failures.join('\n'));
  console.error('\nThe API was likely unreachable during the build. Refusing to ship an incomplete SEO build.\n');
  process.exit(1);
}
console.log('[verify-prerender] OK — product/catalog/blog routes prerendered with real content.');
