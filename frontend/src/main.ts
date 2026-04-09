import { bootstrapApplication } from '@angular/platform-browser';
import { provideClientHydration } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

const browserConfig = {
  ...appConfig,
  providers: [...appConfig.providers, provideClientHydration()],
};

bootstrapApplication(App, browserConfig)
  .catch((err) => console.error(err));
