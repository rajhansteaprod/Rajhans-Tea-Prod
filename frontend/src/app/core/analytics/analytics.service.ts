import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PlatformService } from '../services/platform.service';
import { trackStandardEvent } from '../utils/meta-pixel';

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
        // Meta Pixel: standard PageView per SPA navigation (one per route).
        // The subscription is registered in the root component constructor,
        // before the router's initial navigation, so the first hard-load
        // NavigationEnd is captured too.
        trackStandardEvent('PageView');
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