import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Hybrid rendering (outputMode: 'server'):
 *
 * - Static marketing/content routes are PRERENDERED once at build time (fast,
 *   cache-friendly, no runtime cost).
 * - Data-driven dynamic routes (product/category/blog detail) are RENDERED ON
 *   DEMAND by the Node SSR server, so their raw HTML always contains the real
 *   record — content, <title>, meta description, self-canonical, and Product
 *   JSON-LD — with no build-time API dependency. This removes the previous
 *   nondeterminism where a flaky build-time slug fetch decided whether these
 *   pages were prerendered or shipped as the homepage shell.
 * - Auth-gated / per-user routes stay client-rendered.
 */
export const serverRoutes: ServerRoute[] = [
  // ── Static marketing/content routes: prerendered once at build time ──
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'products', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Prerender },
  { path: 'page/about-us', renderMode: RenderMode.Prerender },
  { path: 'tea-finder', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'buy-in-bulk', renderMode: RenderMode.Prerender },

  // ── Data-driven dynamic routes: server-side rendered on demand (always fresh) ──
  { path: 'product/:slug', renderMode: RenderMode.Server },
  { path: 'catalog/:slug', renderMode: RenderMode.Server },
  { path: 'blog/:slug', renderMode: RenderMode.Server },

  // CMS pages: prerender the hardcoded static policy pages (content lives in
  // static-page.ts, no API needed → deterministic), and SERVER-render any other
  // DB-backed page slug on demand so its content/canonical are in raw HTML.
  {
    path: 'page/:slug',
    renderMode: RenderMode.Prerender,
    fallback: PrerenderFallback.Server,
    async getPrerenderParams() {
      return [
        { slug: 'shipping-policy' },
        { slug: 'terms-and-conditions' },
        { slug: 'return-refund-policy' },
      ];
    },
  },

  // ── Auth-gated / per-user / admin routes: never prerendered, always CSR ──
  { path: 'wishlist', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'order-confirmation', renderMode: RenderMode.Client },
  { path: 'orders', renderMode: RenderMode.Client },
  { path: 'dashboard/**', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'auth/**', renderMode: RenderMode.Client },
  { path: 'track-order', renderMode: RenderMode.Client },
  { path: 'error', renderMode: RenderMode.Client },
  { path: '404', renderMode: RenderMode.Client },

  // ── Everything else: client-rendered fallback (unknown/catch-all) ──
  { path: '**', renderMode: RenderMode.Client },
];
