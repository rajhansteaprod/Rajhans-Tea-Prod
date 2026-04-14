import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container';
import { LoadingBarComponent } from './shared/components/loading-bar/loading-bar';
import { PageLoaderComponent } from './shared/components/page-loader/page-loader';
import { NavigationLoaderService } from './core/services/navigation-loader.service';

/**
 * App Root Component
 *
 * LOADING STRATEGY:
 * ─────────────────
 * 1. PageLoaderComponent: Global route navigation loader (client-side only)
 *    - Appears when user clicks a route link
 *    - Disappears when route is activated
 *    - NO loader on initial page load (SSR optimization)
 *
 * 2. LoadingBarComponent: HTTP request loader
 *    - Appears when LoadingService.start() is called
 *    - Used by HTTP interceptors and API calls
 *    - Separate from route navigation
 *
 * 3. Component-level loaders: Managed by individual components
 *    - Use LoaderContextService.isNavigating() to skip if global nav is in progress
 *    - Keep component loaders for data-fetching within a page
 *
 * ARCHITECTURE DECISION (Option A - Hierarchical):
 * - Global nav loading → PageLoaderComponent only
 * - Component data loading → Component-level loader only
 * - HTTP loading → LoadingBarComponent only
 * - Never show multiple loaders at once
 */

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, LoadingBarComponent, PageLoaderComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  // Initialize NavigationLoaderService (runs setup in constructor)
  private readonly navigationLoader = inject(NavigationLoaderService);
}
