import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServerRendering } from '@angular/platform-server';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideNzI18n, en_US } from 'ng-zorro-antd/i18n';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { AuthService } from './core/services/auth.service';

export const config: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideAnimations(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor])),
    provideNzI18n(en_US),
    {
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => () => firstValueFrom(authService.initializeAuth()),
      deps: [AuthService],
      multi: true,
    },
  ],
};
