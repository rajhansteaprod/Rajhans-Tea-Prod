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
  readonly shipmentTarget = signal<OrderItem | null>(null);
  readonly shiprocketLoading = signal(false);
  readonly shiprocketSuccess = signal('');
  readonly shiprocketError = signal('');

  searchQuery = '';
  statusFilter = '';
  newStatus = '';
  statusNote = '';
  cancelReason = '';
  shipmentMethod = 'standard';
  trackingNumber = '';
  courierName = '';
  estimatedDelivery = '';
  notifyCustomer = true;
  pickupLocationId = '';
  courierId: number | undefined;
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

  openShipment(o: OrderItem): void {
    this.shipmentTarget.set(o);
    this.shipmentMethod = 'standard';
    this.trackingNumber = '';
    this.courierName = '';
    this.estimatedDelivery = this.getTomorrowDate();
    this.notifyCustomer = true;
    this.pickupLocationId = '';
    this.shiprocketSuccess.set('');
    this.shiprocketError.set('');
  }

  createShiprocketShipment(): void {
    const order = this.shipmentTarget();
    if (!order || !this.pickupLocationId) {
      this.shiprocketError.set('Please select a pickup location');
      return;
    }

    this.shiprocketLoading.set(true);
    this.shiprocketError.set('');
    this.http.post<any>(`${this.api}/admin/shipments/create`, {
      orderId: order._id,
      pickupLocationId: this.pickupLocationId,
      courierId: this.courierId,
    }).subscribe({
      next: (res) => {
        this.shiprocketSuccess.set('Shipment created successfully! AWB: ' + res.data.awbCode);
        this.shiprocketLoading.set(false);
        setTimeout(() => {
          this.shipmentTarget.set(null);
          this.loadOrders();
        }, 1500);
      },
      error: (err) => {
        this.shiprocketError.set(err.error?.message || 'Failed to create shipment');
        this.shiprocketLoading.set(false);
      },
    });
  }

  trackShiprocket(): void {
    const order = this.shipmentTarget();
    if (!order) return;

    this.shiprocketLoading.set(true);
    this.shiprocketError.set('');
    this.http.get<any>(`${this.api}/admin/shipments/${order._id}/track`).subscribe({
      next: (res) => {
        this.shiprocketSuccess.set(`Status: ${res.data.status}\nDelivery: ${res.data.estimatedDelivery || 'N/A'}`);
        this.shiprocketLoading.set(false);
        setTimeout(() => this.shiprocketSuccess.set(''), 3000);
      },
      error: (err) => {
        this.shiprocketError.set(err.error?.message || 'Failed to track shipment');
        this.shiprocketLoading.set(false);
      },
    });
  }

  downloadLabel(): void {
    const order = this.shipmentTarget();
    if (!order) return;

    this.shiprocketLoading.set(true);
    this.http.get<any>(`${this.api}/admin/shipments/${order._id}/label`).subscribe({
      next: (res) => {
        if (res.data.labelUrl) window.open(res.data.labelUrl, '_blank');
        this.shiprocketSuccess.set('Label downloaded successfully');
        this.shiprocketLoading.set(false);
        setTimeout(() => this.shiprocketSuccess.set(''), 2000);
      },
      error: (err) => {
        this.shiprocketError.set(err.error?.message || 'Failed to download label');
        this.shiprocketLoading.set(false);
      },
    });
  }

  schedulePickup(): void {
    const order = this.shipmentTarget();
    if (!order) return;

    this.shiprocketLoading.set(true);
    this.http.post<any>(`${this.api}/admin/shipments/${order._id}/pickup`, {}).subscribe({
      next: (res) => {
        this.shiprocketSuccess.set('Pickup scheduled for: ' + res.data.pickupScheduledDate);
        this.shiprocketLoading.set(false);
        setTimeout(() => this.shiprocketSuccess.set(''), 3000);
      },
      error: (err) => {
        this.shiprocketError.set(err.error?.message || 'Failed to schedule pickup');
        this.shiprocketLoading.set(false);
      },
    });
  }

  cancelShiprocket(): void {
    const order = this.shipmentTarget();
    if (!order) return;

    if (!confirm('Are you sure you want to cancel this shipment?')) return;

    this.shiprocketLoading.set(true);
    this.http.post<any>(`${this.api}/admin/shipments/${order._id}/cancel`, {}).subscribe({
      next: () => {
        this.shiprocketSuccess.set('Shipment cancelled successfully');
        this.shiprocketLoading.set(false);
        setTimeout(() => {
          this.shipmentTarget.set(null);
          this.loadOrders();
        }, 1500);
      },
      error: (err) => {
        this.shiprocketError.set(err.error?.message || 'Failed to cancel shipment');
        this.shiprocketLoading.set(false);
      },
    });
  }

  processShipment(): void {
    if (!this.shipmentTarget() || !this.trackingNumber || !this.courierName) {
      alert('Please fill in all required fields');
      return;
    }

    const payload = {
      method: this.shipmentMethod,
      trackingNumber: this.trackingNumber,
      courierName: this.courierName,
      estimatedDelivery: this.estimatedDelivery,
      notifyCustomer: this.notifyCustomer,
    };

    this.http.post(`${this.api}/admin/orders/${this.shipmentTarget()!._id}/ship`, payload).subscribe({
      next: () => {
        this.shipmentTarget.set(null);
        this.loadOrders();
        this.loadStats();
      },
      error: (err) => alert(err.error?.message || 'Shipment processing failed'),
    });
  }

  private getTomorrowDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  openCancel(o: OrderItem): void { this.cancelTarget.set(o); this.cancelReason = ''; }

  confirmCancel(): void {
    if (!this.cancelTarget() || !this.cancelReason) return;
    this.http.post(`${this.api}/admin/orders/${this.cancelTarget()!._id}/cancel`, { reason: this.cancelReason }).subscribe({
      next: () => { this.cancelTarget.set(null); this.loadOrders(); this.loadStats(); },
    });
  }
}
