import { Component, inject, signal, effect } from '@angular/core';
import { NavigationLoaderService } from '../../../core/services/navigation-loader.service';

/**
 * PageLoaderComponent - Global route navigation loader
 *
 * Shows a centered spinner when user navigates between routes.
 *
 * KEY FEATURES:
 * ✅ No loader on initial page load (SSR optimization)
 * ✅ Shows loader only on client-side navigation
 * ✅ 200ms debounce prevents flicker on fast navigations
 * ✅ Smooth fade-out animation on NavigationEnd
 *
 * ARCHITECTURE:
 * - Injects NavigationLoaderService (handles all logic)
 * - Reacts to isLoading signal
 * - Manages animation states (visible/leaving)
 *
 * NO CHANGES NEEDED in parent components!
 */

@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.html',
  styleUrls: ['./page-loader.scss'],
})
export class PageLoaderComponent {
  private readonly navigationLoader = inject(NavigationLoaderService);

  // ─────────────────────────────────────────────────────────────────────────
  // UI STATE SIGNALS
  // ─────────────────────────────────────────────────────────────────────────

  // Should the loader element be rendered in DOM?
  readonly visible = signal(false);

  // Should the loader animate out? (used for CSS animation)
  readonly leaving = signal(false);

  // ─────────────────────────────────────────────────────────────────────────
  // REACTIVE EFFECTS: Sync with NavigationLoaderService
  // ─────────────────────────────────────────────────────────────────────────

  constructor() {
    // When isLoading changes, update visibility
    effect(
      () => {
        if (this.navigationLoader.isLoading()) {
          // Loader should appear
          this.leaving.set(false);
          this.visible.set(true);
        } else if (this.visible()) {
          // Loader should disappear with animation
          this.leaving.set(true);

          // Wait for CSS animation (500ms) before removing from DOM
          // This prevents abrupt disappearance
          setTimeout(() => {
            this.visible.set(false);
            this.leaving.set(false);
          }, 500);
        }
      },
      { allowSignalWrites: true }, // Allow writing to signals inside effect
    );
  }
}

