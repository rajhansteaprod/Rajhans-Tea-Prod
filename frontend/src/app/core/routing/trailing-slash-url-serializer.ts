import { DefaultUrlSerializer, UrlSerializer, UrlTree } from '@angular/router';
import { stripTrailingSlash, withTrailingSlash } from './canonical-url';

/**
 * Emits canonical trailing-slash URLs for every internal router link and
 * navigation (/products/ not /products), so the app links DIRECTLY to the
 * site's canonical URL instead of triggering nginx's 301 add-slash redirect.
 *
 * - serialize(): appends a trailing slash to the PATH (before any query/fragment).
 * - parse(): strips a trailing slash from the PATH first, so routes declared
 *   WITHOUT a trailing slash (path: 'products') still match '/products/'. This
 *   keeps the serialize↔parse round-trip stable (no redirect loops) and changes
 *   NOTHING about route matching.
 *
 * Only in-app router URLs pass through here — external links, API calls, assets,
 * mailto/tel, and plain non-router hrefs are unaffected.
 */
export class TrailingSlashUrlSerializer implements UrlSerializer {
  private readonly base = new DefaultUrlSerializer();

  parse(url: string): UrlTree {
    return this.base.parse(stripTrailingSlash(url));
  }

  serialize(tree: UrlTree): string {
    return withTrailingSlash(this.base.serialize(tree));
  }
}
