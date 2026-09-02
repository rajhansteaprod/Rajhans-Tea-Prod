import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PlatformService } from '../services/platform.service';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly measurementId = 'G-16DFYCDSY5';
  private readonly platform = inject(PlatformService);

  constructor(private router: Router) {
    if (!this.platform.isBrowser) return;

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  trackPageView(url: string): void {
    if (!this.platform.isBrowser || !window.gtag) return;

    window.gtag('config', this.measurementId, {
      page_path: url,
    });
  }

  trackEvent(eventName: string, params: Record<string, any> = {}): void {
    if (!this.platform.isBrowser || !window.gtag) return;

    window.gtag('event', eventName, params);
  }
}