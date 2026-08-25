/**
 * Generates the deterministic prerender route manifest (src/prerender-routes.json)
 * — the authoritative, committed list of dynamic SEO routes to prerender.
 *
 * Run: `npm run prerender:manifest` (optionally PRERENDER_API_URL=... to target a
 * different backend). Intended to be run before a release and committed, or by a
 * scheduled job that commits the refreshed manifest.
 *
 * Guarantees (per Option 2 requirements):
 *  - Fetches product/category/blog slugs from the authoritative API with retries.
 *  - If ANY source can't be fetched, or products/categories come back empty, it
 *    EXITS NON-ZERO WITHOUT WRITING — the last-known-good committed manifest is
 *    preserved and never replaced with a partial/incomplete one.
 *  - Writes atomically (temp file + rename) so a crash can't corrupt the manifest.
 */
import { writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const API = (process.env.PRERENDER_API_URL || 'https://rajhanstea.com/api/v1').replace(/\/+$/, '');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'prerender-routes.json');
const TIMEOUT_MS = 20000;
const RETRIES = 3;

async function fetchJson(path) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.data)) throw new Error('unexpected response shape');
      return json.data;
    } catch (err) {
      lastErr = err;
      console.warn(`[manifest] ${path} attempt ${attempt}/${RETRIES} failed: ${err.message}`);
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`Could not fetch ${path} after ${RETRIES} attempts: ${lastErr?.message}`);
}

const slugs = (rows) => rows.map((r) => r?.slug).filter((s) => typeof s === 'string' && s.length > 0);

try {
  console.log(`[manifest] source: ${API}`);
  const [productRows, categoryRows, blogRows] = await Promise.all([
    fetchJson('/catalog/product-slugs'),
    fetchJson('/catalog/categories'),
    fetchJson('/blog'),
  ]);

  const product = slugs(productRows);
  const catalog = slugs(categoryRows);
  const blog = slugs(blogRows);

  // Completeness gate: products and categories are required. An incomplete
  // manifest must never be written — fail so the last-good manifest survives.
  if (product.length === 0) throw new Error('0 product slugs returned — refusing to write an incomplete manifest');
  if (catalog.length === 0) throw new Error('0 category slugs returned — refusing to write an incomplete manifest');

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: API,
    product: product.sort(),
    catalog: catalog.sort(),
    blog: blog.sort(),
  };

  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n');
  renameSync(tmp, OUT);
  console.log(`[manifest] wrote ${OUT}: ${product.length} products, ${catalog.length} categories, ${blog.length} blogs`);
} catch (err) {
  console.error(`[manifest] FAILED — manifest NOT updated (last-good preserved): ${err.message}`);
  process.exit(1);
}
