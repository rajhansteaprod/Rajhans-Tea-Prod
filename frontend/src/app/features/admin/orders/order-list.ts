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
  shippingAddress: { name: string; phone: string; city: string; state: string; pincode: string };
  shiprocket: {
    orderId: number | null;
    shipmentId: number | null;
    awbCode: string | null;
    courierName: string | null;
    trackingUrl: string | null;
    label: string | null;
    estimatedDelivery: string | null;
    pickupScheduledDate: string | null;
  };
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
  templateUrl: './order-list.html',
  styleUrls: ['./order-list.scss'],
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
  readonly shipTarget = signal<OrderItem | null>(null);
  readonly shippingInProgress = signal(false);

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

  openCancel(o: OrderItem): void { this.cancelTarget.set(o); this.cancelReason = ''; }

  confirmCancel(): void {
    if (!this.cancelTarget() || !this.cancelReason) return;
    this.http.post(`${this.api}/admin/orders/${this.cancelTarget()!._id}/cancel`, { reason: this.cancelReason }).subscribe({
      next: () => { this.cancelTarget.set(null); this.loadOrders(); this.loadStats(); },
    });
  }

  openShip(o: OrderItem): void {
    this.shipTarget.set(o);
  }

  confirmShip(): void {
    const order = this.shipTarget();
    if (!order) return;
    this.shippingInProgress.set(true);
    this.http.post(`${this.api}/admin/orders/${order._id}/ship`, {}).subscribe({
      next: () => {
        this.shipTarget.set(null);
        this.shippingInProgress.set(false);
        this.loadOrders();
        this.loadStats();
      },
      error: () => {
        this.shippingInProgress.set(false);
      },
    });
  }

  cancelShip(): void {
    this.shipTarget.set(null);
    this.shippingInProgress.set(false);
  }
}
