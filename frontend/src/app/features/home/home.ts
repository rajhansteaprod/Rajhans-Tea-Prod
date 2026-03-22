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
      <!-- ═══ HERO — Cinematic Parallax (token-strict) ═══ -->
      <section class="hero">
        <!-- Layer 0: Background (slowest parallax) -->
        <div class="hero-layer hero-layer--bg" data-speed="0.3">
          <div class="hero-grain"></div>
        </div>

        <!-- Layer 1: Ambient particles (mid parallax) -->
        <div class="hero-layer hero-layer--particles" data-speed="0.5">
          @for (i of steamParticles; track i) {
            <div class="steam-particle" [style.--x]="i.x" [style.--y]="i.y" [style.--size]="i.size" [style.--delay]="i.delay" [style.--dur]="i.dur"></div>
          }
        </div>

        <!-- Layer 2: Foreground content (fastest, moves with scroll) -->
        <div class="hero-layer hero-layer--content" data-speed="0.8">
          <div class="hero-inner">
            <span class="hero-tag">Rajhans Tea &middot; Est. 2024</span>
            <h1 class="hero-headline">
              <span class="hero-word" #heroLine1>2 AM Dreams</span>
              <span class="hero-word" #heroLine2>Begin with a Cup</span>
            </h1>
            <p class="hero-sub">When the world sleeps, your hustle brews.<br />Rajhans Tea fuels your focus.</p>
            <div class="hero-cta-group">
              <a routerLink="/products" class="hero-cta-primary">
                <span>Explore Now</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
            </div>
          </div>
        </div>

        <!-- Scroll indicator -->
        <div class="hero-scroll">
          <div class="hero-scroll-track">
            <div class="hero-scroll-thumb"></div>
          </div>
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
      // ═══════════════════════════════════════════════
      // HERO — Cinematic parallax (ALL values from tokens)
      // ═══════════════════════════════════════════════

      .hero {
        position: relative;
        width: 100vw;
        height: 100vh;
        margin-left: calc(-50vw + 50%);
        margin-top: calc($space-xxxl * -1 - $space-lg); // token: -88px (negate content padding)
        overflow: hidden;
      }

      // --- Parallax Layers ---
      .hero-layer {
        position: absolute;
        inset: 0;
        will-change: transform; // GPU compositing for 60fps
      }

      // Layer 0: Background — $color-bg-dark based
      .hero-layer--bg {
        // All colors from tokens: $color-bg-dark, $color-primary, $color-secondary
        background:
          radial-gradient(ellipse at 20% 80%, rgba($color-primary, 0.12) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba($color-secondary, 0.06) 0%, transparent 50%),
          linear-gradient(175deg, $color-bg-dark 0%, $color-bg-dark 100%);
      }

      // SVG noise grain — token: $color-text-inverse opacity
      .hero-grain {
        position: absolute;
        inset: 0;
        opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        pointer-events: none;
      }

      // Layer 1: Steam particles — token colors
      .hero-layer--particles {
        pointer-events: none;
        z-index: 1;
      }

      .steam-particle {
        position: absolute;
        left: calc(var(--x) * 1%);
        bottom: calc(var(--y) * 1%);
        width: calc(var(--size) * 1px);
        height: calc(var(--size) * 1px);
        border-radius: $radius-full; // token
        // token: $color-text-inverse with low opacity
        background: radial-gradient(circle, rgba($color-text-inverse, 0.08) 0%, transparent 70%);
        animation: steamFloat var(--dur) var(--delay) ease-in-out infinite;
        will-change: transform, opacity;
      }

      @keyframes steamFloat {
        0% { transform: translateY(0) scale(1); opacity: 0; }
        20% { opacity: 0.6; }
        80% { opacity: 0.2; }
        100% { transform: translateY(-120px) scale(1.5); opacity: 0; }
      }

      // Layer 2: Content — foreground
      .hero-layer--content {
        z-index: 2;
        @include flex-center; // token mixin
        @include flex-column; // token mixin
        padding: 0 $space-lg; // token: $space-lg
        text-align: center;
      }

      .hero-inner {
        max-width: $breakpoint-md; // token: 768px — tight for editorial feel
        @include flex-column; // token mixin
        align-items: center;
        gap: $space-lg; // token
      }

      // Tag line — tokens: $font-size-xs, $font-weight-semibold, $letter-spacing-wide
      .hero-tag {
        font-family: $font-family; // token
        font-size: $font-size-xs; // token
        font-weight: $font-weight-semibold; // token
        letter-spacing: $letter-spacing-wide; // token
        text-transform: uppercase;
        color: rgba($color-text-inverse, 0.4); // token color
        opacity: 0;
        transform: translateY($space-md); // token
      }

      // Headline — tokens: $font-family-display, $font-size-hero, $letter-spacing-display
      .hero-headline {
        font-family: $font-family-display; // token
        font-size: clamp($font-size-xxxl, 8vw, $font-size-hero); // tokens: 40px → 80px
        font-weight: $font-weight-regular; // token: 400
        line-height: $line-height-tight; // token: 1.2
        letter-spacing: $letter-spacing-display; // token: -0.04em
        color: $color-text-inverse; // token
        margin: 0;
      }

      .hero-word {
        display: block;
        opacity: 0;
        transform: translateY($space-xxxl); // token: 64px
      }

      // Subtext — tokens: $font-size-md, $color-text-inverse
      .hero-sub {
        font-family: $font-family; // token
        font-size: clamp($font-size-sm, 2vw, $font-size-md); // tokens: 14px → 16px
        color: rgba($color-text-inverse, 0.45); // token color
        line-height: $line-height-relaxed; // token: 1.75
        margin: 0;
        max-width: calc($breakpoint-sm - $space-xxl); // token: ~528px
        opacity: 0;
        transform: translateY($space-xl); // token: 32px
      }

      // CTA group
      .hero-cta-group {
        opacity: 0;
        transform: translateY($space-lg); // token: 24px
      }

      // Primary CTA — tokens: $color-primary, $radius-full, $font-weight-semibold
      .hero-cta-primary {
        display: inline-flex;
        align-items: center;
        gap: $space-xs; // token
        padding: $space-md $space-xxl; // tokens: 16px 48px
        background: $color-primary; // token
        color: $color-text-inverse; // token
        border-radius: $radius-full; // token
        font-family: $font-family; // token
        font-size: $font-size-sm; // token
        font-weight: $font-weight-semibold; // token
        letter-spacing: $letter-spacing-wide; // token
        text-transform: uppercase;
        text-decoration: none;
        transition: all $transition-reveal; // token: 0.8s expo-out
        box-shadow: $shadow-lg; // token

        svg {
          transition: transform $transition-normal; // token: 0.3s
        }

        &:hover {
          background: $color-primary-hover; // token
          color: $color-text-inverse; // token
          transform: translateY(calc($space-xxs * -1)); // token: -4px
          box-shadow: $shadow-xl, $shadow-glow; // tokens combined

          svg {
            transform: translateX($space-xxs); // token: 4px
          }
        }

        &:active {
          transform: scale(0.97);
          transition: all $transition-fast; // token: 0.15s
        }
      }

      // Scroll indicator — token values
      .hero-scroll {
        position: absolute;
        bottom: $space-xxl; // token: 48px
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
      }

      .hero-scroll-track {
        width: 1px;
        height: $space-xxl; // token: 48px
        background: rgba($color-text-inverse, 0.1); // token color
        border-radius: $radius-full; // token
        overflow: hidden;
      }

      .hero-scroll-thumb {
        width: 100%;
        height: $space-md; // token: 16px
        background: rgba($color-primary, 0.6); // token color
        border-radius: $radius-full; // token
        animation: scrollThumb 2s $ease-expo-out infinite; // token easing
      }

      @keyframes scrollThumb {
        0% { transform: translateY(calc($space-xxl * -1)); opacity: 0; } // token
        50% { opacity: 1; }
        100% { transform: translateY($space-xxl); opacity: 0; } // token
      }

      // Bottom fade into page — token: $color-bg-primary
      .hero::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: calc($space-xxxl * 3); // token: 192px
        background: linear-gradient(transparent, $color-bg-primary); // token
        z-index: 3;
        pointer-events: none;
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

  // Steam/particle data — randomized positions for ambient effect
  readonly steamParticles = Array.from({ length: 18 }, (_, i) => ({
    x: 10 + Math.random() * 80,
    y: -10 + Math.random() * 30,
    size: 20 + Math.random() * 60,
    delay: (i * 0.4) + 's',
    dur: (4 + Math.random() * 6) + 's',
  }));

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
      // ── Hero entry timeline ──
      const heroTl = gsap.timeline({ delay: 0.3 });

      heroTl
        .to('.hero-tag', { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' })
        .to('.hero-word', { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.12 }, '-=0.4')
        .to('.hero-sub', { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, '-=0.5')
        .to('.hero-cta-group', { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, '-=0.4')
        .to('.hero-scroll', { opacity: 1, duration: 1 }, '-=0.3');

      // ── Parallax scroll layers ──
      gsap.utils.toArray<HTMLElement>('.hero-layer').forEach((layer) => {
        const speed = parseFloat(layer.dataset['speed'] || '0.5');
        gsap.to(layer, {
          yPercent: speed * 30,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero',
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      // ── Hero content fade out on scroll ──
      gsap.to('.hero-layer--content', {
        opacity: 0,
        scale: 0.95,
        scrollTrigger: {
          trigger: '.hero',
          start: '60% top',
          end: 'bottom top',
          scrub: true,
        },
      });

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
