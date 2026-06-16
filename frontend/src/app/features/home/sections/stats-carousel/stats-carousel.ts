import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface Stat {
  text: string;
}

@Component({
  selector: 'app-stats-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-carousel.html',
  styleUrls: ['./stats-carousel.scss'],
})
export class StatsCarouselComponent implements OnInit, OnDestroy {
  readonly stats = signal<Stat[]>([
    { text: '25+ YEARS OF EXCELLENCE' },
    { text: '100,000+ HAPPY CUSTOMERS' },
    { text: '50,000+ 4.8 STAR RATINGS' },
    { text: 'DIRECT FROM ASSAM GARDENS' },
    { text: '100% PRODUCT TRACEABILITY' },
  ]);

  readonly displayStats = signal<Stat[]>([]);
  private scrollInterval: ReturnType<typeof setInterval> | null = null;
  readonly currentPosition = signal(0);

  ngOnInit(): void {
    // Duplicate stats for infinite scroll
    const doubled = [...this.stats(), ...this.stats()];
    this.displayStats.set(doubled);
    this.startAutoScroll();
  }

  private startAutoScroll(): void {
    this.scrollInterval = setInterval(() => {
      this.currentPosition.update((pos) => pos + 1);
      const totalWidth = this.stats().length;
      if (this.currentPosition() >= totalWidth) {
        this.currentPosition.set(0);
      }
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.scrollInterval) clearInterval(this.scrollInterval);
  }
}
