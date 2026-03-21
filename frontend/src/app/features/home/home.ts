import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PersonalizationStore } from '../../core/services/personalization.store';
import { ProductRailComponent } from '../../shared/components/product-rail/product-rail';
import { BannerCarouselComponent } from '../../shared/components/banner-carousel/banner-carousel';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductRailComponent, BannerCarouselComponent],
  template: `
    <div class="home">
      <!-- Hero / Banners -->
      @if (store.feed()?.banners?.length) {
        <app-banner-carousel [banners]="store.feed()!.banners" />
      } @else {
        <div class="hero">
          <div class="hero-badge">New Collection 2026</div>
          <h1 class="hero-title">
            <span>Premium Shopping,</span>
            <span class="accent">Reimagined.</span>
          </h1>
          <p class="hero-desc">Discover curated collections crafted for the modern lifestyle.</p>
          <div class="hero-actions">
            <a routerLink="/search" class="btn-primary">Browse Products</a>
          </div>
        </div>
      }

      <!-- Feed Sections -->
      @if (store.feedLoading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (store.feed()) {
        @for (section of store.feed()!.sections; track section.key) {
          <app-product-rail
            [title]="section.title"
            [products]="section.products"
            [viewAllLink]="'/search'"
          />
        }
      }
    </div>
  `,
  styles: [`
    @use '../../core/design-tokens/tokens' as *;

    .home { padding: $space-lg 0; }

    .hero {
      text-align:center; max-width:640px; margin:0 auto; padding: $space-xxxl 0;
    }
    .hero-badge {
      display:inline-block; background: $color-primary-light; color: $color-primary;
      padding: $space-xs $space-md; border-radius: $radius-full; font-size: $font-size-xs;
      font-weight: $font-weight-semibold; letter-spacing: $letter-spacing-wide; text-transform:uppercase;
      margin-bottom: $space-lg;
    }
    .hero-title {
      font-family: $font-family-display; font-size: $font-size-display; font-weight: $font-weight-bold;
      color: $color-text-primary; line-height: $line-height-tight; letter-spacing: $letter-spacing-tight;
      margin-bottom: $space-lg;
      span { display:block; }
      .accent { color: $color-primary; }
    }
    .hero-desc { font-size: $font-size-lg; color: $color-text-tertiary; line-height: $line-height-relaxed; margin-bottom: $space-xl; }
    .btn-primary {
      display:inline-flex; align-items:center; padding: $space-md $space-xl;
      background: $color-primary; color: $color-text-inverse; border-radius: $radius-lg;
      font-size: $font-size-md; font-weight: $font-weight-semibold; text-decoration:none;
      transition: all $transition-normal;
      &:hover { background: $color-primary-hover; color: $color-text-inverse; transform:translateY(-2px); box-shadow:0 8px 24px rgba(204,88,3,.25); }
    }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class HomeComponent implements OnInit {
  readonly authService = inject(AuthService);
  readonly store = inject(PersonalizationStore);

  ngOnInit(): void {
    this.store.loadHomeFeed();
  }
}
