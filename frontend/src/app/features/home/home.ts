import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  AfterViewInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PersonalizationStore } from '../../core/services/personalization.store';
import { CatalogService, Collection, Product } from '../../core/services/catalog.service';
import { CartStore } from '../../core/services/cart.store';
import { ProductRailComponent } from '../../shared/components/product-rail/product-rail';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductRailComponent],
  template: `
    <div class="home" #homeContainer>
      <!-- ═══ HERO ═══ -->
      <section class="hero">
        <div class="hero-bg"></div>
        <div class="hero-content">
          <span class="hero-label">Rajhans Tea</span>
          <h1 class="hero-headline">
            <span class="hero-line" #heroLine1>Every cup,</span>
            <span class="hero-line italic" #heroLine2>a moment.</span>
          </h1>
          <p class="hero-sub">Premium teas sourced from the finest gardens of India,<br />crafted for those who savour the ritual.</p>
          <div class="hero-ctas">
            <a routerLink="/collections" class="btn-hero-primary">Shop Collection</a>
            <a routerLink="/page/about-us" class="btn-hero-ghost">Our Story</a>
          </div>
        </div>
        <div class="hero-scroll-hint">
          <div class="scroll-line"></div>
        </div>
      </section>

      <!-- ═══ BRAND STATEMENT ═══ -->
      <section class="brand-band">
        <div class="band-inner">
          <div class="band-rule"></div>
          <p class="band-text">Sourced by hand. Steeped with intention.</p>
          <div class="band-rule"></div>
        </div>
      </section>

      <!-- ═══ FEATURED COLLECTIONS ═══ -->
      @if (collections().length > 0) {
        <section class="collections-section">
          <div class="section-header">
            <span class="section-label">Curated</span>
            <h2 class="section-title">Our Collections</h2>
          </div>
          <div class="collections-grid">
            @for (col of collections().slice(0, 3); track col._id; let i = $index) {
              <a
                [routerLink]="'/catalog/' + col.slug"
                class="collection-card"
                [class.large]="i === 0"
              >
                <div class="collection-img">
                  @if (col.image) {
                    <img [src]="col.image" [alt]="col.name" loading="lazy" />
                  }
                  <div class="collection-overlay"></div>
                </div>
                <div class="collection-info">
                  <h3 class="collection-name">{{ col.name }}</h3>
                  @if (col.description) {
                    <p class="collection-desc">{{ col.description }}</p>
                  }
                  <span class="collection-cta">Explore <span class="arrow">&rarr;</span></span>
                </div>
              </a>
            }
          </div>
        </section>
      }

      <!-- ═══ PRODUCT SPOTLIGHT ═══ -->
      @if (spotlightProducts().length > 0) {
        <section class="spotlight-section">
          <div class="section-header">
            <span class="section-label">Handpicked</span>
            <h2 class="section-title">Featured Teas</h2>
          </div>
          @for (p of spotlightProducts().slice(0, 3); track p._id; let i = $index) {
            <div class="spotlight-row" [class.reverse]="i % 2 !== 0">
              <div class="spotlight-image">
                @if (p.images?.[0]) {
                  <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                } @else {
                  <div class="spotlight-placeholder"></div>
                }
              </div>
              <div class="spotlight-text">
                <span class="spotlight-category">{{ p.category?.name || 'Tea' }}</span>
                <h3 class="spotlight-name">{{ p.name }}</h3>
                @if (p.shortDescription || p.description) {
                  <p class="spotlight-desc">{{ p.shortDescription || p.description }}</p>
                }
                <div class="spotlight-bottom">
                  <span class="spotlight-price">&#8377;{{ p.basePrice }}</span>
                  <a [routerLink]="'/product/' + p.slug" class="btn-spotlight">View Details</a>
                </div>
              </div>
            </div>
          }
        </section>
      }

      <!-- ═══ STORY TEASER ═══ -->
      <section class="story-section">
        <div class="story-bg"></div>
        <div class="story-content">
          <h2 class="story-headline">From the gardens of India<br /><em>to your morning ritual.</em></h2>
          <a routerLink="/page/about-us" class="btn-story">Read Our Story &rarr;</a>
        </div>
      </section>

      <!-- ═══ PRODUCT RAILS (from feed) ═══ -->
      @if (feedStore.feedLoading()) {
        <div class="loading-section">
          <div class="loading-spinner"></div>
        </div>
      } @else if (feedStore.feed()) {
        @for (section of feedStore.feed()!.sections; track section.key) {
          <section class="rail-wrapper">
            <app-product-rail
              [title]="section.title"
              [products]="section.products"
              [viewAllLink]="'/products'"
            />
          </section>
        }
      }

      <!-- ═══ VALUES BAND ═══ -->
      <section class="values-section">
        <div class="values-grid">
          <div class="value-item">
            <div class="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h4 class="value-title">100% Authentic</h4>
            <p class="value-desc">Direct from certified tea gardens</p>
          </div>
          <div class="value-item">
            <div class="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <h4 class="value-title">Freshly Packed</h4>
            <p class="value-desc">Sealed within 24 hours of plucking</p>
          </div>
          <div class="value-item">
            <div class="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <h4 class="value-title">Pan India Delivery</h4>
            <p class="value-desc">Free shipping on orders above &#8377;499</p>
          </div>
          <div class="value-item">
            <div class="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h4 class="value-title">Crafted with Love</h4>
            <p class="value-desc">Small-batch, artisanal quality</p>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      @use '../../core/design-tokens/tokens' as *;
      @use '../../core/design-tokens/mixins' as *;

      .home {
        overflow: hidden;
      }

      // ═══════════════════════════════════════════════
      // HERO
      // ═══════════════════════════════════════════════
      .hero {
        position: relative;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: $space-xxxl $space-lg;
        overflow: hidden;
        @include full-bleed;
      }

      .hero-bg {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(160deg, rgba(58,45,50,0.85) 0%, rgba(58,45,50,0.6) 50%, rgba(204,88,3,0.3) 100%),
          linear-gradient(to bottom, $color-bg-dark, #2a1f22);
        background-size: cover;
        background-position: center;
        background-attachment: fixed;
        z-index: 0;

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 30% 50%, rgba(204,88,3,0.12) 0%, transparent 60%);
        }

        &::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 180px;
          background: linear-gradient(transparent, $color-bg-primary);
        }
      }

      .hero-content {
        position: relative;
        z-index: 1;
        max-width: 800px;
      }

      .hero-label {
        display: inline-block;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: $color-primary;
        margin-bottom: $space-xl;
        opacity: 0;
        padding: 6px 20px;
        border: 1px solid rgba(204,88,3,0.3);
        border-radius: $radius-full;
      }

      .hero-headline {
        font-family: $font-family-display;
        font-size: clamp(48px, 8vw, $font-size-hero);
        font-weight: 300;
        line-height: 1.1;
        letter-spacing: $letter-spacing-display;
        color: rgba(255,255,255,0.95);
        margin: 0 0 $space-xl;
      }

      .hero-line {
        display: block;
        opacity: 0;
        transform: translateY(40px);
      }

      .hero-line.italic {
        font-style: italic;
        color: $color-primary;
      }

      .hero-sub {
        font-size: clamp($font-size-md, 2vw, $font-size-lg);
        color: rgba(255,255,255,0.6);
        line-height: $line-height-relaxed;
        margin-bottom: $space-xxl;
        opacity: 0;
      }

      .hero-ctas {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: $space-md;
        opacity: 0;
      }

      .btn-hero-primary {
        display: inline-flex;
        align-items: center;
        padding: $space-md $space-xxl;
        background: $color-primary;
        color: white;
        border-radius: $radius-full;
        font-size: $font-size-md;
        font-weight: $font-weight-semibold;
        text-decoration: none;
        transition: all $transition-normal;
        letter-spacing: 0.01em;

        &:hover {
          background: $color-primary-hover;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(204, 88, 3, 0.4);
        }
      }

      .btn-hero-ghost {
        display: inline-flex;
        align-items: center;
        padding: $space-md $space-xxl;
        background: transparent;
        color: rgba(255,255,255,0.85);
        border: 1.5px solid rgba(255,255,255,0.25);
        border-radius: $radius-full;
        font-size: $font-size-md;
        font-weight: $font-weight-medium;
        text-decoration: none;
        transition: all $transition-normal;

        &:hover {
          border-color: rgba(255,255,255,0.6);
          color: white;
          transform: translateY(-2px);
        }
      }

      .hero-scroll-hint {
        position: absolute;
        bottom: $space-xxl;
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
      }

      .scroll-line {
        width: 1px;
        height: 48px;
        background: linear-gradient(to bottom, rgba(255,255,255,0.4), transparent);
        animation: scrollPulse 2s ease-in-out infinite;
      }

      @keyframes scrollPulse {
        0%, 100% { opacity: 0.3; transform: scaleY(0.6); }
        50% { opacity: 1; transform: scaleY(1); }
      }

      // ═══════════════════════════════════════════════
      // BRAND STATEMENT BAND
      // ═══════════════════════════════════════════════
      .brand-band {
        padding: $space-xxxl 0;
        background: $color-bg-dark;
        @include full-bleed;
      }

      .band-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: $space-xxl;
        max-width: 900px;
        margin: 0 auto;
        padding: 0 $space-lg;

        @include respond-to(md) {
          flex-direction: column;
          gap: $space-lg;
        }
      }

      .band-rule {
        flex: 1;
        height: 1px;
        background: rgba(252, 255, 247, 0.15);
        transform: scaleX(0);

        @include respond-to(md) {
          width: 60px;
          flex: none;
        }
      }

      .band-text {
        font-family: $font-family-display;
        font-size: clamp($font-size-xl, 3vw, $font-size-xxl);
        font-style: italic;
        font-weight: 300;
        color: $color-text-inverse;
        text-align: center;
        white-space: nowrap;
        margin: 0;
        opacity: 0;

        @include respond-to(md) {
          white-space: normal;
        }
      }

      // ═══════════════════════════════════════════════
      // COLLECTIONS GRID
      // ═══════════════════════════════════════════════
      .collections-section {
        padding: $space-xxxl 0;
      }

      .section-header {
        text-align: center;
        margin-bottom: $space-xxl;
      }

      .section-label {
        display: block;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: $color-secondary;
        margin-bottom: $space-sm;
      }

      .section-title {
        font-family: $font-family-display;
        font-size: clamp($font-size-xxl, 4vw, $font-size-xxxl);
        font-weight: 400;
        letter-spacing: $letter-spacing-display;
        color: $color-text-primary;
        margin: 0;
      }

      .collections-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: $space-md;
        min-height: 500px;

        @include respond-to(md) {
          grid-template-columns: 1fr;
          grid-template-rows: auto;
          min-height: auto;
        }
      }

      .collection-card {
        position: relative;
        border-radius: $radius-xl;
        overflow: hidden;
        text-decoration: none;
        min-height: 220px;

        &.large {
          grid-row: 1 / 3;

          @include respond-to(md) {
            grid-row: auto;
          }
        }

        &:hover {
          .collection-img img {
            transform: scale(1.04);
          }
          .collection-overlay {
            background: rgba(58, 45, 50, 0.55);
          }
          .arrow {
            transform: translateX(4px);
          }
        }
      }

      .collection-img {
        position: absolute;
        inset: 0;
        background: $color-bg-secondary;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.6s $ease-expo-out;
        }
      }

      .collection-overlay {
        position: absolute;
        inset: 0;
        background: $color-overlay;
        transition: background $transition-normal;
      }

      .collection-info {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: $space-xl;
        z-index: 1;
      }

      .collection-name {
        font-family: $font-family-display;
        font-size: $font-size-xxl;
        font-weight: 400;
        color: $color-text-inverse;
        margin: 0 0 $space-xxs;
        letter-spacing: $letter-spacing-tight;
      }

      .collection-desc {
        font-size: $font-size-sm;
        color: rgba(252, 255, 247, 0.7);
        margin: 0 0 $space-sm;
        max-width: 300px;
      }

      .collection-cta {
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        color: $color-text-inverse;
        letter-spacing: 0.02em;
      }

      .arrow {
        display: inline-block;
        transition: transform $transition-fast;
      }

      // ═══════════════════════════════════════════════
      // PRODUCT SPOTLIGHT
      // ═══════════════════════════════════════════════
      .spotlight-section {
        padding: $space-xxxl 0;
      }

      .spotlight-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-xxl;
        align-items: center;
        margin-bottom: $space-xxxl;

        &.reverse {
          direction: rtl;
          > * {
            direction: ltr;
          }
        }

        @include respond-to(md) {
          grid-template-columns: 1fr;
          gap: $space-lg;
          &.reverse {
            direction: ltr;
          }
        }
      }

      .spotlight-image {
        border-radius: $radius-xl;
        overflow: hidden;
        aspect-ratio: 4 / 5;
        background: $color-bg-secondary;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.6s $ease-expo-out;
        }

        &:hover img {
          transform: scale(1.03);
        }
      }

      .spotlight-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, $color-bg-secondary, $color-bg-warm);
      }

      .spotlight-text {
        padding: $space-xl 0;
      }

      .spotlight-category {
        display: inline-block;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: $color-secondary;
        margin-bottom: $space-sm;
      }

      .spotlight-name {
        font-family: $font-family-display;
        font-size: clamp($font-size-xxl, 3vw, $font-size-xxxl);
        font-weight: 400;
        letter-spacing: $letter-spacing-display;
        color: $color-text-primary;
        margin: 0 0 $space-md;
      }

      .spotlight-desc {
        font-size: $font-size-md;
        color: $color-text-tertiary;
        line-height: $line-height-relaxed;
        margin: 0 0 $space-xl;
        max-width: 420px;
        @include truncate(3);
      }

      .spotlight-bottom {
        display: flex;
        align-items: center;
        gap: $space-lg;
      }

      .spotlight-price {
        font-family: $font-family-display;
        font-size: $font-size-xxl;
        font-weight: 600;
        color: $color-primary;
      }

      .btn-spotlight {
        display: inline-flex;
        align-items: center;
        padding: $space-sm $space-xl;
        background: transparent;
        color: $color-text-primary;
        border: 1.5px solid $color-border;
        border-radius: $radius-full;
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        text-decoration: none;
        transition: all $transition-normal;

        &:hover {
          border-color: $color-primary;
          color: $color-primary;
          transform: translateY(-1px);
        }
      }

      // ═══════════════════════════════════════════════
      // STORY TEASER
      // ═══════════════════════════════════════════════
      .story-section {
        position: relative;
        padding: 120px $space-lg;
        text-align: center;
        overflow: hidden;
        @include full-bleed;
      }

      .story-bg {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          135deg,
          $color-bg-dark 0%,
          #2e2228 100%
        );
        z-index: 0;
      }

      .story-content {
        position: relative;
        z-index: 1;
        max-width: 700px;
        margin: 0 auto;
      }

      .story-headline {
        font-family: $font-family-display;
        font-size: clamp($font-size-xxl, 4vw, $font-size-display);
        font-weight: 300;
        color: $color-text-inverse;
        line-height: 1.15;
        letter-spacing: $letter-spacing-display;
        margin: 0 0 $space-xxl;

        em {
          color: $color-primary;
          font-style: italic;
        }
      }

      .btn-story {
        display: inline-flex;
        align-items: center;
        padding: $space-md $space-xxl;
        background: transparent;
        color: $color-text-inverse;
        border: 1.5px solid rgba(252, 255, 247, 0.3);
        border-radius: $radius-full;
        font-size: $font-size-md;
        font-weight: $font-weight-medium;
        text-decoration: none;
        transition: all $transition-normal;

        &:hover {
          border-color: $color-text-inverse;
          color: $color-text-inverse;
          transform: translateY(-2px);
        }
      }

      // ═══════════════════════════════════════════════
      // PRODUCT RAILS
      // ═══════════════════════════════════════════════
      .rail-wrapper {
        padding: $space-xl 0;
      }

      .loading-section {
        display: flex;
        justify-content: center;
        padding: $space-xxxl 0;
      }

      .loading-spinner {
        width: 32px;
        height: 32px;
        border: 2px solid $color-border-light;
        border-top-color: $color-primary;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      // ═══════════════════════════════════════════════
      // VALUES SECTION
      // ═══════════════════════════════════════════════
      .values-section {
        padding: $space-xxxl 0;
        background: $color-bg-warm;
        @include full-bleed;
      }

      .values-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: $space-xxl;
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 $space-xxl;

        @include respond-to(lg) {
          grid-template-columns: repeat(2, 1fr);
        }
        @include respond-to(xs) {
          grid-template-columns: 1fr;
        }
      }

      .value-item {
        text-align: center;
        padding: $space-xl $space-md;
      }

      .value-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto $space-md;
        color: $color-primary;

        svg {
          width: 100%;
          height: 100%;
        }
      }

      .value-title {
        font-family: $font-family-display;
        font-size: $font-size-xl;
        font-weight: 500;
        color: $color-text-primary;
        margin: 0 0 $space-xs;
      }

      .value-desc {
        font-size: $font-size-sm;
        color: $color-text-tertiary;
        margin: 0;
        line-height: $line-height-relaxed;
      }
    `,
  ],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly feedStore = inject(PersonalizationStore);
  private readonly catalogService = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly elRef = inject(ElementRef);

  readonly collections = signal<Collection[]>([]);
  readonly spotlightProducts = signal<Product[]>([]);

  @ViewChild('homeContainer') homeContainer!: ElementRef<HTMLElement>;
  @ViewChild('heroLine1') heroLine1!: ElementRef<HTMLElement>;
  @ViewChild('heroLine2') heroLine2!: ElementRef<HTMLElement>;

  private gsapCtx: gsap.Context | null = null;

  ngOnInit(): void {
    this.feedStore.loadHomeFeed();

    this.catalogService.getCollectionsPublic().subscribe({
      next: (res) => this.collections.set(res.data),
    });

    this.catalogService
      .getProductsPublic({ isFeatured: true, limit: 3, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({
        next: (res) => this.spotlightProducts.set(res.data),
      });
  }

  ngAfterViewInit(): void {
    this.gsapCtx = gsap.context(() => {
      // Hero entry animation
      const heroTl = gsap.timeline({ delay: 0.2 });

      heroTl
        .to('.hero-label', { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' })
        .to(
          '.hero-line',
          { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.15 },
          '-=0.3',
        )
        .to('.hero-sub', { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, '-=0.4')
        .to('.hero-ctas', { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, '-=0.3')
        .to('.hero-scroll-hint', { opacity: 1, duration: 0.8 }, '-=0.2');

      // Brand band scroll reveal
      ScrollTrigger.create({
        trigger: '.brand-band',
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.to('.band-rule', { scaleX: 1, duration: 0.8, ease: 'expo.out', stagger: 0.1 });
          gsap.to('.band-text', { opacity: 1, duration: 0.6, delay: 0.3, ease: 'expo.out' });
        },
      });

      // Collections reveal
      ScrollTrigger.create({
        trigger: '.collections-section',
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from('.collection-card', {
            y: 60,
            opacity: 0,
            duration: 0.7,
            ease: 'expo.out',
            stagger: 0.12,
          });
        },
      });

      // Spotlight rows reveal
      gsap.utils.toArray<HTMLElement>('.spotlight-row').forEach((row) => {
        ScrollTrigger.create({
          trigger: row,
          start: 'top 75%',
          once: true,
          onEnter: () => {
            gsap.from(row.querySelector('.spotlight-image')!, {
              x: row.classList.contains('reverse') ? 60 : -60,
              opacity: 0,
              duration: 0.8,
              ease: 'expo.out',
            });
            gsap.from(row.querySelector('.spotlight-text')!, {
              x: row.classList.contains('reverse') ? -40 : 40,
              opacity: 0,
              duration: 0.8,
              delay: 0.15,
              ease: 'expo.out',
            });
          },
        });
      });

      // Story section parallax
      ScrollTrigger.create({
        trigger: '.story-section',
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from('.story-headline', {
            y: 40,
            opacity: 0,
            duration: 0.8,
            ease: 'expo.out',
          });
          gsap.from('.btn-story', {
            y: 20,
            opacity: 0,
            duration: 0.6,
            delay: 0.3,
            ease: 'expo.out',
          });
        },
      });

      // Values section
      ScrollTrigger.create({
        trigger: '.values-section',
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from('.value-item', {
            y: 40,
            opacity: 0,
            duration: 0.6,
            ease: 'expo.out',
            stagger: 0.1,
          });
        },
      });
    }, this.elRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.gsapCtx?.revert();
  }
}
