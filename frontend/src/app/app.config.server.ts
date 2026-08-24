import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideNzI18n, en_US } from 'ng-zorro-antd/i18n';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { serverTimeoutInterceptor } from './core/interceptors/server-timeout.interceptor';
import { AuthService } from './core/services/auth.service';
import { errorInterceptor } from './interceptors/error.interceptor';
export const config: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideAnimations(),
    provideRouter(routes),
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
