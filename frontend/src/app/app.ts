import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { AnalyticsService } from './core/analytics/analytics.service';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  constructor (private analytics  : AnalyticsService) {}
}
