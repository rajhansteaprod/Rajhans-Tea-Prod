import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Don't attach token for public auth endpoints (login, refresh)
  // DO attach for authenticated auth endpoints (me, profile, addresses, sessions, logout-all)
  const isPublicAuthEndpoint = req.url.includes('/auth/') &&
    !req.url.includes('/auth/me') &&
    !req.url.includes('/auth/logout-all') &&
    !req.url.includes('/auth/profile') &&
    !req.url.includes('/auth/addresses') &&
    !req.url.includes('/auth/sessions');

  if (token && !isPublicAuthEndpoint) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
  } else {
    req = req.clone({ withCredentials: true });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Banned user — clear session immediately and redirect to login
      if (error.status === 403 && error.error?.message?.includes('suspended')) {
        authService.logoutBanned();
        return throwError(() => error);
      }

      if (error.status === 401 && !req.url.includes('/auth/refresh-token')) {
        return authService.refreshToken().pipe(
          switchMap((res) => {
            const newReq = req.clone({
              setHeaders: { Authorization: `Bearer ${res.data.tokens.accessToken}` },
            });
            return next(newReq);
          }),
          catchError(() => {
            authService.logout();
            return throwError(() => error);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
