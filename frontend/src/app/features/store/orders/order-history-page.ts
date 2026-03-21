import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentStore } from '../../../core/services/payment.store';

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Orders</h1>
        <a routerLink="/" class="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Continue Shopping
        </a>
      </div>

      @if (store.historyLoading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (store.paymentHistory().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </div>
          <h2>No orders yet</h2>
          <p>Your order history will appear here after your first purchase.</p>
          <a class="btn-primary" routerLink="/">Start Shopping</a>
        </div>
      } @else {
        <div class="order-list">
          @for (order of store.paymentHistory(); track order._id) {
            <div class="order-card">
              <div class="order-header">
                <div class="order-meta">
                  <span class="order-date">{{ order.createdAt | date:'dd MMM yyyy, h:mm a' }}</span>
                  <span class="order-id">{{ order.razorpayOrderId }}</span>
                </div>
                <span class="status-badge" [attr.data-status]="order.status">
                  {{ order.status | titlecase }}
                </span>
              </div>

              <div class="order-items">
                @for (item of order.checkoutSnapshot.items; track item.productId) {
                  <div class="order-line">
                    <span class="line-name">{{ item.name }}</span>
                    <span class="line-qty">x{{ item.qty }}</span>
                    <span class="line-price">₹{{ item.totalPrice | number:'1.2-2' }}</span>
                  </div>
                }
              </div>

              <div class="order-footer">
                <div class="order-address">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  {{ order.shippingAddress.city }}, {{ order.shippingAddress.state }}
                </div>
                <div class="order-total-row">
                  @if (order.invoiceId) {
                    <a class="btn-invoice" [href]="'/api/v1/invoices/' + order.invoiceId + '/download'" target="_blank">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      Invoice
                    </a>
                  }
                  <span class="order-total">₹{{ order.checkoutSnapshot.total | number:'1.2-2' }}</span>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .page { max-width: 800px; margin: 0 auto; padding: $space-xxl $space-lg; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: $space-xxl;
    }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0; }
    .btn-back {
      display: inline-flex; align-items: center; gap: $space-xs;
      font-size: $font-size-sm; color: $color-text-secondary; text-decoration: none;
      padding: $space-xs $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      transition: all $transition-fast;
      &:hover { color: $color-primary; border-color: $color-primary; }
    }

    .loading { display: flex; justify-content: center; padding: $space-xxxl; }
    .spinner { width: 32px; height: 32px; border: 2px solid $color-border; border-top-color: $color-primary; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: $space-md;
      padding: $space-xxxl 0; text-align: center;
      h2 { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0; }
      p { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }
    }
    .empty-icon {
      width: 80px; height: 80px; border-radius: $radius-xxl; background: $color-bg-secondary;
      display: flex; align-items: center; justify-content: center; color: $color-text-disabled;
    }
    .btn-primary {
      margin-top: $space-sm; padding: $space-sm $space-xl;
      background: $color-primary; color: $color-text-inverse; border-radius: $radius-md;
      font-size: $font-size-sm; font-weight: $font-weight-semibold; text-decoration: none;
      transition: all $transition-fast;
      &:hover { background: $color-primary-hover; transform: translateY(-1px); }
    }

    .order-list { display: flex; flex-direction: column; gap: $space-lg; }

    .order-card {
      background: $color-bg-tertiary; border: 1px solid $color-border-light;
      border-radius: $radius-xl; overflow: hidden;
      transition: border-color $transition-fast;
      &:hover { border-color: $color-border; box-shadow: $shadow-md; }
    }

    .order-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: $space-md $space-xl; background: $color-bg-secondary;
      border-bottom: 1px solid $color-border-light;
    }
    .order-meta { display: flex; flex-direction: column; gap: 2px; }
    .order-date { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }
    .order-id { font-size: $font-size-xs; color: $color-text-tertiary; font-family: monospace; }

    .status-badge {
      padding: $space-xxs $space-sm; border-radius: $radius-full;
      font-size: $font-size-xs; font-weight: $font-weight-bold;
      text-transform: uppercase; letter-spacing: 0.04em;

      &[data-status="captured"] { background: rgba(87, 136, 108, 0.12); color: $color-success; }
      &[data-status="created"] { background: rgba(204, 88, 3, 0.1); color: $color-primary; }
      &[data-status="failed"] { background: rgba(192, 57, 43, 0.1); color: $color-error; }
      &[data-status="refunded"],
      &[data-status="partially_refunded"] { background: rgba(162, 126, 142, 0.12); color: $color-accent; }
    }

    .order-items { padding: $space-md $space-xl; }
    .order-line {
      display: grid; grid-template-columns: 1fr auto auto; gap: $space-md;
      padding: $space-xs 0; font-size: $font-size-sm;
      border-bottom: 1px solid $color-border-light;
      &:last-child { border-bottom: none; }
    }
    .line-name { color: $color-text-primary; font-weight: $font-weight-medium; }
    .line-qty { color: $color-text-tertiary; }
    .line-price { color: $color-primary; font-weight: $font-weight-semibold; }

    .order-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: $space-md $space-xl; border-top: 1px solid $color-border-light;
      background: $color-bg-secondary;
    }
    .order-address {
      display: flex; align-items: center; gap: $space-xs;
      font-size: $font-size-xs; color: $color-text-tertiary;
    }
    .order-total-row { display: flex; align-items: center; gap: $space-md; }
    .order-total { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; }

    .btn-invoice {
      display: inline-flex; align-items: center; gap: $space-xxs;
      font-size: $font-size-xs; font-weight: $font-weight-semibold;
      color: $color-primary; text-decoration: none;
      padding: $space-xxs $space-sm; border: 1px solid $color-primary;
      border-radius: $radius-md; transition: all $transition-fast;
      &:hover { background: $color-primary-light; }
    }
  `],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(PaymentStore);

  ngOnInit(): void {
    this.store.loadPaymentHistory();
  }
}
