import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderStore } from '../../../core/services/order.store';

type OrderFilter = 'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

interface Order {
  _id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  items: { productId: string; name: string; qty: number; totalPrice: number }[];
  shippingAddress: { city: string; state: string; pincode: string };
  shiprocket: {
    shipmentId: number | null;
    awbCode: string | null;
    courierName: string | null;
    trackingUrl: string | null;
    estimatedDelivery: string | null;
  };
  statusHistory: { status: string; timestamp: string; note: string | null }[];
  total: number;
}

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-history-page.html',
  styleUrls: ['./order-history-page.scss'],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(OrderStore);
  readonly activeFilter = signal<OrderFilter>('all');
  readonly selectedOrderForTracking = signal<Order | null>(null);
  readonly trackingLoading = signal(false);
  readonly trackingError = signal('');

  readonly filters: { key: OrderFilter; label: string }[] = [
    { key: 'all', label: 'All Orders' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  readonly filteredOrders = computed(() => {
    const filter = this.activeFilter();
    const orders = this.store.orders();
    if (filter === 'all') return orders;
    if (filter === 'shipped') {
      return orders.filter(o => ['shipped', 'in_transit', 'out_for_delivery'].includes(o.status));
    }
    return orders.filter(o => o.status === filter);
  });

  ngOnInit(): void {
    this.store.loadOrders();
  }

  setFilter(filter: OrderFilter): void {
    this.activeFilter.set(filter);
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  openTracking(order: any): void {
    this.selectedOrderForTracking.set(order);
    this.trackingError.set('');
  }

  closeTracking(): void {
    this.selectedOrderForTracking.set(null);
  }

  formatDate(date: string | null): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  getDaysRemaining(estimatedDelivery: string | null): string {
    if (!estimatedDelivery) return 'N/A';
    const delivery = new Date(estimatedDelivery);
    const today = new Date();
    const diffTime = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffTime < 0) return 'Delivered';
    if (diffTime === 0) return 'Today';
    if (diffTime === 1) return 'Tomorrow';
    return `${diffTime} days`;
  }
}
