import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Server-only API base rewrite.
 *
 * The app's `environment.apiUrl` is the PUBLIC origin
 * (https://rajhanstea.com/api/v1) — correct for the browser. But during on-demand
 * SSR the Node server would otherwise hairpin back out through Cloudflare/nginx to
 * reach its own API (slow, and the exact reachability class that made build-time
 * prerender flaky). When `SSR_API_URL` is set in the Node environment (e.g.
 * http://tea-backend:3000/api/v1), rewrite matching requests to that internal
 * base so SSR talks to the backend directly on the Docker network.
 *
 * In the browser bundle `process` is undefined → base is '' → no rewrite, so
 * browser requests are untouched.
 */
const SSR_API_BASE =
  typeof process !== 'undefined' && process.env ? process.env['SSR_API_URL'] || '' : '';

export const ssrApiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  if (SSR_API_BASE && req.url.startsWith(environment.apiUrl)) {
    return next(req.clone({ url: SSR_API_BASE + req.url.slice(environment.apiUrl.length) }));
  }
  return next(req);
};
