import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CartStore, CheckoutSummary } from '../../../core/services/cart.store';
import { environment } from '../../../../environments/environment';

type Step = 'cart' | 'address' | 'summary';

interface StockIssueItem {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

interface AddressForm {
  name: string;
  phone: string;
  pincode: string;
  street: string;
  city: string;
  state: string;
}

const emptyAddress = (): AddressForm => ({
  name: '',
  phone: '',
  pincode: '',
  street: '',
  city: '',
  state: '',
});

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="checkout-page">
      <!-- Step indicator -->
      <div class="step-bar">
        <div class="step-track">
          @for (s of steps; track s.key; let i = $index) {
            <div class="step" [class.active]="currentStep() === s.key" [class.done]="isStepDone(s.key)">
              <div class="step-circle">
                @if (isStepDone(s.key)) {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                } @else {
                  <span>{{ i + 1 }}</span>
                }
              </div>
              <span class="step-label">{{ s.label }}</span>
            </div>
            @if (i < steps.length - 1) {
              <div class="step-line" [class.done]="isStepDone(s.key)"></div>
            }
          }
        </div>
      </div>

      <div class="checkout-layout">
        <!-- Main Panel -->
        <div class="main-panel">

          <!-- ── STEP 1: CART REVIEW ───────────────────────────────────── -->
          @if (currentStep() === 'cart') {
            <div class="panel-card">
              <h2 class="panel-title">Review Your Cart</h2>

              @if (cart.cartItems().length === 0) {
                <div class="empty-cart">
                  <p>Your cart is empty.</p>
                  <a routerLink="/" class="btn-link">Browse products →</a>
                </div>
              } @else {
                <div class="cart-items">
                  @for (item of cart.cartItems(); track item.productId) {
                    <div class="line-item">
                      <div class="line-image">
                        @if (item.image) {
                          <img [src]="item.image" [alt]="item.name" />
                        } @else {
                          <div class="img-ph">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                            </svg>
                          </div>
                        }
                      </div>
                      <div class="line-info">
                        <p class="line-name">{{ item.name }}</p>
                        <p class="line-price">₹{{ item.basePrice | number:'1.0-0' }} each</p>
                      </div>
                      <div class="line-qty">
                        <button class="qty-btn" (click)="cart.updateQty(item.productId, item.qty - 1)">−</button>
                        <span>{{ item.qty }}</span>
                        <button class="qty-btn" (click)="cart.updateQty(item.productId, item.qty + 1)" [disabled]="item.qty >= 10">+</button>
                      </div>
                      <p class="line-total">₹{{ item.lineTotal | number:'1.0-0' }}</p>
                      <button class="remove-btn" (click)="cart.removeItem(item.productId)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                  }
                </div>

                <div class="panel-footer">
                  <button class="btn-next" (click)="goTo('address')" [disabled]="cart.cartItems().length === 0">
                    Continue to Address
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              }
            </div>
          }

          <!-- ── STEP 2: ADDRESS ──────────────────────────────────────── -->
          @if (currentStep() === 'address') {
            <div class="panel-card">
              <h2 class="panel-title">Delivery Address</h2>
              <form class="address-form" (ngSubmit)="onAddressSubmit()">
                <div class="form-row two-col">
                  <div class="form-group">
                    <label>Full Name *</label>
                    <input [(ngModel)]="address.name" name="name" placeholder="Ramesh Kumar" required />
                  </div>
                  <div class="form-group">
                    <label>Phone *</label>
                    <input [(ngModel)]="address.phone" name="phone" placeholder="9876543210" required maxlength="10" />
                  </div>
                </div>
                <div class="form-row two-col">
                  <div class="form-group">
                    <label>Pincode *</label>
                    <input [(ngModel)]="address.pincode" name="pincode" placeholder="400001" required maxlength="6" />
                  </div>
                  <div class="form-group">
                    <label>City *</label>
                    <input [(ngModel)]="address.city" name="city" placeholder="Mumbai" required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Street Address *</label>
                    <input [(ngModel)]="address.street" name="street" placeholder="Flat 4B, Shanti Nagar, MG Road" required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>State *</label>
                    <input [(ngModel)]="address.state" name="state" placeholder="Maharashtra" required />
                  </div>
                </div>
                <div class="panel-footer">
                  <button type="button" class="btn-back" (click)="goTo('cart')">← Back</button>
                  <button type="submit" class="btn-next" [disabled]="!isAddressValid()">
                    Review Order
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          }

          <!-- ── STEP 3: SUMMARY ─────────────────────────────────────── -->
          @if (currentStep() === 'summary') {
            <div class="panel-card">
              <h2 class="panel-title">Order Summary</h2>

              @if (summaryLoading()) {
                <div class="loading"><div class="spinner"></div></div>
              } @else if (summary()) {
                <!-- Items -->
                <div class="summary-items">
                  @for (item of summary()!.items; track item.productId) {
                    <div class="summary-line">
                      <div class="sl-image">
                        @if (item.image) {
                          <img [src]="item.image" [alt]="item.name" />
                        } @else {
                          <div class="img-ph"></div>
                        }
                      </div>
                      <div class="sl-info">
                        <p class="sl-name">{{ item.name }}</p>
                        <p class="sl-meta">Qty: {{ item.qty }}
                          @if (item.pricing.isOnSale) {
                            <span class="discount-badge">−{{ item.pricing.discountPercent }}%</span>
                          }
                        </p>
                      </div>
                      <div class="sl-pricing">
                        @if (item.pricing.isOnSale) {
                          <p class="sl-original">₹{{ item.pricing.basePrice * item.qty | number:'1.0-0' }}</p>
                        }
                        <p class="sl-total">₹{{ item.pricing.totalPrice | number:'1.2-2' }}</p>
                      </div>
                    </div>
                  }
                </div>

                <!-- Delivery Address confirmation -->
                <div class="address-card">
                  <div class="address-card-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2"/>
                      <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    Delivery to
                  </div>
                  <p class="address-text">
                    <strong>{{ address.name }}</strong> · {{ address.phone }}<br/>
                    {{ address.street }}, {{ address.city }} {{ address.pincode }}, {{ address.state }}
                  </p>
                </div>
              }

              <!-- Stock issues -->
              @if (stockIssues().length > 0) {
                <div class="stock-alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <div>
                    <p class="alert-title">Stock unavailable for some items:</p>
                    @for (issue of stockIssues(); track issue.productId) {
                      <p class="alert-item">{{ issue.name }} — only {{ issue.available }} available (you have {{ issue.requested }})</p>
                    }
                  </div>
                </div>
              }

              <div class="panel-footer">
                <button type="button" class="btn-back" (click)="goTo('address')">← Back</button>
                <button
                  class="btn-place-order"
                  (click)="placeOrder()"
                  [disabled]="orderPlaced() || stockIssues().length > 0"
                >
                  @if (orderPlacing()) {
                    <div class="btn-spinner"></div> Reserving…
                  } @else if (orderPlaced()) {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    Order Placed!
                  } @else {
                    Place Order
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  }
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Price Panel -->
        @if (currentStep() !== 'cart' || cart.cartItems().length > 0) {
          <aside class="price-panel">
            <div class="price-card">
              <h3 class="price-title">Price Details</h3>
              <div class="price-rows">
                @if (summary() && currentStep() === 'summary') {
                  <div class="price-row">
                    <span>Subtotal ({{ summary()!.itemCount }} items)</span>
                    <span>₹{{ summary()!.subtotal | number:'1.0-0' }}</span>
                  </div>
                  @if (summary()!.totalDiscount > 0) {
                    <div class="price-row discount">
                      <span>Discount</span>
                      <span>−₹{{ summary()!.totalDiscount | number:'1.0-0' }}</span>
                    </div>
                  }
                  @if (summary()!.totalTax > 0) {
                    <div class="price-row">
                      <span>Taxes (GST)</span>
                      <span>₹{{ summary()!.totalTax | number:'1.0-0' }}</span>
                    </div>
                  }
                  <div class="price-row shipping">
                    <span>Delivery</span>
                    <span class="free-tag">FREE</span>
                  </div>
                  <div class="price-divider"></div>
                  <div class="price-row total">
                    <span>Total</span>
                    <span>₹{{ summary()!.total | number:'1.2-2' }}</span>
                  </div>
                  @if (summary()!.totalDiscount > 0) {
                    <p class="savings-note">
                      You save ₹{{ summary()!.totalDiscount | number:'1.0-0' }} on this order 🎉
                    </p>
                  }
                } @else {
                  <div class="price-row">
                    <span>Subtotal ({{ cart.cartCount() }} items)</span>
                    <span>₹{{ cart.cartSubtotal() | number:'1.0-0' }}</span>
                  </div>
                  <div class="price-row shipping">
                    <span>Delivery</span>
                    <span class="free-tag">FREE</span>
                  </div>
                  <div class="price-divider"></div>
                  <div class="price-row total">
                    <span>Total (approx.)</span>
                    <span>₹{{ cart.cartSubtotal() | number:'1.0-0' }}</span>
                  </div>
                  <p class="tax-note">Final price with discounts & taxes shown in Step 3</p>
                }
              </div>
            </div>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .checkout-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: $space-xxl $space-lg $space-xxxl;
    }

    // ── Step Bar ──────────────────────────────────────────────────────────────

    .step-bar {
      margin-bottom: $space-xxl;
    }

    .step-track {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
    }

    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $space-xs;
    }

    .step-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid $color-border;
      background: $color-bg-tertiary;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-tertiary;
      transition: all $transition-normal;

      .step.active & {
        border-color: $color-primary;
        background: $color-primary;
        color: $color-text-inverse;
      }

      .step.done & {
        border-color: $color-success;
        background: $color-success;
        color: $color-text-inverse;
      }
    }

    .step-label {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      color: $color-text-tertiary;
      white-space: nowrap;

      .step.active & { color: $color-primary; font-weight: $font-weight-semibold; }
      .step.done & { color: $color-success; }
    }

    .step-line {
      flex: 1;
      height: 2px;
      background: $color-border-light;
      min-width: 60px;
      max-width: 120px;
      margin-bottom: 20px;
      transition: background $transition-normal;

      &.done { background: $color-success; }
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    .checkout-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: $space-xl;
      align-items: start;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }

    // ── Panel Card ────────────────────────────────────────────────────────────

    .panel-card {
      background: $color-bg-tertiary;
      border: 1px solid $color-border-light;
      border-radius: $radius-xl;
      overflow: hidden;
    }

    .panel-title {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      margin: 0;
      padding: $space-xl $space-xl $space-lg;
      border-bottom: 1px solid $color-border-light;
    }

    // ── Cart Items ────────────────────────────────────────────────────────────

    .cart-items {
      padding: $space-md $space-xl;
    }

    .line-item {
      display: grid;
      grid-template-columns: 64px 1fr auto auto auto;
      gap: $space-md;
      align-items: center;
      padding: $space-md 0;
      border-bottom: 1px solid $color-border-light;

      &:last-child { border-bottom: none; }
    }

    .line-image {
      width: 64px;
      height: 64px;
      border-radius: $radius-md;
      overflow: hidden;
      background: $color-bg-secondary;

      img { width: 100%; height: 100%; object-fit: cover; }
    }

    .img-ph {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $color-text-disabled;
      background: $color-bg-secondary;
      border-radius: $radius-md;
    }

    .line-info { min-width: 0; }
    .line-name {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin: 0 0 $space-xxs;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .line-price { font-size: $font-size-xs; color: $color-text-tertiary; margin: 0; }

    .line-qty {
      display: flex;
      align-items: center;
      gap: $space-xs;
      background: $color-bg-secondary;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      padding: 4px $space-xs;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
    }

    .qty-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      font-size: $font-size-md;
      color: $color-text-secondary;
      cursor: pointer;
      border-radius: $radius-sm;
      line-height: 1;

      &:hover { background: $color-primary-light; color: $color-primary; }
    }

    .line-total {
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
      color: $color-primary;
      margin: 0;
      white-space: nowrap;
    }

    .remove-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: $color-text-disabled;
      cursor: pointer;
      border-radius: $radius-sm;
      transition: all $transition-fast;

      &:hover { background: rgba(192,57,43,0.08); color: $color-error; }
    }

    // ── Address Form ──────────────────────────────────────────────────────────

    .address-form { padding: $space-xl; }

    .form-row { display: flex; flex-direction: column; gap: 0; margin-bottom: $space-md; }
    .form-row.two-col { flex-direction: row; gap: $space-md; }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: $space-xs;
      flex: 1;

      label {
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        color: $color-text-secondary;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      input {
        padding: $space-sm $space-md;
        border: 1px solid $color-border;
        border-radius: $radius-md;
        font-size: $font-size-sm;
        color: $color-text-primary;
        background: $color-bg-secondary;
        transition: all $transition-fast;
        outline: none;
        font-family: $font-family;

        &:focus {
          border-color: $color-primary;
          background: $color-bg-tertiary;
          box-shadow: $shadow-glow;
        }

        &::placeholder { color: $color-text-disabled; }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    .loading {
      display: flex;
      justify-content: center;
      padding: $space-xxl;
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

    .summary-items { padding: $space-md $space-xl; }

    .summary-line {
      display: grid;
      grid-template-columns: 56px 1fr auto;
      gap: $space-md;
      align-items: center;
      padding: $space-sm 0;
      border-bottom: 1px solid $color-border-light;

      &:last-child { border-bottom: none; }
    }

    .sl-image {
      width: 56px;
      height: 56px;
      border-radius: $radius-md;
      overflow: hidden;
      background: $color-bg-secondary;

      img { width: 100%; height: 100%; object-fit: cover; }
    }

    .sl-info { min-width: 0; }
    .sl-name {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin: 0 0 $space-xxs;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sl-meta {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      margin: 0;
      display: flex;
      align-items: center;
      gap: $space-xs;
    }

    .discount-badge {
      background: rgba(87, 136, 108, 0.12);
      color: $color-success;
      padding: 1px 6px;
      border-radius: $radius-full;
      font-size: 10px;
      font-weight: $font-weight-bold;
    }

    .sl-pricing { text-align: right; }
    .sl-original {
      font-size: $font-size-xs;
      color: $color-text-disabled;
      text-decoration: line-through;
      margin: 0 0 2px;
    }
    .sl-total {
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
      color: $color-primary;
      margin: 0;
    }

    .address-card {
      margin: 0 $space-xl $space-md;
      padding: $space-md;
      background: $color-bg-secondary;
      border: 1px solid $color-border-light;
      border-radius: $radius-lg;
    }

    .address-card-header {
      display: flex;
      align-items: center;
      gap: $space-xs;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      color: $color-text-secondary;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: $space-xs;
    }

    .address-text {
      font-size: $font-size-sm;
      color: $color-text-primary;
      margin: 0;
      line-height: $line-height-relaxed;
    }

    .stock-alert {
      display: flex;
      gap: $space-sm;
      margin: 0 $space-xl $space-md;
      padding: $space-md;
      background: rgba(192, 57, 43, 0.06);
      border: 1px solid rgba(192, 57, 43, 0.2);
      border-radius: $radius-lg;
      color: $color-error;
    }

    .alert-title {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      margin: 0 0 $space-xxs;
    }

    .alert-item {
      font-size: $font-size-xs;
      margin: 0;
      line-height: $line-height-relaxed;
    }

    .empty-cart {
      padding: $space-xxl;
      text-align: center;
      color: $color-text-tertiary;
      font-size: $font-size-sm;

      p { margin: 0 0 $space-sm; }
    }

    .btn-link {
      color: $color-primary;
      font-weight: $font-weight-semibold;
      text-decoration: none;

      &:hover { text-decoration: underline; }
    }

    // ── Panel Footer ──────────────────────────────────────────────────────────

    .panel-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: $space-md;
      padding: $space-lg $space-xl;
      border-top: 1px solid $color-border-light;
      background: $color-bg-secondary;
    }

    .btn-back {
      padding: $space-sm $space-lg;
      background: transparent;
      color: $color-text-secondary;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover { border-color: $color-border; background: $color-bg-secondary; }
    }

    .btn-next {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-sm $space-xl;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover:not(:disabled) {
        background: $color-primary-hover;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(204, 88, 3, 0.25);
      }

      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .btn-place-order {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-sm $space-xl;
      background: $color-success;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover:not(:disabled) {
        background: $color-secondary-hover;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(87, 136, 108, 0.3);
      }

      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }

    .btn-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    // ── Price Panel ───────────────────────────────────────────────────────────

    .price-panel { position: sticky; top: 80px; }

    .price-card {
      background: $color-bg-tertiary;
      border: 1px solid $color-border-light;
      border-radius: $radius-xl;
      overflow: hidden;
    }

    .price-title {
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      color: $color-text-secondary;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: 0;
      padding: $space-md $space-lg;
      background: $color-bg-secondary;
      border-bottom: 1px solid $color-border-light;
    }

    .price-rows { padding: $space-md $space-lg $space-lg; }

    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: $space-xs 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;

      &.discount { color: $color-success; }
      &.shipping span:last-child { color: $color-success; font-weight: $font-weight-semibold; }

      &.total {
        font-size: $font-size-md;
        font-weight: $font-weight-bold;
        color: $color-text-primary;
      }
    }

    .free-tag {
      font-weight: $font-weight-semibold;
    }

    .price-divider {
      height: 1px;
      background: $color-border-light;
      margin: $space-sm 0;
    }

    .savings-note {
      margin: $space-sm 0 0;
      padding: $space-xs $space-sm;
      background: rgba(87, 136, 108, 0.08);
      border-radius: $radius-md;
      font-size: $font-size-xs;
      color: $color-success;
      font-weight: $font-weight-medium;
      text-align: center;
    }

    .tax-note {
      margin: $space-sm 0 0;
      font-size: $font-size-xs;
      color: $color-text-disabled;
      line-height: $line-height-relaxed;
    }
  `],
})
export class CheckoutPageComponent implements OnInit {
  readonly cart = inject(CartStore);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = environment.apiUrl;

  readonly steps = [
    { key: 'cart' as Step, label: 'Cart' },
    { key: 'address' as Step, label: 'Address' },
    { key: 'summary' as Step, label: 'Summary' },
  ];

  readonly currentStep = signal<Step>('cart');
  readonly summary = signal<CheckoutSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly stockIssues = signal<StockIssueItem[]>([]);
  readonly orderPlacing = signal(false);
  readonly orderPlaced = signal(false);

  address: AddressForm = emptyAddress();

  ngOnInit(): void {
    this.cart.loadCart();
  }

  isStepDone(step: Step): boolean {
    const order: Step[] = ['cart', 'address', 'summary'];
    return order.indexOf(step) < order.indexOf(this.currentStep());
  }

  goTo(step: Step): void {
    if (step === 'summary') {
      this.loadSummary();
    }
    this.currentStep.set(step);
  }

  onAddressSubmit(): void {
    if (this.isAddressValid()) {
      this.goTo('summary');
    }
  }

  isAddressValid(): boolean {
    return !!(
      this.address.name.trim() &&
      this.address.phone.trim().length >= 10 &&
      this.address.pincode.trim().length === 6 &&
      this.address.street.trim() &&
      this.address.city.trim() &&
      this.address.state.trim()
    );
  }

  private loadSummary(): void {
    this.summaryLoading.set(true);
    this.http
      .get<{ success: boolean; data: CheckoutSummary }>(
        `${this.api}/checkout/summary`,
        { headers: this.sessionHeaders() },
      )
      .subscribe({
        next: (res) => {
          this.summary.set(res.data);
          this.summaryLoading.set(false);
        },
        error: () => this.summaryLoading.set(false),
      });
  }

  placeOrder(): void {
    this.orderPlacing.set(true);
    this.stockIssues.set([]);

    this.http
      .post<{ success: boolean; data: { reserved: boolean; issues?: StockIssueItem[] } }>(
        `${this.api}/checkout/reserve`,
        {},
        { headers: this.sessionHeaders() },
      )
      .subscribe({
        next: () => {
          this.orderPlacing.set(false);
          this.orderPlaced.set(true);
          // Clear cart and redirect after short delay
          setTimeout(() => {
            this.cart.clearCart();
            this.router.navigate(['/']);
          }, 2000);
        },
        error: (err) => {
          this.orderPlacing.set(false);
          if (err.status === 409 && err.error?.data?.issues) {
            this.stockIssues.set(err.error.data.issues);
          }
        },
      });
  }

  private sessionHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Session-ID': this.cart.sessionId });
  }
}
