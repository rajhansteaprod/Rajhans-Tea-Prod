import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface PaymentItem {
  _id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  status: string;
  userId: { _id: string; phone: string; firstName?: string; lastName?: string; role: string } | null;
  checkoutSnapshot: {
    items: { productId: string; name: string; qty: number; unitPrice: number; totalPrice: number }[];
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    total: number;
  };
  shippingAddress: { name: string; phone: string; street: string; city: string; state: string; pincode: string };
  refundedAmount: number;
  refunds: { razorpayRefundId: string; amount: number; reason: string; createdAt: string }[];
  invoiceId: string | null;
  createdAt: string;
}

interface Stats {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  totalRefunded: number;
}

@Component({
  selector: 'app-admin-payment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="payment-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Payments</h1>
          <p class="page-subtitle">Manage all orders and payments</p>
        </div>
      </div>

      <!-- Stats Cards -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat-card revenue">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">Total Revenue</span>
              <span class="stat-value">₹{{ stats()!.totalRevenue | number:'1.0-0' }}</span>
            </div>
          </div>
          <div class="stat-card today">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">Today's Revenue</span>
              <span class="stat-value">₹{{ stats()!.todayRevenue | number:'1.0-0' }}</span>
            </div>
          </div>
          <div class="stat-card orders">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/></svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">Total Orders</span>
              <span class="stat-value">{{ stats()!.totalOrders }}</span>
            </div>
          </div>
          <div class="stat-card refund">
            <div class="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="23 4 23 10 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">Total Refunded</span>
              <span class="stat-value">₹{{ stats()!.totalRefunded | number:'1.0-0' }}</span>
            </div>
          </div>
        </div>
      }

      <!-- Filters -->
      <div class="filters-bar">
        <input class="search-input" placeholder="Search order ID, name, phone..." [(ngModel)]="searchQuery" (ngModelChange)="onSearch()" />
        <select class="status-filter" [(ngModel)]="statusFilter" (ngModelChange)="loadPayments()">
          <option value="">All Statuses</option>
          <option value="created">Created</option>
          <option value="captured">Captured</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partially Refunded</option>
        </select>
      </div>

      <!-- Payments Table -->
      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (payments().length === 0) {
        <div class="empty-state"><p>No payments found.</p></div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (p of payments(); track p._id) {
                <tr>
                  <td class="date-cell">{{ p.createdAt | date:'dd MMM yyyy, h:mm a' }}</td>
                  <td class="mono">{{ p.razorpayOrderId }}</td>
                  <td>
                    <div class="customer-cell">
                      <span class="customer-name">{{ p.userId?.firstName ? (p.userId!.firstName + ' ' + (p.userId!.lastName || '')) : p.shippingAddress.name }}</span>
                      <span class="customer-phone">{{ p.userId?.phone || p.shippingAddress.phone }}</span>
                    </div>
                  </td>
                  <td class="amount-cell">₹{{ p.amountPaise / 100 | number:'1.2-2' }}</td>
                  <td><span class="status-badge" [attr.data-status]="p.status">{{ p.status }}</span></td>
                  <td>
                    <div class="action-btns">
                      <button class="btn-action" (click)="openDetail(p)" title="View Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                      </button>
                      @if (p.status === 'captured' || p.status === 'partially_refunded') {
                        <button class="btn-action refund-btn" (click)="openRefund(p)" title="Refund">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="23 4 23 10 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                      }
                      @if (p.invoiceId) {
                        <a class="btn-action" [href]="'/api/v1/invoices/' + p.invoiceId + '/download'" target="_blank" title="Invoice">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </a>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (meta()) {
          <div class="pagination">
            <button class="page-btn" [disabled]="meta()!.page <= 1" (click)="loadPayments(meta()!.page - 1)">← Prev</button>
            <span class="page-info">Page {{ meta()!.page }} of {{ meta()!.totalPages }}</span>
            <button class="page-btn" [disabled]="meta()!.page >= meta()!.totalPages" (click)="loadPayments(meta()!.page + 1)">Next →</button>
          </div>
        }
      }

      <!-- Detail Modal -->
      @if (selectedPayment()) {
        <div class="modal-backdrop" (click)="selectedPayment.set(null)"></div>
        <div class="modal">
          <div class="modal-header">
            <h2>Payment Details</h2>
            <button class="close-btn" (click)="selectedPayment.set(null)">✕</button>
          </div>
          <div class="modal-body">
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Razorpay Order</span>
                <span class="detail-value mono">{{ selectedPayment()!.razorpayOrderId }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Payment ID</span>
                <span class="detail-value mono">{{ selectedPayment()!.razorpayPaymentId || '—' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Amount</span>
                <span class="detail-value">₹{{ selectedPayment()!.amountPaise / 100 | number:'1.2-2' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="status-badge" [attr.data-status]="selectedPayment()!.status">{{ selectedPayment()!.status }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Date</span>
                <span class="detail-value">{{ selectedPayment()!.createdAt | date:'dd MMM yyyy, h:mm:ss a' }}</span>
              </div>
            </div>

            <h3 class="section-title">Shipping Address</h3>
            <p class="address-text">
              {{ selectedPayment()!.shippingAddress.name }} · {{ selectedPayment()!.shippingAddress.phone }}<br/>
              {{ selectedPayment()!.shippingAddress.street }}, {{ selectedPayment()!.shippingAddress.city }} {{ selectedPayment()!.shippingAddress.pincode }}, {{ selectedPayment()!.shippingAddress.state }}
            </p>

            <h3 class="section-title">Items</h3>
            <div class="items-list">
              @for (item of selectedPayment()!.checkoutSnapshot.items; track item.productId) {
                <div class="item-row">
                  <span>{{ item.name }}</span>
                  <span>x{{ item.qty }}</span>
                  <span>₹{{ item.totalPrice | number:'1.2-2' }}</span>
                </div>
              }
              <div class="item-row total-row">
                <span>Total</span>
                <span></span>
                <span>₹{{ selectedPayment()!.checkoutSnapshot.total | number:'1.2-2' }}</span>
              </div>
            </div>

            @if (selectedPayment()!.refunds.length > 0) {
              <h3 class="section-title">Refunds</h3>
              @for (r of selectedPayment()!.refunds; track r.razorpayRefundId) {
                <div class="refund-row">
                  <span>₹{{ r.amount / 100 | number:'1.2-2' }}</span>
                  <span>{{ r.reason }}</span>
                  <span>{{ r.createdAt | date:'dd MMM yyyy' }}</span>
                </div>
              }
            }
          </div>
        </div>
      }

      <!-- Refund Modal -->
      @if (refundTarget()) {
        <div class="modal-backdrop" (click)="refundTarget.set(null)"></div>
        <div class="modal refund-modal">
          <div class="modal-header">
            <h2>Initiate Refund</h2>
            <button class="close-btn" (click)="refundTarget.set(null)">✕</button>
          </div>
          <div class="modal-body">
            <p class="refund-info">
              Order: <strong>{{ refundTarget()!.razorpayOrderId }}</strong><br/>
              Paid: ₹{{ refundTarget()!.amountPaise / 100 | number:'1.2-2' }}
              @if (refundTarget()!.refundedAmount > 0) {
                · Already refunded: ₹{{ refundTarget()!.refundedAmount / 100 | number:'1.2-2' }}
              }
            </p>
            <div class="form-group">
              <label>Refund Amount (₹) *</label>
              <input type="number" [(ngModel)]="refundAmount" [max]="(refundTarget()!.amountPaise - refundTarget()!.refundedAmount) / 100" min="1" />
            </div>
            <div class="form-group">
              <label>Reason *</label>
              <input type="text" [(ngModel)]="refundReason" placeholder="Customer request, defective product..." />
            </div>
            @if (refundError()) {
              <div class="refund-error">{{ refundError() }}</div>
            }
            <div class="modal-actions">
              <button class="btn-cancel" (click)="refundTarget.set(null)">Cancel</button>
              <button class="btn-refund" [disabled]="!refundAmount || !refundReason || refundProcessing()" (click)="submitRefund()">
                @if (refundProcessing()) { Processing... } @else { Confirm Refund }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .payment-page { padding: $space-xl; }
    .page-header { margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0 0 $space-xxs; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }

    .stats-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: $space-md;
      margin-bottom: $space-xl;
    }
    .stat-card {
      display: flex; align-items: center; gap: $space-md;
      padding: $space-lg; background: $color-bg-tertiary; border: 1px solid $color-border-light;
      border-radius: $radius-xl; transition: all $transition-fast;
      &:hover { border-color: $color-border; box-shadow: $shadow-md; }
    }
    .stat-icon {
      width: 44px; height: 44px; border-radius: $radius-lg;
      display: flex; align-items: center; justify-content: center;
      .revenue & { background: rgba(87, 136, 108, 0.1); color: $color-success; }
      .today & { background: rgba(204, 88, 3, 0.08); color: $color-primary; }
      .orders & { background: rgba(162, 126, 142, 0.1); color: $color-accent; }
      .refund & { background: rgba(192, 57, 43, 0.08); color: $color-error; }
    }
    .stat-info { display: flex; flex-direction: column; gap: 2px; }
    .stat-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; }

    .filters-bar {
      display: flex; gap: $space-md; margin-bottom: $space-lg;
    }
    .search-input {
      flex: 1; padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; background: $color-bg-secondary; outline: none; font-family: $font-family;
      &:focus { border-color: $color-primary; box-shadow: $shadow-glow; background: $color-bg-tertiary; }
    }
    .status-filter {
      padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      font-size: $font-size-sm; background: $color-bg-secondary; outline: none; font-family: $font-family; cursor: pointer;
      &:focus { border-color: $color-primary; }
    }

    .loading { display: flex; justify-content: center; padding: $space-xxl; }
    .spinner { width: 28px; height: 28px; border: 2px solid $color-border; border-top-color: $color-primary; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-state { text-align: center; color: $color-text-tertiary; padding: $space-xxl; }

    .table-wrap { overflow-x: auto; border: 1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table {
      width: 100%; border-collapse: collapse;
      th { padding: $space-sm $space-md; text-align: left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform: uppercase; letter-spacing: 0.05em; background: $color-bg-secondary; border-bottom: 1px solid $color-border-light; }
      td { padding: $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom: 1px solid $color-border-light; }
      tr:last-child td { border-bottom: none; }
      tr:hover td { background: $color-bg-secondary; }
    }
    .mono { font-family: monospace; font-size: $font-size-xs; color: $color-text-secondary; }
    .date-cell { white-space: nowrap; font-size: $font-size-xs; color: $color-text-secondary; }
    .customer-cell { display: flex; flex-direction: column; gap: 2px; }
    .customer-name { font-weight: $font-weight-medium; }
    .customer-phone { font-size: $font-size-xs; color: $color-text-tertiary; }
    .amount-cell { font-weight: $font-weight-bold; color: $color-primary; white-space: nowrap; }

    .status-badge {
      display: inline-block; padding: 2px $space-xs; border-radius: $radius-full; font-size: 10px; font-weight: $font-weight-bold; text-transform: uppercase; letter-spacing: 0.04em;
      &[data-status="captured"] { background: rgba(87, 136, 108, 0.12); color: $color-success; }
      &[data-status="created"] { background: rgba(204, 88, 3, 0.1); color: $color-primary; }
      &[data-status="failed"] { background: rgba(192, 57, 43, 0.1); color: $color-error; }
      &[data-status="refunded"], &[data-status="partially_refunded"] { background: rgba(162, 126, 142, 0.12); color: $color-accent; }
    }

    .action-btns { display: flex; gap: $space-xs; }
    .btn-action {
      width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
      border-radius: $radius-md; border: 1px solid $color-border-light; background: transparent;
      color: $color-text-tertiary; cursor: pointer; text-decoration: none; transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; color: $color-primary; border-color: $color-primary; }
      &.refund-btn:hover { color: $color-error; border-color: $color-error; }
    }

    .pagination {
      display: flex; align-items: center; justify-content: center; gap: $space-md;
      padding: $space-lg 0;
    }
    .page-btn {
      padding: $space-xs $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      background: transparent; font-size: $font-size-sm; cursor: pointer; transition: all $transition-fast;
      &:hover:not(:disabled) { border-color: $color-primary; color: $color-primary; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .page-info { font-size: $font-size-sm; color: $color-text-tertiary; }

    // ── Modals ────────────────────────────────────────────────────────────────
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(58, 45, 50, 0.4); backdrop-filter: blur(4px);
      z-index: $z-modal-backdrop;
    }
    .modal {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 600px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
      background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl;
      z-index: $z-modal;
    }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: $space-lg $space-xl; border-bottom: 1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin: 0; }
    }
    .close-btn {
      width: 32px; height: 32px; border-radius: $radius-md; border: 1px solid $color-border-light;
      background: transparent; cursor: pointer; font-size: $font-size-md; color: $color-text-tertiary;
      display: flex; align-items: center; justify-content: center; transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; color: $color-text-primary; }
    }
    .modal-body { padding: $space-xl; }

    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: $space-md; margin-bottom: $space-lg; }
    .detail-item { display: flex; flex-direction: column; gap: $space-xxs; }
    .detail-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform: uppercase; letter-spacing: 0.05em; }
    .detail-value { font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-primary; }

    .section-title { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-secondary; margin: $space-lg 0 $space-sm; text-transform: uppercase; letter-spacing: 0.05em; }
    .address-text { font-size: $font-size-sm; color: $color-text-primary; line-height: $line-height-relaxed; margin: 0; }

    .items-list { border: 1px solid $color-border-light; border-radius: $radius-lg; overflow: hidden; }
    .item-row {
      display: grid; grid-template-columns: 1fr auto auto; gap: $space-md; padding: $space-sm $space-md;
      font-size: $font-size-sm; border-bottom: 1px solid $color-border-light;
      &:last-child { border-bottom: none; }
      &.total-row { background: $color-bg-secondary; font-weight: $font-weight-bold; }
    }
    .refund-row {
      display: grid; grid-template-columns: auto 1fr auto; gap: $space-md; padding: $space-xs 0;
      font-size: $font-size-sm; color: $color-error;
    }

    .refund-modal { width: 450px; }
    .refund-info { font-size: $font-size-sm; color: $color-text-secondary; margin: 0 0 $space-lg; line-height: $line-height-relaxed; }
    .form-group {
      display: flex; flex-direction: column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-secondary; text-transform: uppercase; }
      input {
        padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
        font-size: $font-size-sm; background: $color-bg-secondary; outline: none; font-family: $font-family;
        &:focus { border-color: $color-primary; box-shadow: $shadow-glow; }
      }
    }
    .refund-error {
      padding: $space-sm $space-md; background: rgba(192, 57, 43, 0.08); color: $color-error;
      border: 1px solid rgba(192, 57, 43, 0.2); border-radius: $radius-md;
      font-size: $font-size-sm; margin-bottom: $space-md;
    }
    .modal-actions { display: flex; justify-content: flex-end; gap: $space-md; margin-top: $space-lg; }
    .btn-cancel {
      padding: $space-sm $space-lg; border: 1px solid $color-border; border-radius: $radius-md;
      background: transparent; font-size: $font-size-sm; cursor: pointer; transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; }
    }
    .btn-refund {
      padding: $space-sm $space-lg; background: $color-error; color: $color-text-inverse;
      border: none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold;
      cursor: pointer; transition: all $transition-fast;
      &:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  `],
})
export class AdminPaymentListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly payments = signal<PaymentItem[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly loading = signal(false);
  readonly meta = signal<{ page: number; totalPages: number } | null>(null);
  readonly selectedPayment = signal<PaymentItem | null>(null);
  readonly refundTarget = signal<PaymentItem | null>(null);
  readonly refundProcessing = signal(false);
  readonly refundError = signal<string | null>(null);

  searchQuery = '';
  statusFilter = '';
  refundAmount: number | null = null;
  refundReason = '';
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadStats();
    this.loadPayments();
  }

  loadStats(): void {
    this.http.get<{ data: Stats }>(`${this.api}/admin/payments/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadPayments(page = 1): void {
    this.loading.set(true);
    let url = `${this.api}/admin/payments?page=${page}&limit=15`;
    if (this.statusFilter) url += `&status=${this.statusFilter}`;
    if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;

    this.http.get<{ data: PaymentItem[]; meta: { page: number; totalPages: number } }>(url).subscribe({
      next: (res) => {
        this.payments.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadPayments(), 400);
  }

  openDetail(p: PaymentItem): void { this.selectedPayment.set(p); }
  openRefund(p: PaymentItem): void {
    this.refundTarget.set(p);
    this.refundAmount = null;
    this.refundReason = '';
    this.refundError.set(null);
  }

  submitRefund(): void {
    if (!this.refundTarget() || !this.refundAmount || !this.refundReason) return;
    this.refundProcessing.set(true);
    this.refundError.set(null);

    this.http.post(`${this.api}/payments/${this.refundTarget()!._id}/refund`, {
      amount: this.refundAmount,
      reason: this.refundReason,
    }).subscribe({
      next: () => {
        this.refundProcessing.set(false);
        this.refundTarget.set(null);
        this.refundError.set(null);
        this.loadPayments();
        this.loadStats();
      },
      error: (err) => {
        this.refundProcessing.set(false);
        this.refundError.set(err.error?.message || 'Refund failed');
      },
    });
  }
}
