import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderStore } from '../../../core/services/order.store';
import { OrderView } from '../../../core/services/order.store';

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-history-page.html',
  styleUrls: ['./order-history-page.scss'],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(OrderStore);
  readonly expandedOrderId = signal<string | null>(null);
  readonly selectedOrderForTracking = signal<OrderView | null>(null);
  readonly trackingLoading = signal(false);
  readonly trackingError = signal('');

  ngOnInit(): void {
    this.store.loadOrders();
  }

  toggleExpand(orderId: string): void {
    if (this.expandedOrderId() === orderId) {
      this.expandedOrderId.set(null);
    } else {
      this.expandedOrderId.set(orderId);
    }
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
