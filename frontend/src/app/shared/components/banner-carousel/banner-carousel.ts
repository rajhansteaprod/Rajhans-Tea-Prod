import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-banner-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './banner-carousel.html',
  styleUrls: ['./banner-carousel.scss'],
})
export class BannerCarouselComponent implements OnInit, OnDestroy {
  @Input() banners: any[] = [];
  readonly currentIndex = signal(0);
  private interval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (this.banners.length > 1) {
      this.interval = setInterval(() => {
        this.currentIndex.update((i) => (i + 1) % this.banners.length);
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  goTo(index: number): void {
    this.currentIndex.set(index);
  }
}