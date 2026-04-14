import { Injectable, computed, inject } from '@angular/core';
import { NavigationLoaderService } from './navigation-loader.service';

/**
 * LoaderContextService - Exposes global loading context to components
 *
 * This is a lightweight wrapper around NavigationLoaderService
 * Makes it easy for components to check: "Am I being skipped because global nav is loading?"
 *
 * USE THIS in component templates:
 * @if (myLoading() && !loaderContext.isNavigating()) {
 *   <my-spinner />
 * }
 */

@Injectable({ providedIn: 'root' })
export class LoaderContextService {
  private readonly navigationLoader = inject(NavigationLoaderService);

  // Expose for template use
  readonly isNavigating = computed(() => this.navigationLoader.isNavigating());
  readonly isLoading = computed(() => this.navigationLoader.isLoading());
  readonly isInitialLoad = computed(() => this.navigationLoader.isInitialLoad());

  /**
   * Call this in ngOnInit of a component that wants to know:
   * "Should I skip showing my loader because global navigation is happening?"
   *
   * EXAMPLE in ProductsPageComponent:
   * ngOnInit() {
   *   this.loadProducts();
   * }
   *
   * In template:
   * @if (loading() && !this.loaderContext.isNavigating()) {
   *   <skeleton-loader />
   * }
   */
  shouldSkipComponentLoader(): boolean {
    return this.navigationLoader.isCurrentlyNavigating();
  }
}
