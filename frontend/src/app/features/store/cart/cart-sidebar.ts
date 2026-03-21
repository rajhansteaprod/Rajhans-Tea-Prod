import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-cart-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Backdrop -->
    @if (cart.sidebarOpen()) {
      <div class="backdrop" (click)="cart.closeSidebar()"></div>
    }

    <!-- Drawer -->
    <aside class="drawer" [class.open]="cart.sidebarOpen()">
      <!-- Header -->
      <div class="drawer-header">
        <div class="drawer-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/>
            <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span>Cart</span>
          @if (cart.cartCount() > 0) {
            <span class="count-badge">{{ cart.cartCount() }}</span>
          }
        </div>
        <button class="close-btn" (click)="cart.closeSidebar()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="drawer-body">
        @if (cart.cartLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
          </div>
        } @else if (cart.cartItems().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.5"/>
                <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <p class="empty-title">Your cart is empty</p>
            <p class="empty-sub">Add some products to get started</p>
            <button class="btn-shop" (click)="cart.closeSidebar()" routerLink="/">
              Browse Products
            </button>
          </div>
        } @else {
          <ul class="item-list">
            @for (item of cart.cartItems(); track item.productId) {
              <li class="cart-item">
                <div class="item-image">
                  @if (item.image) {
                    <img [src]="item.image" [alt]="item.name" />
                  } @else {
                    <div class="img-placeholder">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                      </svg>
                    </div>
                  }
                </div>
                <div class="item-info">
                  <p class="item-name">{{ item.name }}</p>
                  <p class="item-price">₹{{ item.basePrice | number:'1.0-0' }} each</p>
                  <div class="qty-row">
                    <div class="qty-controls">
                      <button class="qty-btn" (click)="cart.updateQty(item.productId, item.qty - 1)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                      </button>
                      <span class="qty-value">{{ item.qty }}</span>
                      <button class="qty-btn" (click)="cart.updateQty(item.productId, item.qty + 1)" [disabled]="item.qty >= 10">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <span class="item-line-total">₹{{ item.lineTotal | number:'1.0-0' }}</span>
                  </div>
                </div>
                <button class="remove-btn" (click)="cart.removeItem(item.productId)" title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <!-- Footer -->
      @if (cart.cartItems().length > 0) {
        <div class="drawer-footer">
          <div class="subtotal-row">
            <span class="subtotal-label">Subtotal</span>
            <span class="subtotal-value">₹{{ cart.cartSubtotal() | number:'1.0-0' }}</span>
          </div>
          <p class="tax-note">Taxes & discounts calculated at checkout</p>
          <a
            class="btn-checkout"
            routerLink="/checkout"
            (click)="cart.closeSidebar()"
          >
            Proceed to Checkout
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
          <button class="btn-clear" (click)="cart.clearCart()">Clear cart</button>
        </div>
      }
    </aside>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(58, 45, 50, 0.4);
      backdrop-filter: blur(4px);
      z-index: $z-modal-backdrop;
      animation: fadeIn $transition-fast forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 420px;
      max-width: 100vw;
      background: $color-bg-tertiary;
      box-shadow: $shadow-xl;
      z-index: $z-modal;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform $transition-normal;
      border-left: 1px solid $color-border-light;

      &.open {
        transform: translateX(0);
      }
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $space-lg $space-xl;
      border-bottom: 1px solid $color-border-light;
      flex-shrink: 0;
    }

    .drawer-title {
      display: flex;
      align-items: center;
      gap: $space-sm;
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
    }

    .count-badge {
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: $radius-md;
      border: 1px solid $color-border-light;
      background: transparent;
      color: $color-text-tertiary;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover {
        background: $color-bg-secondary;
        color: $color-text-primary;
      }
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: $space-md $space-xl;
    }

    .loading-state {
      display: flex;
      justify-content: center;
      padding: $space-xxl 0;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 2px solid $color-border;
      border-top-color: $color-primary;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $space-sm;
      padding: $space-xxl 0;
      text-align: center;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      border-radius: $radius-xxl;
      background: $color-bg-secondary;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $color-text-tertiary;
      margin-bottom: $space-sm;
    }

    .empty-title {
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin: 0;
    }

    .empty-sub {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin: 0;
    }

    .btn-shop {
      margin-top: $space-md;
      padding: $space-sm $space-xl;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: all $transition-fast;
      text-decoration: none;

      &:hover {
        background: $color-primary-hover;
        transform: translateY(-1px);
      }
    }

    .item-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: $space-md;
    }

    .cart-item {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: $space-sm;
      align-items: start;
      padding: $space-md;
      background: $color-bg-secondary;
      border-radius: $radius-lg;
      border: 1px solid $color-border-light;
      transition: border-color $transition-fast;

      &:hover {
        border-color: $color-border;
      }
    }

    .item-image {
      width: 72px;
      height: 72px;
      border-radius: $radius-md;
      overflow: hidden;
      background: $color-bg-tertiary;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
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

    .item-info {
      display: flex;
      flex-direction: column;
      gap: $space-xxs;
      min-width: 0;
    }

    .item-name {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-price {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      margin: 0;
    }

    .qty-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: $space-xxs;
    }

    .qty-controls {
      display: flex;
      align-items: center;
      gap: $space-xs;
      background: $color-bg-tertiary;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      padding: 2px;
    }

    .qty-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: $radius-sm;
      border: none;
      background: transparent;
      color: $color-text-secondary;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover {
        background: $color-primary-light;
        color: $color-primary;
      }
    }

    .qty-value {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      min-width: 20px;
      text-align: center;
    }

    .item-line-total {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-primary;
    }

    .remove-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: $radius-sm;
      border: none;
      background: transparent;
      color: $color-text-disabled;
      cursor: pointer;
      transition: all $transition-fast;
      flex-shrink: 0;

      &:hover {
        background: rgba(192, 57, 43, 0.08);
        color: $color-error;
      }
    }

    .drawer-footer {
      padding: $space-lg $space-xl;
      border-top: 1px solid $color-border-light;
      background: $color-bg-secondary;
      flex-shrink: 0;
    }

    .subtotal-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: $space-xs;
    }

    .subtotal-label {
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-secondary;
    }

    .subtotal-value {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    .tax-note {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      margin: 0 0 $space-md;
    }

    .btn-checkout {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $space-sm;
      width: 100%;
      padding: $space-md;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-lg;
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      text-decoration: none;
      transition: all $transition-fast;

      &:hover {
        background: $color-primary-hover;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(204, 88, 3, 0.3);
      }
    }

    .btn-clear {
      display: block;
      width: 100%;
      margin-top: $space-sm;
      padding: $space-xs;
      background: transparent;
      color: $color-text-tertiary;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-xs;
      cursor: pointer;
      text-align: center;
      transition: color $transition-fast;

      &:hover {
        color: $color-error;
      }
    }
  `],
})
export class CartSidebarComponent {
  readonly cart = inject(CartStore);
}
