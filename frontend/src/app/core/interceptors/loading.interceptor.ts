import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * HTTP interceptor that triggers global loading bar.
 * Skips: autocomplete, unread-count, realtime (polling endpoints).
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Skip for lightweight/polling requests
  const skipUrls = ['/autocomplete', '/unread-count', '/realtime', '/health'];
  const shouldSkip = skipUrls.some((url) => req.url.includes(url));

  if (shouldSkip) return next(req);

  loadingService.start();
  return next(req).pipe(
    finalize(() => loadingService.stop()),
  );
};
