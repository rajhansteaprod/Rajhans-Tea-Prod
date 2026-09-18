import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, UrlSerializer } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideClientHydration } from '@angular/platform-browser';
import { provideNzI18n, en_US } from 'ng-zorro-antd/i18n';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { TrailingSlashUrlSerializer } from './core/routing/trailing-slash-url-serializer';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { serverTimeoutInterceptor } from './core/interceptors/server-timeout.interceptor';
import { AuthService } from './core/services/auth.service';
import { errorInterceptor } from './interceptors/error.interceptor';
export const config: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Mirrors main.ts's browser bootstrap. Without this here, the server
    // render never emits hydration (`ngh`) annotations or an HTTP
    // transfer-cache state blob at all — client bootstrap then has nothing
    // to hydrate from and silently falls back to a full destructive re-render
    // (component state starts fresh, including a synchronous re-fetch of any
    // data an ngOnInit loads), which is what was turning a correctly
    // prerendered blog page into "Blog Post Not Found" after Angular executed.
    provideClientHydration(),
    provideAnimations(),
    provideRouter(routes),
    { provide: UrlSerializer, useClass: TrailingSlashUrlSerializer },
    provideHttpClient(withInterceptors([serverTimeoutInterceptor, authInterceptor, loadingInterceptor, errorInterceptor])),
    provideNzI18n(en_US),
    {
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => () => firstValueFrom(authService.initializeAuth()),
      deps: [AuthService],
      multi: true,
    },
  ],
};
