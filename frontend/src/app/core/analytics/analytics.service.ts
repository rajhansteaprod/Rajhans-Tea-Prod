import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

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

  constructor(private router: Router) {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  trackPageView(url: string): void {
    if (!window.gtag) return;

    window.gtag('config', this.measurementId, {
      page_path: url,
    });
  }

  trackEvent(eventName: string, params: Record<string, any> = {}): void {
    if (!window.gtag) return;

    window.gtag('event', eventName, params);
  }
}