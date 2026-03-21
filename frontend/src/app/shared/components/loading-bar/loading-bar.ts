import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loadingService.loading()) {
      <div class="loading-bar" role="progressbar" aria-label="Loading">
        <div class="loading-bar-inner"></div>
      </div>
    }
  `,
  styles: [`
    .loading-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      z-index: 99999;
      background: transparent;
      overflow: hidden;
    }

    .loading-bar-inner {
      height: 100%;
      background: linear-gradient(90deg, var(--color-primary), var(--color-primary-hover), var(--color-primary));
      animation: loading 1.5s ease-in-out infinite;
      width: 40%;
      border-radius: 0 2px 2px 0;
    }

    @keyframes loading {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
  `],
})
export class LoadingBarComponent {
  readonly loadingService = inject(LoadingService);
}
