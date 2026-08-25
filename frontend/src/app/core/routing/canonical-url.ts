/**
 * Canonical internal-URL helpers. Pure string logic (no Angular imports), so they
 * are trivially unit-testable and are reused by TrailingSlashUrlSerializer.
 *
 * The site's canonical URL form for page routes is trailing-slash
 * (/products/, /product/foo/, /page/faq/). Linking to the non-slash form makes
 * nginx issue a 301 to the slash form — an unnecessary redirect. These helpers
 * rewrite ONLY internal page paths to the canonical trailing-slash form while:
 *   - preserving query strings and fragments,
 *   - never touching external URLs (http(s):, //cdn), API endpoints (/api/…),
 *     asset files (*.png, *.xml…), mailto:/tel:/other schemes, or fragment-only
 *     links (#top).
 */

// A scheme (http:, mailto:, tel:, javascript:) or a protocol-relative //host URL.
const EXTERNAL_OR_SPECIAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
// A file extension on the final path segment (…/logo.png, /sitemap.xml).
const ASSET_EXT = /\.[a-z0-9]{1,8}$/i;

/** Split a path[?query][#fragment] string into its path and its ?…/#… suffix. */
function splitPath(url: string): { path: string; suffix: string } {
  const i = url.search(/[?#]/);
  return i === -1 ? { path: url, suffix: '' } : { path: url.slice(0, i), suffix: url.slice(i) };
}

/** Append one trailing slash to the PATH (before ?query/#fragment). Root & already-slashed paths unchanged. */
export function withTrailingSlash(url: string): string {
  const { path, suffix } = splitPath(url);
  if (path && path !== '/' && !path.endsWith('/')) return `${path}/${suffix}`;
  return `${path}${suffix}`;
}

/** Remove one trailing slash from the PATH (before ?query/#fragment). Root unchanged. */
export function stripTrailingSlash(url: string): string {
  const { path, suffix } = splitPath(url);
  if (path.length > 1 && path.endsWith('/')) return `${path.slice(0, -1)}${suffix}`;
  return `${path}${suffix}`;
}

/** True when href is an in-app internal PAGE link eligible for trailing-slash canonicalization. */
export function isInternalPageHref(href: string): boolean {
  if (!href) return false;
  if (EXTERNAL_OR_SPECIAL.test(href)) return false; // http(s):, mailto:, tel:, //cdn, javascript:
  if (!href.startsWith('/')) return false; // fragment-only (#x), relative, or other — leave alone
  const { path } = splitPath(href);
  if (path.startsWith('/api/')) return false; // API endpoint
  const lastSeg = path.split('/').pop() || '';
  if (ASSET_EXT.test(lastSeg)) return false; // asset file (logo.png, styles.css, sitemap.xml…)
  return true;
}

/** Canonicalize an internal page href to trailing-slash; return anything else unchanged. */
export function toCanonicalHref(href: string): string {
  return isInternalPageHref(href) ? withTrailingSlash(href) : href;
}
