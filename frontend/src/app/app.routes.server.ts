import { RenderMode, ServerRoute } from '@angular/ssr';
import routeManifest from '../prerender-routes.json';

/**
 * Deterministic build-time prerendering.
 *
 * Dynamic SEO routes are enumerated from a COMMITTED, authoritative manifest
 * (src/prerender-routes.json), generated from the API by
 * `npm run prerender:manifest`. The build therefore does NOT depend on the API
 * being reachable to DECIDE which routes exist — that decision is deterministic
 * and identical on every build.
 *
 * If the manifest is missing or a required list is empty, getPrerenderParams
 * THROWS, which fails the build. We never silently ship a build with zero/missing
 * dynamic routes. (Page CONTENT is still rendered from the API during the build;
 * a post-build check, scripts/verify-prerender.mjs, fails the build if the
 * prerendered HTML is missing real content — so an unreachable API at build time
 * fails safely instead of shipping empty shells.)
 */
interface RouteManifest {
  generatedAt: string;
  source: string;
  product: string[];
  catalog: string[];
  blog: string[];
}

const manifest = routeManifest as RouteManifest;

function requireSlugs(kind: 'product' | 'catalog' | 'blog'): string[] {
  const slugs = manifest?.[kind];
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new Error(
      `[prerender] Route manifest is missing or empty for "${kind}". Refusing to build an ` +
        `incomplete SEO build. Regenerate it with "npm run prerender:manifest" (requires the API).`,
    );
  }
  return slugs;
}

export const serverRoutes: ServerRoute[] = [
  // ── Static marketing/content routes: prerendered once at build time ──
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'products', renderMode: RenderMode.Prerender },
  { path: 'blog', renderMode: RenderMode.Prerender },
  { path: 'page/about-us', renderMode: RenderMode.Prerender },
  { path: 'tea-finder', renderMode: RenderMode.Prerender },
  { path: 'contact', renderMode: RenderMode.Prerender },
  { path: 'buy-in-bulk', renderMode: RenderMode.Prerender },

  // ── Dynamic routes: enumerated deterministically from the committed manifest ──
  {
    path: 'product/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return requireSlugs('product').map((slug) => ({ slug }));
    },
  },
  {
    path: 'catalog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return requireSlugs('catalog').map((slug) => ({ slug }));
    },
  },
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return requireSlugs('blog').map((slug) => ({ slug }));
    },
  },
  {
    path: 'page/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      // Hardcoded policy pages (content lives in static-page.ts, not the API).
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
