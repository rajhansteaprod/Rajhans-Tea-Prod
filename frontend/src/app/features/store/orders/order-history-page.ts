import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderStore } from '../../../core/services/order.store';

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">My Orders</h1>
        <a routerLink="/" class="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Continue Shopping
        </a>
      </div>

      @if (store.loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (store.orders().length === 0) {
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
          @for (order of store.orders(); track order._id) {
            <div class="order-card">
              <!-- Header -->
              <div class="order-header">
                <div class="order-meta">
                  <span class="order-number">{{ order.orderNumber }}</span>
                  <span class="order-date">{{ order.createdAt | date:'dd MMM yyyy, h:mm a' }}</span>
                </div>
                <span class="status-badge" [attr.data-status]="order.status">
                  {{ formatStatus(order.status) }}
                </span>
              </div>

              <!-- Items -->
              <div class="order-items">
                @for (item of order.items; track item.productId) {
                  <div class="order-line">
                    <span class="line-name">{{ item.name }}</span>
                    <span class="line-qty">x{{ item.qty }}</span>
                    <span class="line-price">₹{{ item.totalPrice | number:'1.2-2' }}</span>
                  </div>
                }
              </div>

              <!-- Footer -->
              <div class="order-footer">
                <div class="footer-left">
                  <div class="order-address">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2"/>
                      <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    {{ order.shippingAddress.city }}, {{ order.shippingAddress.state }}
                  </div>
                  @if (order.shiprocket.courierName) {
                    <span class="courier-info">{{ order.shiprocket.courierName }}
                      @if (order.shiprocket.awbCode) {
                        · {{ order.shiprocket.awbCode }}
                      }
                    </span>
                  }
                </div>
                <div class="footer-right">
                  @if (order.shiprocket.trackingUrl) {
                    <a class="btn-track" [href]="order.shiprocket.trackingUrl" target="_blank">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <polyline points="12 6 12 12 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      Track
                    </a>
                  }
                  <span class="order-total">₹{{ order.total | number:'1.0-0' }}</span>
                </div>
              </div>

              <!-- Status Timeline -->
              @if (order.statusHistory.length > 1) {
                <div class="timeline">
                  @for (h of order.statusHistory; track h.timestamp) {
                    <div class="timeline-item">
                      <div class="timeline-dot" [attr.data-status]="h.status"></div>
                      <div class="timeline-content">
                        <span class="timeline-status">{{ formatStatus(h.status) }}</span>
                        <span class="timeline-date">{{ h.timestamp | date:'dd MMM, h:mm a' }}</span>
                        @if (h.note) {
                          <span class="timeline-note">{{ h.note }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (store.meta()) {
          <div class="pagination">
            <button [disabled]="store.meta()!.page <= 1" (click)="store.loadOrders(store.meta()!.page - 1)">← Prev</button>
            <span>Page {{ store.meta()!.page }} of {{ store.meta()!.totalPages }}</span>
            <button [disabled]="store.meta()!.page >= store.meta()!.totalPages" (click)="store.loadOrders(store.meta()!.page + 1)">Next →</button>
          </div>
        }
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
    .order-number { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; font-family: monospace; }
    .order-date { font-size: $font-size-xs; color: $color-text-tertiary; }

    .status-badge {
      padding: $space-xxs $space-sm; border-radius: $radius-full;
      font-size: $font-size-xs; font-weight: $font-weight-bold;
      text-transform: uppercase; letter-spacing: 0.04em;

      &[data-status="confirmed"] { background: rgba(204, 88, 3, 0.1); color: $color-primary; }
      &[data-status="processing"] { background: rgba(162, 126, 142, 0.12); color: $color-accent; }
      &[data-status="shipped"], &[data-status="in_transit"], &[data-status="out_for_delivery"] { background: rgba(70, 130, 180, 0.1); color: #4682B4; }
      &[data-status="delivered"] { background: rgba(87, 136, 108, 0.12); color: $color-success; }
      &[data-status="cancelled"], &[data-status="returned"] { background: rgba(192, 57, 43, 0.1); color: $color-error; }
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
    .footer-left { display: flex; flex-direction: column; gap: $space-xxs; }
    .order-address {
      display: flex; align-items: center; gap: $space-xs;
      font-size: $font-size-xs; color: $color-text-tertiary;
    }
    .courier-info { font-size: $font-size-xs; color: $color-accent; font-family: monospace; }
    .footer-right { display: flex; align-items: center; gap: $space-md; }
    .order-total { font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; }

    .btn-track {
      display: inline-flex; align-items: center; gap: $space-xxs;
      font-size: $font-size-xs; font-weight: $font-weight-semibold;
      color: #4682B4; text-decoration: none;
      padding: $space-xxs $space-sm; border: 1px solid #4682B4;
      border-radius: $radius-md; transition: all $transition-fast;
      &:hover { background: rgba(70, 130, 180, 0.08); }
    }

    .timeline {
      padding: $space-md $space-xl $space-lg;
      border-top: 1px solid $color-border-light;
    }
    .timeline-item {
      display: flex; align-items: flex-start; gap: $space-sm;
      padding: $space-xs 0;
      position: relative;
      padding-left: $space-lg;

      &:not(:last-child)::before {
        content: '';
        position: absolute;
        left: 5px;
        top: 18px;
        bottom: -4px;
        width: 2px;
        background: $color-border-light;
      }
    }
    .timeline-dot {
      position: absolute;
      left: 0;
      top: 4px;
      width: 12px; height: 12px;
      border-radius: 50%;
      border: 2px solid $color-border;
      background: $color-bg-tertiary;

      &[data-status="confirmed"] { border-color: $color-primary; background: $color-primary; }
      &[data-status="processing"] { border-color: $color-accent; background: $color-accent; }
      &[data-status="shipped"], &[data-status="in_transit"], &[data-status="out_for_delivery"] { border-color: #4682B4; background: #4682B4; }
      &[data-status="delivered"] { border-color: $color-success; background: $color-success; }
      &[data-status="cancelled"] { border-color: $color-error; background: $color-error; }
    }
    .timeline-content { display: flex; flex-direction: column; gap: 1px; }
    .timeline-status { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }
    .timeline-date { font-size: $font-size-xs; color: $color-text-tertiary; }
    .timeline-note { font-size: $font-size-xs; color: $color-text-secondary; font-style: italic; }

    .pagination {
      display: flex; align-items: center; justify-content: center; gap: $space-md;
      padding: $space-xl 0;
      button {
        padding: $space-xs $space-md; border: 1px solid $color-border; border-radius: $radius-md;
        background: transparent; font-size: $font-size-sm; cursor: pointer;
        &:disabled { opacity: 0.4; cursor: not-allowed; }
      }
      span { font-size: $font-size-sm; color: $color-text-tertiary; }
    }
  `],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(OrderStore);

  ngOnInit(): void {
    this.store.loadOrders();
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
