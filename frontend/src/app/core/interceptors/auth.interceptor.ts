import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, Subject, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL STATE: Prevent concurrent refresh attempts
// ═══════════════════════════════════════════════════════════════════════════

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH INTERCEPTOR: Handle 401s and token refresh
// ═══════════════════════════════════════════════════════════════════════════

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Determine if this is a public auth endpoint
  // ─────────────────────────────────────────────────────────────────────────
  // Public endpoints (no token needed): /auth/login, /auth/refresh-token
  // Protected endpoints (token needed): /auth/me, /auth/logout-all, /auth/profile

  const isPublicAuthEndpoint = req.url.includes('/auth/') &&
    !req.url.includes('/auth/me') &&
    !req.url.includes('/auth/logout-all') &&
    !req.url.includes('/auth/profile') &&
    !req.url.includes('/auth/addresses') &&
    !req.url.includes('/auth/sessions');

  const isRefreshEndpoint = req.url.includes('/auth/refresh-token');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Attach access token if available (and not a public endpoint)
  // ─────────────────────────────────────────────────────────────────────────

  if (token && !isPublicAuthEndpoint) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
  } else {
    req = req.clone({ withCredentials: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Handle response and errors
  // ─────────────────────────────────────────────────────────────────────────

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // ───────────────────────────────────────────────────────────────────
      // ERROR CASE 1: User is suspended/banned (403)
      // → Immediate logout, no retry
      // ───────────────────────────────────────────────────────────────────
      if (error.status === 403 && error.error?.message?.includes('suspended')) {
        authService.logoutBanned();
        return throwError(() => error);
      }

      // ───────────────────────────────────────────────────────────────────
      // ERROR CASE 2: Unauthorized (401) on a protected endpoint
      // → Try to refresh token (but only once)
      // ───────────────────────────────────────────────────────────────────
      if (error.status === 401 && !isRefreshEndpoint && !isPublicAuthEndpoint) {
        return handle401Error(authService, req, next);
      }

      // ───────────────────────────────────────────────────────────────────
      // ERROR CASE 3: Refresh token call itself fails (401)
      // → Token is invalid/expired, must login again
      // → DO NOT RETRY
      // ───────────────────────────────────────────────────────────────────
      if (error.status === 401 && isRefreshEndpoint) {
        authService.logout();
        return throwError(() => error);
      }

      // All other errors pass through
      return throwError(() => error);
    }),
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Handle 401 errors with proper token refresh logic
// ═══════════════════════════════════════════════════════════════════════════

function handle401Error(
  authService: AuthService,
  req: any,
  next: any
): any {
  // ─────────────────────────────────────────────────────────────────────────
  // PREVENT CONCURRENT REFRESH ATTEMPTS
  // ─────────────────────────────────────────────────────────────────────────
  // If refresh is already in progress, wait for it to complete
  // Then retry this request with the new token
  // ─────────────────────────────────────────────────────────────────────────

  if (!isRefreshing) {
    // First 401: Start refresh
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshToken().pipe(
      switchMap((res: any) => {
        // Refresh succeeded: update the subject so queued requests can retry
        isRefreshing = false;
        const newToken = res.data.tokens.accessToken;
        refreshTokenSubject.next(newToken);

        // Retry original request with new token
        const newReq = req.clone({
          setHeaders: { Authorization: `Bearer ${newToken}` },
        });
        return next(newReq);
      }),
      catchError((refreshError: HttpErrorResponse) => {
        // Refresh failed: user must login again
        isRefreshing = false;
        authService.logout();
        return throwError(() => refreshError);
      }),
    );
  } else {
    // Refresh already in progress: wait for the new token
    return refreshTokenSubject.pipe(
      filter((token) => token != null),
      take(1),
      switchMap((newToken: string) => {
        // Retry original request with refreshed token
        const newReq = req.clone({
          setHeaders: { Authorization: `Bearer ${newToken}` },
        });
        return next(newReq);
      }),
      catchError(() => {
        // If we get here, refresh failed after waiting
        authService.logout();
        return throwError(() => new Error('Token refresh failed'));
      }),
    );
  }
}
