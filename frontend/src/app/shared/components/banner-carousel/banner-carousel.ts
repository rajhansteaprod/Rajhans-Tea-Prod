import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-banner-carousel',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (banners.length > 0) {
      <div class="carousel">
        @for (banner of banners; track banner._id; let i = $index) {
          <div class="slide" [class.active]="currentIndex() === i">
            <a [href]="banner.link || '#'" class="slide-link">
              <img [src]="banner.image" [alt]="banner.title" />
              <div class="slide-overlay">
                <h2 class="slide-title">{{ banner.title }}</h2>
                @if (banner.subtitle) {
                  <p class="slide-subtitle">{{ banner.subtitle }}</p>
                }
              </div>
            </a>
          </div>
        }
        @if (banners.length > 1) {
          <div class="dots">
            @for (banner of banners; track banner._id; let i = $index) {
              <button class="dot" [class.active]="currentIndex() === i" (click)="goTo(i)"></button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .carousel { position:relative; border-radius: $radius-xxl; overflow:hidden; aspect-ratio:3/1; background: $color-bg-secondary; margin-bottom: $space-xxl; }
    .slide { position:absolute; inset:0; opacity:0; transition: opacity $transition-slow;
      &.active { opacity:1; }
    }
    .slide-link { display:block; width:100%; height:100%; text-decoration:none; }
    .slide-link img { width:100%; height:100%; object-fit:cover; }
    .slide-overlay { position:absolute; bottom:0; left:0; right:0; padding: $space-xxl; background:linear-gradient(transparent, rgba(0,0,0,.6)); color:white; }
    .slide-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; margin:0 0 $space-xxs; }
    .slide-subtitle { font-size: $font-size-md; margin:0; opacity:.9; }
    .dots { position:absolute; bottom: $space-md; left:50%; transform:translateX(-50%); display:flex; gap: $space-xs; }
    .dot { width:8px; height:8px; border-radius:50%; border:none; background:rgba(255,255,255,.5); cursor:pointer; transition: all $transition-fast;
      &.active { background:white; width:24px; border-radius:4px; }
    }
  `],
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
