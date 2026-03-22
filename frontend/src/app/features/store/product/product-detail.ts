import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { CartStore } from '../../../core/services/cart.store';
import { PersonalizationStore } from '../../../core/services/personalization.store';
import { ReviewStore, RatingSummary } from '../../../core/services/review.store';
import { ProductRailComponent } from '../../../shared/components/product-rail/product-rail';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductRailComponent],
  template: `
    @if (product()) {
      <div class="product-page">
        <!-- Breadcrumbs -->
        <nav class="breadcrumbs">
          <a routerLink="/">Home</a> /
          <a [routerLink]="'/catalog/' + product().category?.slug">{{ product().category?.name }}</a> /
          <span>{{ product().name }}</span>
        </nav>

        <div class="product-layout">
          <!-- Images -->
          <div class="gallery">
            <div class="main-image">
              <img [src]="selectedImage() || product().images[0] || ''" [alt]="product().name" />
            </div>
            @if (product().images.length > 1) {
              <div class="thumbnails">
                @for (img of product().images; track img) {
                  <button class="thumb" [class.active]="selectedImage() === img" (click)="selectedImage.set(img)">
                    <img [src]="img" [alt]="product().name" />
                  </button>
                }
              </div>
            }
          </div>

          <!-- Info -->
          <div class="product-info">
            <p class="category-label">{{ product().category?.name }}</p>
            <h1 class="product-name">{{ product().name }}</h1>

            @if (ratingSummary()) {
              <div class="rating-row">
                <span class="stars">{{ '★'.repeat(Math.round(ratingSummary()!.averageRating)) }}{{ '☆'.repeat(5 - Math.round(ratingSummary()!.averageRating)) }}</span>
                <span class="rating-text">{{ ratingSummary()!.averageRating }} ({{ ratingSummary()!.totalReviews }} reviews)</span>
              </div>
            }

            <p class="price">₹{{ product().basePrice | number:'1.0-0' }}</p>

            @if (product().shortDescription) {
              <p class="short-desc">{{ product().shortDescription }}</p>
            }

            <!-- Stock Status -->
            @if (product().trackInventory) {
              @if (product().stock > 0) {
                <p class="stock in-stock">In Stock ({{ product().stock }} left)</p>
              } @else {
                <p class="stock out-of-stock">Out of Stock</p>
              }
            }

            <!-- Actions -->
            <div class="actions">
              <button class="btn-cart" [disabled]="product().stock === 0 && product().trackInventory" (click)="addToCart()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/></svg>
                Add to Cart
              </button>
              <button class="btn-wishlist" [class.active]="cartStore.isWishlisted(product()._id)()" (click)="cartStore.toggleWishlist(product()._id)">
                <svg width="20" height="20" viewBox="0 0 24 24" [attr.fill]="cartStore.isWishlisted(product()._id)() ? 'currentColor' : 'none'">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>
            </div>

            <!-- Share -->
            <div class="share-row">
              <span class="share-label">Share:</span>
              <button class="share-btn" (click)="shareWhatsApp()">WhatsApp</button>
              <button class="share-btn" (click)="copyLink()">{{ copied() ? 'Copied!' : 'Copy Link' }}</button>
            </div>

            <!-- Description -->
            @if (product().description) {
              <div class="description">
                <h3>Description</h3>
                <div [innerHTML]="product().description"></div>
              </div>
            }

            <!-- Tags -->
            @if (product().tags?.length > 0) {
              <div class="tags">
                @for (tag of product().tags; track tag) {
                  <a class="tag" [routerLink]="'/products'" [queryParams]="{tags: tag}">{{ tag }}</a>
                }
              </div>
            }
          </div>
        </div>

        <!-- Recommendations -->
        @if (recos()) {
          @if (recos().frequentlyBoughtTogether?.length > 0) {
            <app-product-rail title="Frequently Bought Together" [products]="recos().frequentlyBoughtTogether" />
          }
          @if (recos().similar?.length > 0) {
            <app-product-rail title="Similar Products" [products]="recos().similar" />
          }
        }
      </div>
    } @else {
      <div class="loading"><div class="spinner"></div></div>
    }

    <!-- Sticky Add to Cart (mobile) -->
    @if (product() && !(product().stock === 0 && product().trackInventory)) {
      <div class="sticky-bar">
        <span class="sticky-price">₹{{ product().basePrice | number:'1.0-0' }}</span>
        <button class="sticky-btn" (click)="addToCart()">Add to Cart</button>
      </div>
    }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .product-page { max-width:1100px; margin:0 auto; padding: $space-lg; }
    .breadcrumbs { font-size: $font-size-xs; color: $color-text-tertiary; margin-bottom: $space-lg;
      a { color: $color-text-tertiary; text-decoration:none; &:hover { color: $color-primary; } }
      span { color: $color-text-primary; }
    }

    .product-layout { display:grid; grid-template-columns: 1fr 1fr; gap: $space-xxl; margin-bottom: $space-xxl; }
    @media(max-width:768px) { .product-layout { grid-template-columns:1fr; } }

    .gallery { position:sticky; top:80px; align-self:start; }
    .main-image { aspect-ratio:1; border-radius: $radius-xl; overflow:hidden; background: $color-bg-secondary; margin-bottom: $space-sm;
      img { width:100%; height:100%; object-fit:cover; }
    }
    .thumbnails { display:flex; gap: $space-xs; overflow-x:auto; }
    .thumb { width:64px; height:64px; border-radius: $radius-md; overflow:hidden; border:2px solid transparent; cursor:pointer; padding:0; background:none;
      &.active { border-color: $color-primary; }
      img { width:100%; height:100%; object-fit:cover; }
    }

    .category-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; letter-spacing:.06em; margin:0 0 $space-xs; }
    .product-name { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-sm; line-height: $line-height-tight; }
    .rating-row { display:flex; align-items:center; gap: $space-sm; margin-bottom: $space-md; }
    .stars { color:#F59E0B; font-size: $font-size-md; }
    .rating-text { font-size: $font-size-sm; color: $color-text-tertiary; }
    .price { font-size: $font-size-xxxl; font-weight: $font-weight-bold; color: $color-primary; margin:0 0 $space-md; }
    .short-desc { font-size: $font-size-md; color: $color-text-secondary; line-height: $line-height-relaxed; margin:0 0 $space-md; }
    .stock { font-size: $font-size-sm; font-weight: $font-weight-semibold; margin:0 0 $space-lg;
      &.in-stock { color: $color-success; }
      &.out-of-stock { color: $color-error; }
    }

    .actions { display:flex; gap: $space-md; margin-bottom: $space-lg; }
    .btn-cart { flex:1; display:flex; align-items:center; justify-content:center; gap: $space-sm; padding: $space-md; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-lg; font-size: $font-size-md; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast;
      &:hover:not(:disabled) { background: $color-primary-hover; transform:translateY(-1px); box-shadow:0 4px 16px rgba(204,88,3,.3); }
      &:disabled { opacity:.5; cursor:not-allowed; }
    }
    .btn-wishlist { width:52px; height:52px; display:flex; align-items:center; justify-content:center; border:1px solid $color-border; border-radius: $radius-lg; background:transparent; cursor:pointer; color: $color-text-tertiary; transition: all $transition-fast;
      &:hover, &.active { color:#E74C3C; border-color:#E74C3C; }
    }

    .share-row { display:flex; align-items:center; gap: $space-sm; margin-bottom: $space-xl; }
    .share-label { font-size: $font-size-sm; color: $color-text-tertiary; }
    .share-btn { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-full; background:transparent; font-size: $font-size-xs; cursor:pointer; transition: all $transition-fast;
      &:hover { border-color: $color-primary; color: $color-primary; }
    }

    .description { margin-bottom: $space-xl;
      h3 { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-sm; }
      div { font-size: $font-size-sm; color: $color-text-secondary; line-height: $line-height-relaxed; }
    }

    .tags { display:flex; flex-wrap:wrap; gap: $space-xs; margin-bottom: $space-xl; }
    .tag { padding:2px $space-sm; border:1px solid $color-border; border-radius: $radius-full; font-size: $font-size-xs; color: $color-text-tertiary; text-decoration:none;
      &:hover { border-color: $color-primary; color: $color-primary; }
    }

    .sticky-bar { display:none; position:fixed; bottom:0; left:0; right:0; background: $color-bg-tertiary; border-top:1px solid $color-border-light; padding: $space-sm $space-lg; z-index: $z-sticky; box-shadow: $shadow-lg;
      @media(max-width:768px) { display:flex; align-items:center; justify-content:space-between; }
    }
    .sticky-price { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; }
    .sticky-btn { padding: $space-sm $space-xxl; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }

    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class ProductDetailComponent implements OnInit {
  readonly cartStore = inject(CartStore);
  private readonly personalization = inject(PersonalizationStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly api = environment.apiUrl;
  readonly Math = Math;

  readonly product = signal<any>(null);
  readonly selectedImage = signal<string | null>(null);
  readonly ratingSummary = signal<RatingSummary | null>(null);
  readonly recos = signal<any>(null);
  readonly copied = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.http.get<{ data: any }>(`${this.api}/catalog/products/${slug}`).subscribe({
        next: (res) => {
          this.product.set(res.data);
          this.selectedImage.set(res.data.images?.[0] || null);

          // SEO
          this.titleService.setTitle(`${res.data.name} — Rajhans Tea`);
          this.meta.updateTag({ name: 'description', content: res.data.shortDescription || res.data.name });
          this.meta.updateTag({ property: 'og:title', content: res.data.name });
          this.meta.updateTag({ property: 'og:description', content: res.data.shortDescription || '' });
          if (res.data.images?.[0]) this.meta.updateTag({ property: 'og:image', content: res.data.images[0] });

          // Track view
          this.personalization.trackProductView(res.data._id);

          // Load recommendations
          this.personalization.loadProductRecommendations(res.data._id);
          this.personalization.productRecos;

          // Load rating summary
          this.reviewStore.getRatingSummary(res.data._id).subscribe({
            next: (r) => this.ratingSummary.set(r.data),
          });

          // Load recommendations
          this.http.get<{ data: any }>(`${this.api}/personalization/product/${res.data._id}/recommendations`).subscribe({
            next: (r) => this.recos.set(r.data),
          });
        },
      });
    });
  }

  addToCart(): void {
    if (this.product()) this.cartStore.addItem(this.product()._id, 1);
  }

  shareWhatsApp(): void {
    const url = window.location.href;
    const text = `Check out ${this.product()?.name} on Rajhans Tea: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  copyLink(): void {
    navigator.clipboard.writeText(window.location.href);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
