import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsService, HeroSlide } from '../../../../core/services/cms.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrls: ['./hero.scss'],
})
export class HeroComponent implements OnInit {
  private readonly cms = inject(CmsService);

  readonly slides = signal<HeroSlide[]>([]);
  readonly activeSlide = signal(0);

  private dragStartX = 0;
  private isDragging = false;

  ngOnInit(): void {
    this.cms.getActiveHeroSlides().subscribe({
      next: (res) => {
        this.slides.set(res.data);
      },
    });
  }

  // ── Slide navigation ──

  goToSlide(index: number): void {
    if (index === this.activeSlide()) return;
    this.activeSlide.set(index);
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
    } else if (diff < -threshold) {
      this.nextSlide();
    }
  }
}
