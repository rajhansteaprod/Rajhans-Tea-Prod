import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Slide {
  id: number;
  eyebrow: string;
  title: string;
  titleHighlight: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  image: string;
  usps: Array<{ icon: string; title: string; desc: string }>;
}

@Component({
  selector: 'app-usp2',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usp2.html',
  styleUrls: ['./usp2.scss'],
})
export class Usp2Component implements OnInit, OnDestroy {
  readonly currentIndex = signal(0);
  readonly slides = signal<Slide[]>([
    {
      id: 1,
      eyebrow: 'Since 1962 · Assam, India',
      title: 'Where Every Leaf',
      titleHighlight: 'Story',
      subtitle: 'Handpicked at sunrise from our single estate gardens, Rajhans tea carries the soul of six decades of mastery.',
      ctaPrimary: 'Explore Collection',
      ctaSecondary: 'Our Heritage',
      image: 'https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=1600&q=80',
      usps: [
        { icon: '📍', title: 'Single Estate', desc: 'Direct from our 200-acre garden in the Brahmaputra valley' },
        { icon: '🌿', title: 'Hand Plucked', desc: 'Only the finest two leaves and a bud, gathered by skilled artisans' },
        { icon: '⏰', title: 'Zero Additives', desc: 'Pure unadulterated leaves — no artificial flavours or preservatives' },
        { icon: '⭐', title: 'Award Winning', desc: 'National Tea Board Gold — recognized for excellence since 1988' },
      ],
    },
    {
      id: 2,
      eyebrow: 'Organic Certified · USDA & India Organic',
      title: 'Grown with the',
      titleHighlight: "Earth's Blessing",
      subtitle: 'Our gardens breathe naturally — no pesticides, no chemicals. Just rich soil, mountain mist, and centuries of know-how.',
      ctaPrimary: 'Shop Now',
      ctaSecondary: 'Sustainability',
      image: 'https://images.unsplash.com/photo-1567922045116-2a00fae2ed03?w=1600&q=80',
      usps: [
        { icon: '📍', title: 'Single Estate', desc: 'Direct from our 200-acre garden in the Brahmaputra valley' },
        { icon: '🌿', title: 'Hand Plucked', desc: 'Only the finest two leaves and a bud, gathered by skilled artisans' },
        { icon: '⏰', title: 'Zero Additives', desc: 'Pure unadulterated leaves — no artificial flavours or preservatives' },
        { icon: '⭐', title: 'Award Winning', desc: 'National Tea Board Gold — recognized for excellence since 1988' },
      ],
    },
    {
      id: 3,
      eyebrow: 'Heritage Blends · Limited Reserve',
      title: 'A Cup Steeped in',
      titleHighlight: 'Tradition',
      subtitle: 'Each batch is small-lot crafted, maintaining the nuanced character that has earned Rajhans its place in the finest homes of India.',
      ctaPrimary: 'Reserve Yours',
      ctaSecondary: 'Learn More',
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80',
      usps: [
        { icon: '📍', title: 'Single Estate', desc: 'Direct from our 200-acre garden in the Brahmaputra valley' },
        { icon: '🌿', title: 'Hand Plucked', desc: 'Only the finest two leaves and a bud, gathered by skilled artisans' },
        { icon: '⏰', title: 'Zero Additives', desc: 'Pure unadulterated leaves — no artificial flavours or preservatives' },
        { icon: '⭐', title: 'Award Winning', desc: 'National Tea Board Gold — recognized for excellence since 1988' },
      ],
    },
  ]);

  readonly activeSlide = computed(() => this.slides()[this.currentIndex()]);
  readonly totalSlides = computed(() => this.slides().length);
  readonly progress = computed(() => ((this.currentIndex() + 1) / this.totalSlides()) * 100);

  private autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DURATION = 6000;

  ngOnInit(): void {
    this.startAutoPlay();
  }

  ngOnDestroy(): void {
    if (this.autoPlayTimer) clearTimeout(this.autoPlayTimer);
  }

  goToSlide(index: number): void {
    this.currentIndex.set((index + this.totalSlides()) % this.totalSlides());
    this.restartAutoPlay();
  }

  nextSlide(): void {
    this.goToSlide(this.currentIndex() + 1);
  }

  prevSlide(): void {
    this.goToSlide(this.currentIndex() - 1);
  }

  private startAutoPlay(): void {
    if (this.autoPlayTimer) clearTimeout(this.autoPlayTimer);
    this.autoPlayTimer = setTimeout(() => this.nextSlide(), this.DURATION);
  }

  private restartAutoPlay(): void {
    this.startAutoPlay();
  }
}
