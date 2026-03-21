import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Wishlist</h1>
          <p class="page-subtitle">
            {{ cart.wishlistItems().length }} saved item{{ cart.wishlistItems().length !== 1 ? 's' : '' }}
          </p>
        </div>
        <a routerLink="/" class="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Continue Shopping
        </a>
      </div>

      @if (cart.wishlistLoading()) {
        <div class="loading">
          <div class="spinner"></div>
        </div>
      } @else if (cart.wishlistItems().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </div>
          <h2 class="empty-title">Nothing saved yet</h2>
          <p class="empty-sub">Tap the heart on any product to save it here.</p>
          <a class="btn-primary" routerLink="/">Start exploring</a>
        </div>
      } @else {
        <div class="product-grid">
          @for (item of cart.wishlistItems(); track item.productId) {
            <div class="product-card">
              <!-- Wishlist remove -->
              <button
                class="heart-btn active"
                (click)="cart.toggleWishlist(item.productId)"
                title="Remove from wishlist"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>

              <!-- Image -->
              <div class="card-image">
                @if (item.image) {
                  <img [src]="item.image" [alt]="item.name" loading="lazy" />
                } @else {
                  <div class="img-placeholder">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                      <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    </svg>
                  </div>
                }
                <!-- Archived badge -->
                @if (item.status === 'archived') {
                  <span class="status-badge archived">Unavailable</span>
                }
              </div>

              <!-- Info -->
              <div class="card-info">
                <p class="product-name">{{ item.name }}</p>
                <p class="product-price">₹{{ item.basePrice | number:'1.0-0' }}</p>
              </div>

              <!-- Actions -->
              <div class="card-actions">
                <button
                  class="btn-add-cart"
                  [disabled]="item.status !== 'active'"
                  (click)="addToCart(item.productId)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/>
                    <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  {{ item.status === 'active' ? 'Add to Cart' : 'Unavailable' }}
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: $space-xxl $space-lg;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: $space-xxl;
    }

    .page-title {
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      margin: 0 0 $space-xxs;
      letter-spacing: $letter-spacing-tight;
    }

    .page-subtitle {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin: 0;
    }

    .btn-back {
      display: inline-flex;
      align-items: center;
      gap: $space-xs;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-secondary;
      text-decoration: none;
      padding: $space-xs $space-md;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      transition: all $transition-fast;

      &:hover {
        color: $color-primary;
        border-color: $color-primary;
        background: $color-primary-light;
      }
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: $space-xxxl 0;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 2px solid $color-border;
      border-top-color: $color-primary;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $space-md;
      padding: $space-xxxl 0;
      text-align: center;
    }

    .empty-icon {
      width: 100px;
      height: 100px;
      border-radius: $radius-xxl;
      background: $color-bg-secondary;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $color-text-disabled;
    }

    .empty-title {
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      margin: 0;
    }

    .empty-sub {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin: 0;
    }

    .btn-primary {
      margin-top: $space-sm;
      padding: $space-sm $space-xl;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      text-decoration: none;
      transition: all $transition-fast;

      &:hover {
        background: $color-primary-hover;
        transform: translateY(-1px);
      }
    }

    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: $space-lg;
    }

    .product-card {
      position: relative;
      background: $color-bg-tertiary;
      border: 1px solid $color-border-light;
      border-radius: $radius-xl;
      overflow: hidden;
      transition: all $transition-normal;

      &:hover {
        border-color: $color-border;
        box-shadow: $shadow-lg;
        transform: translateY(-2px);
      }
    }

    .heart-btn {
      position: absolute;
      top: $space-sm;
      right: $space-sm;
      z-index: 1;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all $transition-fast;
      color: $color-text-disabled;
      box-shadow: $shadow-sm;

      &.active {
        color: #E74C3C;
        background: rgba(231, 76, 60, 0.08);
      }

      &:hover {
        transform: scale(1.1);
      }
    }

    .card-image {
      position: relative;
      aspect-ratio: 1;
      background: $color-bg-secondary;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform $transition-slow;
      }

      &:hover img {
        transform: scale(1.04);
      }
    }

    .img-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $color-text-disabled;
    }

    .status-badge {
      position: absolute;
      bottom: $space-sm;
      left: $space-sm;
      padding: 2px $space-xs;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;

      &.archived {
        background: rgba(58, 45, 50, 0.8);
        color: $color-text-inverse;
      }
    }

    .card-info {
      padding: $space-md $space-md $space-xs;
    }

    .product-name {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin: 0 0 $space-xxs;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .product-price {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-primary;
      margin: 0;
    }

    .card-actions {
      padding: $space-xs $space-md $space-md;
    }

    .btn-add-cart {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $space-xs;
      width: 100%;
      padding: $space-sm;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: all $transition-fast;

      &:disabled {
        background: $color-border;
        color: $color-text-disabled;
        cursor: not-allowed;
      }

      &:not(:disabled):hover {
        background: $color-primary-hover;
        transform: translateY(-1px);
      }
    }
  `],
})
export class WishlistPageComponent implements OnInit {
  readonly cart = inject(CartStore);

  ngOnInit(): void {
    this.cart.loadWishlist();
  }

  addToCart(productId: string): void {
    this.cart.addToCartFromWishlist(productId);
  }
}
