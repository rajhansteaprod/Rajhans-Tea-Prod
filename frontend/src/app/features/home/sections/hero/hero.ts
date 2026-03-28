import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  NgZone,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsService, HeroSlide } from '../../../../core/services/cms.service';

const AUTO_SLIDE_INTERVAL = 5000;

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrls: ['./hero.scss'],
})
export class HeroComponent implements OnInit, OnDestroy {
  private readonly cms = inject(CmsService);
  private readonly zone = inject(NgZone);

  readonly slides = signal<HeroSlide[]>([]);
  readonly activeSlide = signal(0);

  private autoSlideTimer: ReturnType<typeof setInterval> | null = null;
  private dragStartX = 0;
  private isDragging = false;

  ngOnInit(): void {
    this.cms.getActiveHeroSlides().subscribe({
      next: (res) => {
        this.slides.set(res.data);
        if (res.data.length > 1) this.startAutoSlide();
      },
    });
  }

  // ── Slide navigation ──

  goToSlide(index: number): void {
    if (index === this.activeSlide()) return;
    this.activeSlide.set(index);
    this.resetAutoSlide();
  }

  nextSlide(): void {
    const len = this.slides().length;
    if (len <= 1) return;
    this.activeSlide.set((this.activeSlide() + 1) % len);
  }

  prevSlide(): void {
    const len = this.slides().length;
    if (len <= 1) return;
    this.activeSlide.set((this.activeSlide() - 1 + len) % len);
  }

  // ── Touch/drag ──

  onPointerDown(event: PointerEvent): void {
    this.dragStartX = event.clientX;
    this.isDragging = true;
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const diff = event.clientX - this.dragStartX;
    const threshold = 50;
    if (diff > threshold) {
      this.prevSlide();
      this.resetAutoSlide();
    } else if (diff < -threshold) {
      this.nextSlide();
      this.resetAutoSlide();
    }
  }

  // ── Auto slide ──

  private startAutoSlide(): void {
    this.zone.runOutsideAngular(() => {
      this.autoSlideTimer = setInterval(() => {
        this.zone.run(() => this.nextSlide());
      }, AUTO_SLIDE_INTERVAL);
    });
  }

  private resetAutoSlide(): void {
    if (this.autoSlideTimer) clearInterval(this.autoSlideTimer);
    if (this.slides().length > 1) this.startAutoSlide();
  }

  ngOnDestroy(): void {
    if (this.autoSlideTimer) clearInterval(this.autoSlideTimer);
  }
}
