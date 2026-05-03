import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';

interface TrackingEvent {
  event: string;
  location: string;
  timestamp: string;
  status: string;
}

interface Order {
  _id: string;
  orderNumber: string;
  total: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  status: string;
  shipping_status: string;
  tracking_id: string;
  courier: string;
  created_at: string;
  timeline: TrackingEvent[];
}

@Component({
  selector: 'app-track-order-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-order-page.html',
  styleUrls: ['./track-order-page.scss'],
})
export class TrackOrderPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  // Form inputs
  searchBy = signal<'orderId' | 'email'>('orderId');
  orderId = signal('');
  email = signal('');

  // Results
  order = signal<Order | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  searched = signal(false);

  ngOnInit() {
    this.titleService.setTitle('Track Order — Rajhans Tea');
    this.meta.updateTag({
      name: 'description',
      content: 'Track your Rajhans Tea order in real-time with live updates.',
    });
  }

  trackOrder() {
    if (!this.orderId() && !this.email()) {
      this.error.set('Please enter Order ID or Email');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.order.set(null);

    let url = `${environment.apiUrl}/tracking`;

    if (this.searchBy() === 'orderId') {
      url += `?orderId=${this.orderId()}`;
    } else {
      url += `?email=${this.email()}`;
    }

    this.http.get<{ data: Order }>(url).subscribe({
      next: (res) => {
        this.order.set(res.data);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Order not found. Please check your details.');
        this.searched.set(true);
        this.loading.set(false);
      },
    });
  }

  switchSearchMethod() {
    this.orderId.set('');
    this.email.set('');
    this.error.set(null);
    this.order.set(null);
    this.searched.set(false);
  }

  getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return '#10b981';
      case 'in_transit':
        return '#f59e0b';
      case 'out_for_delivery':
        return '#3b82f6';
      case 'pending':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }

  getStatusLabel(status: string) {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return '✓ Delivered';
      case 'in_transit':
        return '🚚 In Transit';
      case 'out_for_delivery':
        return '📍 Out for Delivery';
      case 'pending':
        return '⏳ Pending';
      default:
        return status;
    }
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
