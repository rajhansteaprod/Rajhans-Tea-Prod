import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { timeout } from 'rxjs/operators';
import { PlatformService } from '../services/platform.service';

/**
 * Server-only request timeout.
 *
 * During build-time prerendering, page components fetch catalog/blog data over
 * HttpClient. If the API is unreachable and drops packets (e.g. a CI runner that
 * can't reach the live domain), those requests hang forever, the prerender worker
 * never returns, the piscina pool times out and is destroyed, and the whole build
 * fails with "Terminating worker thread". `getPrerenderParams` already self-bounds
 * with a 4s AbortSignal; this gives every other SSR request the same guarantee so
 * a slow/unreachable API degrades to an empty/loading render instead of failing
 * the build. Browser requests are left untouched — real UX is unchanged.
 */
export const serverTimeoutInterceptor: HttpInterceptorFn = (req, next) => {
  const platform = inject(PlatformService);
  if (platform.isServer) {
    return next(req).pipe(timeout(6000));
  }
  return next(req);
};
