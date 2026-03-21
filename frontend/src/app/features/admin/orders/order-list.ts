import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface OrderItem {
  _id: string;
  orderNumber: string;
  userId: { phone: string; firstName?: string; lastName?: string } | null;
  items: { name: string; qty: number; totalPrice: number }[];
  total: number;
  status: string;
  statusHistory: { status: string; timestamp: string; note: string | null }[];
  shippingAddress: { name: string; phone: string; city: string; state: string };
  shiprocket: { awbCode: string | null; courierName: string | null; trackingUrl: string | null };
  createdAt: string;
}

interface OrderStats {
  total: number;
  confirmed: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

@Component({
  selector: 'app-admin-order-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Orders</h1>
          <p class="page-subtitle">Manage orders and fulfillment</p>
        </div>
      </div>

      <!-- Stats -->
      @if (stats()) {
        <div class="stats-grid">
          @for (s of statCards; track s.key) {
            <div class="stat-card" [attr.data-key]="s.key">
              <span class="stat-value">{{ stats()![s.key] }}</span>
              <span class="stat-label">{{ s.label }}</span>
            </div>
          }
        </div>
      }

      <!-- Filters -->
      <div class="filters-bar">
        <input class="search-input" placeholder="Search order #, name, phone..." [(ngModel)]="searchQuery" (ngModelChange)="onSearch()" />
        <select class="status-filter" [(ngModel)]="statusFilter" (ngModelChange)="loadOrders()">
          <option value="">All</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (orders().length === 0) {
        <div class="empty">No orders found.</div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              @for (o of orders(); track o._id) {
                <tr>
                  <td class="mono">{{ o.orderNumber }}</td>
                  <td>
                    <span class="name">{{ o.userId?.firstName || o.shippingAddress.name }}</span><br/>
                    <span class="phone">{{ o.userId?.phone || o.shippingAddress.phone }}</span>
                  </td>
                  <td>{{ o.items.length }} items</td>
                  <td class="amount">₹{{ o.total | number:'1.0-0' }}</td>
                  <td><span class="badge" [attr.data-status]="o.status">{{ o.status }}</span></td>
                  <td class="date">{{ o.createdAt | date:'dd MMM, h:mm a' }}</td>
                  <td>
                    <div class="actions">
                      <button class="btn-sm" (click)="selectedOrder.set(o)" title="Details">👁</button>
                      @if (o.status === 'confirmed') {
                        <button class="btn-sm ship" (click)="shipOrder(o._id)" title="Ship">🚚</button>
                      }
                      @if (o.status === 'confirmed' || o.status === 'processing') {
                        <button class="btn-sm cancel" (click)="openCancel(o)" title="Cancel">✕</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (meta()) {
          <div class="pagination">
            <button [disabled]="meta()!.page <= 1" (click)="loadOrders(meta()!.page - 1)">← Prev</button>
            <span>Page {{ meta()!.page }} of {{ meta()!.totalPages }}</span>
            <button [disabled]="meta()!.page >= meta()!.totalPages" (click)="loadOrders(meta()!.page + 1)">Next →</button>
          </div>
        }
      }

      <!-- Detail Modal -->
      @if (selectedOrder()) {
        <div class="backdrop" (click)="selectedOrder.set(null)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ selectedOrder()!.orderNumber }}</h2><button (click)="selectedOrder.set(null)">✕</button></div>
          <div class="modal-body">
            <div class="detail-row"><span>Status</span><span class="badge" [attr.data-status]="selectedOrder()!.status">{{ selectedOrder()!.status }}</span></div>
            <div class="detail-row"><span>Total</span><span class="amount">₹{{ selectedOrder()!.total | number:'1.2-2' }}</span></div>
            <div class="detail-row"><span>Customer</span><span>{{ selectedOrder()!.shippingAddress.name }} · {{ selectedOrder()!.shippingAddress.phone }}</span></div>
            <div class="detail-row"><span>Address</span><span>{{ selectedOrder()!.shippingAddress.city }}, {{ selectedOrder()!.shippingAddress.state }}</span></div>
            @if (selectedOrder()!.shiprocket.awbCode) {
              <div class="detail-row"><span>AWB</span><span class="mono">{{ selectedOrder()!.shiprocket.awbCode }}</span></div>
              <div class="detail-row"><span>Courier</span><span>{{ selectedOrder()!.shiprocket.courierName }}</span></div>
            }
            <h3>Items</h3>
            @for (item of selectedOrder()!.items; track item.name) {
              <div class="detail-row"><span>{{ item.name }} x{{ item.qty }}</span><span>₹{{ item.totalPrice | number:'1.2-2' }}</span></div>
            }
            <h3>Status History</h3>
            @for (h of selectedOrder()!.statusHistory; track h.timestamp) {
              <div class="history-row">
                <span class="badge small" [attr.data-status]="h.status">{{ h.status }}</span>
                <span class="date">{{ h.timestamp | date:'dd MMM yyyy, h:mm a' }}</span>
                @if (h.note) { <span class="note">{{ h.note }}</span> }
              </div>
            }

            <!-- Status Update -->
            @if (!['delivered','cancelled','returned'].includes(selectedOrder()!.status)) {
              <div class="status-update">
                <select [(ngModel)]="newStatus">
                  <option value="">Update status...</option>
                  @for (s of getNextStatuses(selectedOrder()!.status); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
                <input [(ngModel)]="statusNote" placeholder="Note (optional)" />
                <button class="btn-update" [disabled]="!newStatus" (click)="updateStatus()">Update</button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Cancel Modal -->
      @if (cancelTarget()) {
        <div class="backdrop" (click)="cancelTarget.set(null)"></div>
        <div class="modal small">
          <div class="modal-head"><h2>Cancel Order</h2><button (click)="cancelTarget.set(null)">✕</button></div>
          <div class="modal-body">
            <p>Cancel <strong>{{ cancelTarget()!.orderNumber }}</strong>?</p>
            <input [(ngModel)]="cancelReason" placeholder="Reason for cancellation" />
            <div class="modal-actions">
              <button (click)="cancelTarget.set(null)">Back</button>
              <button class="btn-danger" [disabled]="!cancelReason" (click)="confirmCancel()">Cancel Order</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0 0 $space-xxs; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }
    .page-header { margin-bottom: $space-xl; }

    .stats-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat-card { padding: $space-md $space-lg; background: $color-bg-tertiary; border: 1px solid $color-border-light; border-radius: $radius-lg; text-align: center; }
    .stat-value { display: block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .stat-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform: uppercase; }

    .filters-bar { display: flex; gap: $space-md; margin-bottom: $space-lg; }
    .search-input { flex:1; padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; &:focus { border-color: $color-primary; } }
    .status-filter { padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border: 2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }

    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
      tr:hover td { background: $color-bg-secondary; }
    }
    .mono { font-family:monospace; font-size: $font-size-xs; }
    .name { font-weight: $font-weight-medium; }
    .phone { font-size: $font-size-xs; color: $color-text-tertiary; }
    .amount { font-weight: $font-weight-bold; color: $color-primary; }
    .date { font-size: $font-size-xs; color: $color-text-tertiary; white-space:nowrap; }

    .badge { display:inline-block; padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="confirmed"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="processing"] { background:rgba(162,126,142,.12); color: $color-accent; }
      &[data-status="shipped"],&[data-status="in_transit"],&[data-status="out_for_delivery"] { background:rgba(70,130,180,.1); color:#4682B4; }
      &[data-status="delivered"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="cancelled"],&[data-status="returned"] { background:rgba(192,57,43,.1); color: $color-error; }
      &.small { font-size:9px; }
    }

    .actions { display:flex; gap: $space-xxs; }
    .btn-sm { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; font-size:12px; transition: all $transition-fast;
      &:hover { background: $color-bg-secondary; }
      &.ship:hover { border-color: #4682B4; }
      &.cancel:hover { border-color: $color-error; color: $color-error; }
    }

    .pagination { display:flex; align-items:center; justify-content:center; gap: $space-md; padding: $space-lg;
      button { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; &:disabled { opacity:.4; cursor:not-allowed; } }
      span { font-size: $font-size-sm; color: $color-text-tertiary; }
    }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal;
      &.small { width:400px; }
    }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; font-size: $font-size-md; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl;
      h3 { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; margin: $space-lg 0 $space-sm; }
      input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; margin-bottom: $space-sm; &:focus { border-color: $color-primary; } }
    }
    .detail-row { display:flex; justify-content:space-between; align-items:center; padding: $space-xs 0; font-size: $font-size-sm; border-bottom:1px solid $color-border-light; &:last-child { border-bottom:none; } }
    .history-row { display:flex; align-items:center; gap: $space-sm; padding: $space-xs 0; font-size: $font-size-sm; }
    .note { color: $color-text-tertiary; font-size: $font-size-xs; }

    .status-update { display:flex; gap: $space-sm; margin-top: $space-lg; padding-top: $space-lg; border-top:1px solid $color-border-light;
      select { flex:1; padding: $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; }
      input { flex:1; margin-bottom:0; }
    }
    .btn-update { padding: $space-sm $space-md; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; white-space:nowrap; &:disabled { opacity:.5; cursor:not-allowed; } }

    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-danger { background: $color-error !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; &:disabled { opacity:.5; cursor:not-allowed; } }
  `],
})
export class AdminOrderListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly orders = signal<OrderItem[]>([]);
  readonly stats = signal<OrderStats | null>(null);
  readonly loading = signal(false);
  readonly meta = signal<{ page: number; totalPages: number } | null>(null);
  readonly selectedOrder = signal<OrderItem | null>(null);
  readonly cancelTarget = signal<OrderItem | null>(null);

  searchQuery = '';
  statusFilter = '';
  newStatus = '';
  statusNote = '';
  cancelReason = '';
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  statCards = [
    { key: 'total' as keyof OrderStats, label: 'Total' },
    { key: 'confirmed' as keyof OrderStats, label: 'Confirmed' },
    { key: 'processing' as keyof OrderStats, label: 'Processing' },
    { key: 'shipped' as keyof OrderStats, label: 'Shipped' },
    { key: 'delivered' as keyof OrderStats, label: 'Delivered' },
  ];

  private transitions: Record<string, string[]> = {
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['in_transit'],
    in_transit: ['out_for_delivery'],
    out_for_delivery: ['delivered'],
    delivered: ['return_requested'],
    return_requested: ['returned'],
  };

  ngOnInit(): void {
    this.loadStats();
    this.loadOrders();
  }

  loadStats(): void {
    this.http.get<{ data: OrderStats }>(`${this.api}/admin/orders/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadOrders(page = 1): void {
    this.loading.set(true);
    let url = `${this.api}/admin/orders?page=${page}&limit=15`;
    if (this.statusFilter) url += `&status=${this.statusFilter}`;
    if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;
    this.http.get<{ data: OrderItem[]; meta: any }>(url).subscribe({
      next: (res) => { this.orders.set(res.data); this.meta.set(res.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onSearch(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadOrders(), 400);
  }

  getNextStatuses(current: string): string[] {
    return this.transitions[current] || [];
  }

  updateStatus(): void {
    if (!this.selectedOrder() || !this.newStatus) return;
    this.http.patch(`${this.api}/admin/orders/${this.selectedOrder()!._id}/status`, {
      status: this.newStatus, note: this.statusNote || undefined,
    }).subscribe({
      next: () => { this.selectedOrder.set(null); this.newStatus = ''; this.statusNote = ''; this.loadOrders(); this.loadStats(); },
    });
  }

  shipOrder(orderId: string): void {
    this.http.post(`${this.api}/admin/orders/${orderId}/ship`, {}).subscribe({
      next: () => { this.loadOrders(); this.loadStats(); },
      error: (err) => alert(err.error?.message || 'Ship failed'),
    });
  }

  openCancel(o: OrderItem): void { this.cancelTarget.set(o); this.cancelReason = ''; }

  confirmCancel(): void {
    if (!this.cancelTarget() || !this.cancelReason) return;
    this.http.post(`${this.api}/admin/orders/${this.cancelTarget()!._id}/cancel`, { reason: this.cancelReason }).subscribe({
      next: () => { this.cancelTarget.set(null); this.loadOrders(); this.loadStats(); },
    });
  }
}
