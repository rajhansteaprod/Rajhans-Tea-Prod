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
  templateUrl: './skeleton.html',
  styleUrls: ['./skeleton.scss'],
})
export class SkeletonComponent {
  @Input() type: 'card' | 'text' | 'image' | 'circle' = 'text';
  @Input() count = 1;

  get lines(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}