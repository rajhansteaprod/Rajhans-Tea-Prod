import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService, Product } from '../../core/services/catalog.service';
import { FeaturedProductsComponent } from './sections/featured-products/featured-products';
import { BigStatementComponent } from './sections/big-statement/big-statement';
import { SplitVisualComponent } from './sections/split-visual/split-visual';
import { ExploreCtaComponent } from './sections/explore-cta/explore-cta';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, FeaturedProductsComponent, BigStatementComponent, SplitVisualComponent, ExploreCtaComponent],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly catalogService = inject(CatalogService);
  private readonly el = inject(ElementRef);

  readonly spotlightProducts = signal<Product[]>([]);
  readonly activeSlide = signal(0);

  private ctx: gsap.Context | null = null;

  ngOnInit(): void {
    this.catalogService
      .getProductsPublic({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({ next: (res) => this.spotlightProducts.set(res.data) });
  }

  prevSlide(): void {
    const len = this.spotlightProducts().length;
    if (len === 0) return;
    this.activeSlide.set((this.activeSlide() - 1 + len) % len);
  }

  nextSlide(): void {
    const len = this.spotlightProducts().length;
    if (len === 0) return;
    this.activeSlide.set((this.activeSlide() + 1) % len);
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    // All GSAP queries scoped to component's own DOM
    this.ctx = gsap.context(() => {
      // ── Hero entry animation ──
      const hero = root.querySelector('.hero')!;
      const tl = gsap.timeline({ delay: 0.2 });

      // Frame scales in
      tl.from(root.querySelector('.hero__frame')!, {
        scale: 0.92, opacity: 0, duration: 1, ease: 'expo.out',
      });

      // Visual slides in from left
      tl.from(root.querySelector('.hero__visual')!, {
        x: -60, opacity: 0, duration: 0.8, ease: 'expo.out',
      }, '-=0.5');

      // Text lines stagger in from right
      tl.from(root.querySelectorAll('.hero__line'), {
        x: 40, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.1,
      }, '-=0.5');

      // Subtitle + actions
      tl.from(root.querySelector('.hero__sub')!, {
        y: 20, opacity: 0, duration: 0.6, ease: 'expo.out',
      }, '-=0.3');
      tl.from(root.querySelector('.hero__actions')!, {
        y: 15, opacity: 0, duration: 0.5, ease: 'expo.out',
      }, '-=0.3');

      // Scroll chevron
      tl.from(root.querySelector('.hero__scroll')!, {
        opacity: 0, duration: 0.6,
      }, '-=0.2');

      // Parallax on scroll — frame shrinks slightly
      gsap.to(root.querySelector('.hero__frame')!, {
        scale: 0.95, yPercent: 5, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });

      // New sections will add their own GSAP animations
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
