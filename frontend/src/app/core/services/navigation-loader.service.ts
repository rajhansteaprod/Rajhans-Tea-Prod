import { Injectable, signal, effect, inject } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { filter, debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/**
 * NavigationLoaderService - Handles global route navigation loading state
 *
 * KEY BEHAVIORS:
 * 1. NO loader on initial page load (SSR/first paint assumed fast)
 * 2. Shows loader ONLY on client-side navigation (route changes)
 * 3. Prevents flicker with 200ms debounce (if nav completes fast, no loader shown)
 * 4. Hides loader on NavigationEnd, NavigationCancel, or NavigationError
 *
 * SEPARATION OF CONCERNS:
 * - This handles ROUTE NAVIGATION loading
 * - Component-level loaders handle DATA loading within a page
 * - Do NOT show both at the same time (use isNavigating() signal to skip component loaders)
 */

@Injectable({ providedIn: 'root' })
export class NavigationLoaderService {
  private readonly router = inject(Router);

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNALS: Reactive state management
  // ═══════════════════════════════════════════════════════════════════════════

  // Track if we're currently navigating
  readonly isNavigating = signal(false);

  // Track if this is the initial page load (skip loader on first load)
  readonly isInitialLoad = signal(true);

  // Combined: should we show the loader?
  readonly isLoading = signal(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Debounce subjects for flicker prevention
  // ═══════════════════════════════════════════════════════════════════════════

  private navigationStartSubject = new Subject<void>();

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR: Setup router event listeners
  // ═══════════════════════════════════════════════════════════════════════════

  constructor() {
    this.initializeNavigation();
    this.setupFlickerPrevention();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Initialize router event handling
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Listen to all router navigation events
   * NavigationEnd occurs when route is activated (page is ready)
   */
  private initializeNavigation(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd ||
                         event instanceof NavigationCancel || event instanceof NavigationError),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          // ─────────────────────────────────────────────────────────────────
          // STEP 1: Navigation started
          // Skip loader if this is the initial page load
          // ─────────────────────────────────────────────────────────────────
          if (this.isInitialLoad()) {
            this.isInitialLoad.set(false); // Mark initial load as done
            return; // Don't show loader on first load
          }

          // Mark as navigating, but don't show loader yet (debounce prevents flicker)
          this.isNavigating.set(true);
          this.navigationStartSubject.next();
        }

        if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
          // ─────────────────────────────────────────────────────────────────
          // STEP 2: Navigation completed/cancelled/errored
          // Hide the loader and reset navigation state
          // ─────────────────────────────────────────────────────────────────
          this.isNavigating.set(false);
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Prevent flicker: Only show loader if navigation takes >200ms
   *
   * WHY THIS MATTERS:
   * - On fast networks, route changes complete in <100ms
   * - Showing a loader for 100ms creates jarring visual flicker
   * - User perceives it as slower than it actually is
   * - By debouncing to 200ms, we only show loader on slow navigations
   *
   * FLOW:
   * 1. User clicks route link (NavigationStart emitted)
   * 2. Timer starts (200ms)
   * 3a. If NavEnd arrives before 200ms: loader never shown (great UX!)
   * 3b. If NavEnd arrives after 200ms: loader was already showing (user appreciates feedback)
   */
  private setupFlickerPrevention(): void {
    this.navigationStartSubject
      .pipe(
        debounceTime(200), // Wait 200ms before showing loader
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // Only show loader if we're still navigating after 200ms
        if (this.isNavigating()) {
          this.isLoading.set(true);
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: Query methods for components
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Use in component templates to check if global navigation is in progress
   *
   * EXAMPLE:
   * @if (loading() && !navigationLoader.isNavigating()) {
   *   <my-component-loader />
   * }
   *
   * This prevents showing BOTH global loader + component loader at the same time
   */
  isCurrentlyNavigating(): boolean {
    return this.isNavigating();
  }

  /**
   * Check if this is the very first page load
   * Useful for skipping loaders on SSR initial render
   */
  isFirstLoad(): boolean {
    return this.isInitialLoad();
  }
}
