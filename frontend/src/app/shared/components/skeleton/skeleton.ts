import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Reusable skeleton loader.
 *
 * Usage:
 *   <app-skeleton type="card" />           — product card skeleton
 *   <app-skeleton type="text" />            — text line skeleton
 *   <app-skeleton type="text" count="3" />  — 3 text lines
 *   <app-skeleton type="image" />           — square image placeholder
 *   <app-skeleton type="circle" />          — avatar circle
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (type) {
      @case ('card') {
        <div class="skeleton-card">
          <div class="sk-image sk-pulse"></div>
          <div class="sk-body">
            <div class="sk-line sk-pulse" style="width:60%"></div>
            <div class="sk-line sk-pulse short" style="width:40%"></div>
          </div>
        </div>
      }
      @case ('text') {
        @for (i of lines; track i) {
          <div class="sk-line sk-pulse" [style.width]="(80 + i * 5) + '%'"></div>
        }
      }
      @case ('image') {
        <div class="sk-image sk-pulse"></div>
      }
      @case ('circle') {
        <div class="sk-circle sk-pulse"></div>
      }
    }
  `,
  styles: [`
    .sk-pulse {
      background: linear-gradient(90deg, var(--color-border-light) 25%, var(--color-bg-secondary) 50%, var(--color-border-light) 75%);
      background-size: 200% 100%;
      animation: pulse 1.5s ease-in-out infinite;
      border-radius: 4px;
    }

    @keyframes pulse {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .sk-card {
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid var(--color-border-light);
    }

    .sk-image {
      aspect-ratio: 1;
      width: 100%;
      border-radius: 12px;
    }

    .sk-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sk-line {
      height: 14px;
      border-radius: 4px;
      margin-bottom: 6px;

      &.short { height: 12px; }
    }

    .sk-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }
  `],
})
export class SkeletonComponent {
  @Input() type: 'card' | 'text' | 'image' | 'circle' = 'text';
  @Input() count = 1;

  get lines(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}
