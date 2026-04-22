import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderStore } from '../../../core/services/order.store';

export interface OrderDetailView {
  _id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  items: any[];
  shippingAddress: any;
  shiprocket: {
    orderId: number | null;
    shipmentId: number | null;
    awbCode: string | null;
    courierName: string | null;
    trackingUrl: string | null;
    estimatedDelivery: string | null;
    pickupScheduledDate: string | null;
  };
  statusHistory: Array<{
    status: string;
    timestamp: string;
    note: string | null;
  }>;
}

export interface TrackingUpdate {
  date: string;
  status: string;
  location: string;
}

@Component({
  selector: 'app-order-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-detail-page.html',
  styleUrls: ['./order-detail-page.scss'],
})
export class OrderDetailPageComponent implements OnInit {
  readonly store = inject(OrderStore);
  private readonly route = inject(ActivatedRoute);

  readonly order = signal<OrderDetailView | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly trackingLoading = signal(false);
  readonly trackingUpdates = signal<TrackingUpdate[]>([]);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const orderId = params.get('id');
      if (orderId) {
        this.loadOrderDetail(orderId);
      }
    });
  }

  private loadOrderDetail(orderId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.store.loadOrderDetail(orderId).subscribe({
      next: (order) => {
        this.order.set(order as OrderDetailView);
        this.loading.set(false);
        // Load tracking data if shipment exists
        if (order.shiprocket?.shipmentId) {
          this.loadTracking(orderId);
        }
      },
      error: (err) => {
        this.error.set('Failed to load order details');
        this.loading.set(false);
      },
    });
  }

  private loadTracking(orderId: string): void {
    this.trackingLoading.set(true);
    this.store.loadOrderTracking(orderId).subscribe({
      next: (tracking) => {
        if (tracking.tracking?.activities) {
          this.trackingUpdates.set(tracking.tracking.activities);
        }
        this.trackingLoading.set(false);
      },
      error: () => {
        this.trackingLoading.set(false);
      },
    });
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  getStatusColor(status: string): string {
    const statusColors: Record<string, string> = {
      confirmed: '#FFA500',
      processing: '#1E90FF',
      shipped: '#4169E1',
      in_transit: '#32CD32',
      out_for_delivery: '#FFD700',
      delivered: '#228B22',
      cancelled: '#DC143C',
      return_requested: '#FF6347',
      returned: '#8B0000',
    };
    return statusColors[status] || '#999';
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      confirmed: '✓',
      processing: '⚙',
      shipped: '📦',
      in_transit: '🚚',
      out_for_delivery: '🏠',
      delivered: '✓✓',
      cancelled: '✕',
      return_requested: '↩',
      returned: '↩✓',
    };
    return icons[status] || '•';
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  }

  formatDateOnly(dateString: string | null): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  }

  getDaysRemaining(estimatedDelivery: string | null): string {
    if (!estimatedDelivery) return 'TBD';
    try {
      const delivery = new Date(estimatedDelivery);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      delivery.setHours(0, 0, 0, 0);
      const diffTime = delivery.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
      if (diffDays < 0) return 'Delivered';
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      return `${diffDays} days`;
    } catch {
      return 'TBD';
    }
  }

  getDeliveryStatus(): string {
    const order = this.order();
    if (!order) return 'Loading...';
    if (order.status === 'delivered') return '✓ Delivered';
    if (order.status === 'cancelled') return '✕ Cancelled';
    if (order.status === 'out_for_delivery') return '🚚 Out for Delivery';
    if (order.status === 'in_transit') return '📦 In Transit';
    if (order.status === 'shipped') return '📤 Shipped';
    if (order.status === 'processing') return '⚙️ Processing';
    return 'Pending';
  }

  openExternalTracking(): void {
    const order = this.order();
    if (order?.shiprocket?.trackingUrl) {
      window.open(order.shiprocket.trackingUrl, '_blank');
    }
  }
}
