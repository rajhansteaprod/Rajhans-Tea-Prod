import { RenderMode, ServerRoute } from '@angular/ssr';

// All routes are rendered per-request on the server (SSR).
// No build-time prerendering/SSG — dynamic routes (e.g. /product/:slug)
// pull live data per request, same as the previous client-only behavior,
// just now with the initial HTML response containing the fully rendered page.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
