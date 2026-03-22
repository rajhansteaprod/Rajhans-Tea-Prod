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
    <div class="home">
      <!-- ═══ HERO ═══ -->
      <section class="hero" #hero>
        <!-- BG Layer -->
        <div class="hero__bg" #heroBg>
          <div class="hero__glow hero__glow--warm"></div>
          <div class="hero__glow hero__glow--cool"></div>
          <div class="hero__noise"></div>
          <!-- Steam particles -->
          @for (p of particles; track $index) {
            <div
              class="hero__particle"
              [style.left.%]="p.x"
              [style.bottom.%]="p.y"
              [style.width.px]="p.s"
              [style.height.px]="p.s"
              [style.animation-delay]="p.d + 's'"
              [style.animation-duration]="p.t + 's'"
            ></div>
          }
        </div>

        <!-- Content Layer -->
        <div class="hero__content" #heroContent>
          <span class="hero__tag" #heroTag>Rajhans Tea &middot; Est. 2024</span>
          <h1 class="hero__h1">
            <span class="hero__word" #heroW1>2 AM Dreams</span>
            <span class="hero__word hero__word--accent" #heroW2>Begin with a Cup</span>
          </h1>
          <p class="hero__sub" #heroSub>
            When the world sleeps, your hustle brews.<br />
            Rajhans Tea fuels your focus.
          </p>
          <a routerLink="/products" class="hero__cta" #heroCta>
            <span>Explore Now</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
        </div>

        <!-- Scroll indicator -->
        <div class="hero__scroll" #heroScroll>
          <div class="hero__scroll-line"></div>
          <span class="hero__scroll-text">Scroll</span>
        </div>

        <!-- Bottom fade -->
        <div class="hero__fade"></div>
      </section>

      <!-- ═══ BRAND BAND ═══ -->
      <section class="brand-band">
        <div class="band-inner">
          <div class="band-rule"></div>
          <p class="band-text">Sourced by hand. Steeped with intention.</p>
          <div class="band-rule"></div>
        </div>
      </section>

      <!-- ═══ COLLECTIONS ═══ -->
      @if (collections().length > 0) {
        <section class="collections-section">
          <div class="section-header">
            <span class="section-label">Curated</span>
            <h2 class="section-title">Our Collections</h2>
          </div>
          <div class="collections-grid">
            @for (col of collections().slice(0, 3); track col._id; let i = $index) {
              <a [routerLink]="'/catalog/' + col.slug" class="collection-card" [class.large]="i === 0">
                <div class="collection-img">
                  @if (col.image) { <img [src]="col.image" [alt]="col.name" loading="lazy" /> }
                  <div class="collection-overlay"></div>
                </div>
                <div class="collection-info">
                  <h3 class="collection-name">{{ col.name }}</h3>
                  @if (col.description) { <p class="collection-desc">{{ col.description }}</p> }
                  <span class="collection-cta">Explore <span class="arrow">&rarr;</span></span>
                </div>
              </a>
            }
          </div>
        </section>
      }

      <!-- ═══ SPOTLIGHT ═══ -->
      @if (spotlightProducts().length > 0) {
        <section class="spotlight-section">
          <div class="section-header">
            <span class="section-label">Handpicked</span>
            <h2 class="section-title">Featured Teas</h2>
          </div>
          @for (p of spotlightProducts().slice(0, 3); track p._id; let i = $index) {
            <div class="spotlight-row" [class.reverse]="i % 2 !== 0">
              <div class="spotlight-image">
                @if (p.images?.[0]) { <img [src]="p.images[0]" [alt]="p.name" loading="lazy" /> }
                @else { <div class="spotlight-placeholder"></div> }
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
        <div class="story-content">
          <h2 class="story-headline">From the gardens of India<br /><em>to your morning ritual.</em></h2>
          <a routerLink="/page/about-us" class="btn-story">Read Our Story &rarr;</a>
        </div>
      </section>

      <!-- ═══ PRODUCT RAILS ═══ -->
      @if (feedStore.feedLoading()) {
        <div class="loading-section"><div class="loading-spinner"></div></div>
      } @else if (feedStore.feed()) {
        @for (section of feedStore.feed()!.sections; track section.key) {
          <section class="rail-wrapper">
            <app-product-rail [title]="section.title" [products]="section.products" [viewAllLink]="'/products'" />
          </section>
        }
      }

      <!-- ═══ VALUES ═══ -->
      <section class="values-section">
        <div class="values-grid">
          <div class="value-item">
            <div class="value-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
            <h4 class="value-title">100% Authentic</h4>
            <p class="value-desc">Direct from certified tea gardens</p>
          </div>
          <div class="value-item">
            <div class="value-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
            <h4 class="value-title">Freshly Packed</h4>
            <p class="value-desc">Sealed within 24 hours of plucking</p>
          </div>
          <div class="value-item">
            <div class="value-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
            <h4 class="value-title">Pan India Delivery</h4>
            <p class="value-desc">Free shipping on orders above &#8377;499</p>
          </div>
          <div class="value-item">
            <div class="value-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
            <h4 class="value-title">Crafted with Love</h4>
            <p class="value-desc">Small-batch, artisanal quality</p>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    @use '../../core/design-tokens/tokens' as *;
    @use '../../core/design-tokens/mixins' as *;

    .home { overflow: hidden; }

    // ═══════════════════════════════════════════════
    // HERO — full viewport, fixed position approach
    // ═══════════════════════════════════════════════
    .hero {
      position: relative;
      width: 100vw;
      height: 100vh;
      // Break out of parent padding + max-width
      margin-left: calc(-50vw + 50%);
      margin-top: -72px; // negate header height
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    // --- Background layer ---
    .hero__bg {
      position: absolute;
      inset: 0;
      background: $color-bg-dark; // token
      will-change: transform;
    }

    .hero__glow {
      position: absolute;
      border-radius: $radius-full; // token
      filter: blur(100px);
      will-change: transform;
    }

    .hero__glow--warm {
      width: 600px; height: 600px;
      bottom: -200px; left: -100px;
      background: rgba($color-primary, 0.15); // token
    }

    .hero__glow--cool {
      width: 400px; height: 400px;
      top: -100px; right: -50px;
      background: rgba($color-secondary, 0.08); // token
    }

    .hero__noise {
      position: absolute;
      inset: 0;
      opacity: 0.035;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      pointer-events: none;
    }

    // --- Steam particles ---
    .hero__particle {
      position: absolute;
      border-radius: $radius-full; // token
      background: radial-gradient(circle, rgba($color-text-inverse, 0.06) 0%, transparent 70%); // token
      animation: steamRise linear infinite;
      will-change: transform, opacity;
      pointer-events: none;
    }

    @keyframes steamRise {
      0%   { transform: translateY(0) scale(1); opacity: 0; }
      15%  { opacity: 0.5; }
      85%  { opacity: 0.1; }
      100% { transform: translateY(-200px) scale(2); opacity: 0; }
    }

    // --- Content layer ---
    .hero__content {
      position: relative;
      z-index: 2;
      text-align: center;
      padding: 0 $space-lg; // token
      will-change: transform, opacity;
    }

    .hero__tag {
      display: block;
      font-family: $font-family; // token
      font-size: $font-size-xs; // token
      font-weight: $font-weight-semibold; // token
      letter-spacing: $letter-spacing-wide; // token
      text-transform: uppercase;
      color: rgba($color-text-inverse, 0.35); // token
      margin-bottom: $space-xxl; // token
      visibility: hidden; // GSAP will reveal
    }

    .hero__h1 {
      font-family: $font-family-display; // token
      font-size: clamp($font-size-xxxl, 8vw, $font-size-mega); // tokens: 40px→120px
      font-weight: $font-weight-regular; // token
      line-height: 1.05;
      letter-spacing: $letter-spacing-display; // token
      color: $color-text-inverse; // token
      margin: 0 0 $space-lg; // token
    }

    .hero__word {
      display: block;
      visibility: hidden; // GSAP will reveal
    }

    .hero__word--accent {
      color: $color-primary; // token
      font-style: italic;
      font-weight: $font-weight-medium; // token
    }

    .hero__sub {
      font-family: $font-family; // token
      font-size: $font-size-md; // token
      color: rgba($color-text-inverse, 0.4); // token
      line-height: $line-height-relaxed; // token
      margin: 0 auto $space-xxl; // token
      max-width: $breakpoint-sm; // token
      visibility: hidden;
    }

    .hero__cta {
      display: inline-flex;
      align-items: center;
      gap: $space-xs; // token
      padding: $space-md $space-xxl; // tokens
      background: $color-primary; // token
      color: $color-text-inverse; // token
      border-radius: $radius-full; // token
      font-family: $font-family; // token
      font-size: $font-size-sm; // token
      font-weight: $font-weight-semibold; // token
      letter-spacing: $letter-spacing-wide; // token
      text-transform: uppercase;
      text-decoration: none;
      transition: all $transition-normal; // token
      box-shadow: $shadow-lg; // token
      visibility: hidden;

      svg { transition: transform $transition-normal; } // token

      &:hover {
        background: $color-primary-hover; // token
        color: $color-text-inverse; // token
        transform: translateY(-$space-xxs); // token
        box-shadow: $shadow-xl, $shadow-glow; // tokens
        svg { transform: translateX($space-xxs); } // token
      }
      &:active { transform: scale(0.97); }
    }

    // --- Scroll indicator ---
    .hero__scroll {
      position: absolute;
      bottom: $space-xxl; // token
      left: 50%;
      transform: translateX(-50%);
      @include flex-column; // token mixin
      align-items: center;
      gap: $space-xs; // token
      visibility: hidden;
    }

    .hero__scroll-line {
      width: 1px;
      height: $space-xxl; // token
      background: rgba($color-text-inverse, 0.15); // token
      position: relative;
      overflow: hidden;
      border-radius: $radius-full; // token

      &::after {
        content: '';
        position: absolute;
        top: -100%;
        width: 100%;
        height: 50%;
        background: $color-primary; // token
        animation: lineScroll 2s $ease-expo-out infinite; // token
      }
    }

    @keyframes lineScroll {
      0%   { top: -50%; }
      100% { top: 150%; }
    }

    .hero__scroll-text {
      font-size: $font-size-xs; // token
      font-weight: $font-weight-semibold; // token
      letter-spacing: $letter-spacing-wide; // token
      text-transform: uppercase;
      color: rgba($color-text-inverse, 0.2); // token
    }

    // --- Bottom fade ---
    .hero__fade {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: $space-xxxl * 3; // token: 192px
      background: linear-gradient(transparent, $color-bg-primary); // token
      z-index: 3;
      pointer-events: none;
    }

    // ═══════════════════════════════════════════════
    // BRAND BAND
    // ═══════════════════════════════════════════════
    .brand-band {
      padding: $space-xxxl 0; // token
      background: $color-bg-dark; // token
      @include full-bleed; // token mixin
    }
    .band-inner {
      @include flex-center; // token mixin
      gap: $space-xxl; // token
      max-width: 900px;
      margin: 0 auto;
      padding: 0 $space-lg; // token
      @include respond-to(md) { flex-direction: column; gap: $space-lg; } // token
    }
    .band-rule {
      flex: 1; height: 1px;
      background: rgba($color-text-inverse, 0.15); // token
      transform: scaleX(0);
      @include respond-to(md) { width: $space-xxxl; flex: none; } // token
    }
    .band-text {
      font-family: $font-family-display; // token
      font-size: clamp($font-size-xl, 3vw, $font-size-xxl); // tokens
      font-style: italic;
      font-weight: $font-weight-regular; // token
      color: $color-text-inverse; // token
      text-align: center;
      margin: 0;
      opacity: 0;
      @include respond-to(md) { white-space: normal; } // token
    }

    // ═══════════════════════════════════════════════
    // COLLECTIONS
    // ═══════════════════════════════════════════════
    .collections-section { padding: $space-xxxl 0; } // token
    .section-header { text-align: center; margin-bottom: $space-xxl; } // token
    .section-label {
      display: block;
      font-size: $font-size-xs; // token
      font-weight: $font-weight-semibold; // token
      letter-spacing: $letter-spacing-wide; // token
      text-transform: uppercase;
      color: $color-secondary; // token
      margin-bottom: $space-sm; // token
    }
    .section-title {
      font-family: $font-family-display; // token
      font-size: clamp($font-size-xxl, 4vw, $font-size-xxxl); // tokens
      font-weight: $font-weight-regular; // token
      letter-spacing: $letter-spacing-display; // token
      color: $color-text-primary; // token
      margin: 0;
    }
    .collections-grid {
      display: grid; grid-template-columns: 1.2fr 1fr;
      grid-template-rows: 1fr 1fr; gap: $space-md; min-height: 500px; // token
      @include respond-to(md) { grid-template-columns: 1fr; grid-template-rows: auto; min-height: auto; }
    }
    .collection-card {
      position: relative; border-radius: $radius-xl; overflow: hidden; // token
      text-decoration: none; min-height: 220px;
      &.large { grid-row: 1 / 3; @include respond-to(md) { grid-row: auto; } }
      &:hover {
        .collection-img img { transform: scale(1.04); }
        .collection-overlay { background: $color-overlay; } // token
        .arrow { transform: translateX($space-xxs); } // token
      }
    }
    .collection-img {
      position: absolute; inset: 0; background: $color-bg-secondary; // token
      img { width: 100%; height: 100%; object-fit: cover; transition: transform $transition-slow $ease-expo-out; } // token
    }
    .collection-overlay {
      position: absolute; inset: 0;
      background: rgba($color-bg-dark, 0.4); // token
      transition: background $transition-normal; // token
    }
    .collection-info { position: absolute; bottom: 0; left: 0; right: 0; padding: $space-xl; z-index: 1; } // token
    .collection-name {
      font-family: $font-family-display; font-size: $font-size-xxl; // tokens
      font-weight: $font-weight-regular; color: $color-text-inverse; // tokens
      margin: 0 0 $space-xxs; letter-spacing: $letter-spacing-tight; // tokens
    }
    .collection-desc { font-size: $font-size-sm; color: rgba($color-text-inverse, 0.7); margin: 0 0 $space-sm; max-width: 300px; } // token
    .collection-cta { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-inverse; } // tokens
    .arrow { display: inline-block; transition: transform $transition-fast; } // token

    // ═══════════════════════════════════════════════
    // SPOTLIGHT
    // ═══════════════════════════════════════════════
    .spotlight-section { padding: $space-xxxl 0; } // token
    .spotlight-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: $space-xxl; // token
      align-items: center; margin-bottom: $space-xxxl; // token
      &.reverse { direction: rtl; > * { direction: ltr; } }
      @include respond-to(md) { grid-template-columns: 1fr; gap: $space-lg; &.reverse { direction: ltr; } }
    }
    .spotlight-image {
      border-radius: $radius-xl; overflow: hidden; aspect-ratio: 4 / 5; background: $color-bg-secondary; // token
      img { width: 100%; height: 100%; object-fit: cover; transition: transform $transition-slow $ease-expo-out; } // tokens
      &:hover img { transform: scale(1.03); }
    }
    .spotlight-placeholder { width: 100%; height: 100%; background: $color-bg-warm; } // token
    .spotlight-text { padding: $space-xl 0; } // token
    .spotlight-category {
      display: inline-block; font-size: $font-size-xs; font-weight: $font-weight-semibold; // tokens
      letter-spacing: $letter-spacing-wide; text-transform: uppercase; color: $color-secondary; // tokens
      margin-bottom: $space-sm; // token
    }
    .spotlight-name {
      font-family: $font-family-display; font-size: clamp($font-size-xxl, 3vw, $font-size-xxxl); // tokens
      font-weight: $font-weight-regular; letter-spacing: $letter-spacing-display; // tokens
      color: $color-text-primary; margin: 0 0 $space-md; // tokens
    }
    .spotlight-desc {
      font-size: $font-size-md; color: $color-text-tertiary; // tokens
      line-height: $line-height-relaxed; margin: 0 0 $space-xl; max-width: 420px; // token
      @include truncate(3); // token mixin
    }
    .spotlight-bottom { display: flex; align-items: center; gap: $space-lg; } // token
    .spotlight-price {
      font-family: $font-family-display; font-size: $font-size-xxl; // tokens
      font-weight: $font-weight-semibold; color: $color-primary; // tokens
    }
    .btn-spotlight {
      display: inline-flex; align-items: center;
      padding: $space-sm $space-xl; background: transparent; // tokens
      color: $color-text-primary; border: 1.5px solid $color-border; // tokens
      border-radius: $radius-full; font-size: $font-size-sm; // tokens
      font-weight: $font-weight-semibold; text-decoration: none; // token
      transition: all $transition-normal; // token
      &:hover { border-color: $color-primary; color: $color-primary; transform: translateY(-1px); } // token
    }

    // ═══════════════════════════════════════════════
    // STORY
    // ═══════════════════════════════════════════════
    .story-section {
      position: relative; padding: $space-xxxl * 2 $space-lg; // token
      text-align: center; overflow: hidden;
      background: $color-bg-dark; // token
      @include full-bleed; // token mixin
    }
    .story-content { position: relative; z-index: 1; max-width: 700px; margin: 0 auto; }
    .story-headline {
      font-family: $font-family-display; font-size: clamp($font-size-xxl, 4vw, $font-size-display); // tokens
      font-weight: $font-weight-regular; color: $color-text-inverse; // tokens
      line-height: $line-height-tight; letter-spacing: $letter-spacing-display; // tokens
      margin: 0 0 $space-xxl; // token
      em { color: $color-primary; font-style: italic; } // token
    }
    .btn-story {
      display: inline-flex; align-items: center;
      padding: $space-md $space-xxl; background: transparent; // tokens
      color: $color-text-inverse; border: 1.5px solid rgba($color-text-inverse, 0.2); // token
      border-radius: $radius-full; font-size: $font-size-md; // tokens
      font-weight: $font-weight-medium; text-decoration: none; // token
      transition: all $transition-normal; // token
      &:hover { border-color: rgba($color-text-inverse, 0.5); color: $color-text-inverse; transform: translateY(-$space-xxs); } // token
    }

    // ═══════════════════════════════════════════════
    // RAILS + VALUES (unchanged, token-based)
    // ═══════════════════════════════════════════════
    .rail-wrapper { padding: $space-xl 0; }
    .loading-section { @include flex-center; padding: $space-xxxl 0; }
    .loading-spinner {
      width: $space-xl; height: $space-xl; // token
      border: 2px solid $color-border-light; border-top-color: $color-primary; // tokens
      border-radius: $radius-full; animation: spin 0.7s linear infinite; // token
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .values-section { padding: $space-xxxl 0; background: $color-bg-warm; @include full-bleed; } // tokens
    .values-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: $space-xxl; // token
      max-width: $breakpoint-xl; margin: 0 auto; padding: 0 $space-xxl; // tokens
      @include respond-to(lg) { grid-template-columns: repeat(2, 1fr); }
      @include respond-to(xs) { grid-template-columns: 1fr; }
    }
    .value-item { text-align: center; padding: $space-xl $space-md; } // tokens
    .value-icon { width: $space-xxl; height: $space-xxl; margin: 0 auto $space-md; color: $color-primary; svg { width: 100%; height: 100%; } } // tokens
    .value-title { font-family: $font-family-display; font-size: $font-size-xl; font-weight: $font-weight-medium; color: $color-text-primary; margin: 0 0 $space-xs; } // tokens
    .value-desc { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; line-height: $line-height-relaxed; } // tokens
  `],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly feedStore = inject(PersonalizationStore);
  private readonly catalogService = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly el = inject(ElementRef);

  readonly collections = signal<Collection[]>([]);
  readonly spotlightProducts = signal<Product[]>([]);

  // Steam particles — pre-generated random data
  readonly particles = Array.from({ length: 15 }, () => ({
    x: 15 + Math.random() * 70,
    y: -5 + Math.random() * 25,
    s: 30 + Math.random() * 80,
    d: Math.random() * 8,
    t: 5 + Math.random() * 8,
  }));

  private ctx: gsap.Context | null = null;

  ngOnInit(): void {
    this.feedStore.loadHomeFeed();
    this.catalogService.getCollectionsPublic().subscribe({
      next: (res) => this.collections.set(res.data),
    });
    this.catalogService
      .getProductsPublic({ isFeatured: true, limit: 3, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({ next: (res) => this.spotlightProducts.set(res.data) });
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    // All GSAP queries scoped to component's own DOM
    this.ctx = gsap.context(() => {
      // ── Hero entry timeline ──
      const tl = gsap.timeline({ delay: 0.3 });

      tl.fromTo(root.querySelector('.hero__tag')!,
        { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' })
      .fromTo(root.querySelectorAll('.hero__word'),
        { autoAlpha: 0, y: 60 },
        { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.15 }, '-=0.4')
      .fromTo(root.querySelector('.hero__sub')!,
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, '-=0.6')
      .fromTo(root.querySelector('.hero__cta')!,
        { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, '-=0.4')
      .fromTo(root.querySelector('.hero__scroll')!,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 1 }, '-=0.3');

      // ── Parallax: BG moves slower than content ──
      const hero = root.querySelector('.hero')!;
      const heroBg = root.querySelector('.hero__bg')!;
      const heroContent = root.querySelector('.hero__content')!;

      gsap.to(heroBg, {
        yPercent: 15,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });

      // Content fades and lifts on scroll
      gsap.to(heroContent, {
        yPercent: -20,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: '40% top', end: 'bottom top', scrub: true },
      });

      // Glow animation on scroll
      gsap.to(root.querySelector('.hero__glow--warm')!, {
        scale: 1.3,
        x: 50,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      });

      // ── Brand band reveal ──
      ScrollTrigger.create({
        trigger: root.querySelector('.brand-band')!,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.to(root.querySelectorAll('.band-rule'), { scaleX: 1, duration: 0.8, ease: 'expo.out', stagger: 0.1 });
          gsap.to(root.querySelector('.band-text')!, { opacity: 1, duration: 0.6, delay: 0.3, ease: 'expo.out' });
        },
      });

      // ── Collections reveal ──
      ScrollTrigger.create({
        trigger: root.querySelector('.collections-section'),
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelectorAll('.collection-card'), {
            y: 60, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.12,
          });
        },
      });

      // ── Spotlight reveals ──
      root.querySelectorAll('.spotlight-row').forEach((row) => {
        ScrollTrigger.create({
          trigger: row,
          start: 'top 75%',
          once: true,
          onEnter: () => {
            const img = row.querySelector('.spotlight-image');
            const txt = row.querySelector('.spotlight-text');
            const isReverse = row.classList.contains('reverse');
            if (img) gsap.from(img, { x: isReverse ? 60 : -60, opacity: 0, duration: 0.8, ease: 'expo.out' });
            if (txt) gsap.from(txt, { x: isReverse ? -40 : 40, opacity: 0, duration: 0.8, delay: 0.15, ease: 'expo.out' });
          },
        });
      });

      // ── Story reveal ──
      ScrollTrigger.create({
        trigger: root.querySelector('.story-section'),
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.story-headline')!, { y: 40, opacity: 0, duration: 0.8, ease: 'expo.out' });
          gsap.from(root.querySelector('.btn-story')!, { y: 20, opacity: 0, duration: 0.6, delay: 0.3, ease: 'expo.out' });
        },
      });

      // ── Values reveal ──
      ScrollTrigger.create({
        trigger: root.querySelector('.values-section'),
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelectorAll('.value-item'), { y: 40, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.1 });
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
