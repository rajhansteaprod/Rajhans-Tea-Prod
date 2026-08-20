import { RenderMode, ServerRoute } from '@angular/ssr';

// Absolute API base used only at BUILD TIME to enumerate dynamic route params
// (product slugs, category slugs, blog slugs) for prerendering. There is no
// browser origin available during a build-time prerender pass, so this must
// be an absolute URL. Override with PRERENDER_API_URL if building against a
// staging backend; defaults to the live production API so prerendered pages
// always reflect real, current catalog data.
const PRERENDER_API_URL = process.env['PRERENDER_API_URL'] || 'https://rajhanstea.com/api/v1';

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
}

async function fetchSlugs(path: string): Promise<string[]> {
  try {
    // Short timeout so an unreachable/slow API at build time (CI runners, or a
    // host that can't hairpin to its own domain) fails fast and the build still
    // completes — the route extractor otherwise hangs until it aborts and the
    // whole production build fails. Dynamic pages fall back to runtime rendering.
    const res = await fetch(`${PRERENDER_API_URL}${path}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn(`[prerender] ${path} returned ${res.status}; skipping dynamic params for this route`);
      return [];
    }
    const json = (await res.json()) as ApiListResponse<{ slug: string }>;
    return (json.data || []).map((item) => item.slug).filter(Boolean);
  } catch (err) {
    console.warn(`[prerender] Failed to fetch ${path}, skipping dynamic params:`, err);
    return [];
  }
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

  // ── Dynamic routes: enumerate real params from the live API, then prerender each ──
  {
    path: 'product/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      // Dedicated endpoint returns ALL active product slugs (no 100 cap).
      const slugs = await fetchSlugs('/catalog/product-slugs');
      return slugs.map((slug) => ({ slug }));
    },
  },
  {
    path: 'catalog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const slugs = await fetchSlugs('/catalog/categories');
      return slugs.map((slug) => ({ slug }));
    },
  },
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const slugs = await fetchSlugs('/blog');
      return slugs.map((slug) => ({ slug }));
    },
  },
  {
    path: 'page/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      // These 3 policy pages are hardcoded content in static-page.ts, not API-driven
      return [
        { slug: 'shipping-policy' },
        { slug: 'terms-conditions' },
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
