import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PlatformService } from '../core/services/platform.service';

export function errorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {

  const router = inject(Router);
  const platform = inject(PlatformService);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Browser only. Routes like product/:slug are prerendered at build time
      // (see app.routes.server.ts), and a navigation that happens mid-render is
      // serialized as a permanent `<meta http-equiv="refresh" url=/404>` file
      // for that route. A single transient 404 from the live API during the
      // build would otherwise bake a 404 redirect into the shipped HTML, so
      // every refresh/direct hit on that page bounces to /404 until the next
      // deploy.
      if (error.status === 404 && platform.isBrowser) {
        router.navigate(['/404']);
      }

      return throwError(() => error);
    })
  );
}