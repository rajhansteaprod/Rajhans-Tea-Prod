import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { AnalyticsService } from './core/analytics/analytics.service';
import { CanonicalService } from './core/services/canonical.service';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  constructor(private analytics: AnalyticsService, private canonical: CanonicalService) {
    // Manage the self-referential canonical for every indexable route (prerender + SPA).
    this.canonical.init();
  }
}
