import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { Meta, Title } from '@angular/platform-browser';

interface TrackingActivity {
  date: string;
  status: string;
  location: string;
  remark?: string;
}

interface ShiprocketData {
  awbCode: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  activities: TrackingActivity[];
}

interface StatusHistoryEntry {
  status: string;
  timestamp: string;
  note: string | null;
}

interface TrackingResponse {
  orderNumber: string;
  status: string;
  statusHistory: StatusHistoryEntry[];
  shiprocket?: ShiprocketData;
  currentShiprocketStatus?: string;
}

@Component({
  selector: 'app-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-order.html',
  styleUrls: ['./track-order.scss'],
})
export class TrackOrderComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);

  // Form inputs
  orderNumber = signal('');

  // Results
  tracking = signal<TrackingResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  searched = signal(false);

  ngOnInit() {
    this.titleService.setTitle('Track Order — Rajhans Tea');
    this.meta.updateTag({
      name: 'description',
      content: 'Track your Rajhans Tea order in real-time with live updates from Shiprocket.',
    });

    // Check for order number in query params
    this.route.queryParams.subscribe(params => {
      const orderNumberParam = params['order'];
      if (orderNumberParam) {
        this.orderNumber.set(orderNumberParam);
        this.trackOrder();
      }
    });
  }

  trackOrder() {
    const orderNum = this.orderNumber().trim();

    if (!orderNum) {
      this.error.set('Please enter an Order Number (e.g., RJT_DQ_436916)');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.tracking.set(null);
    this.searched.set(false);

    // Public API endpoint - no authentication required
    const url = `${environment.apiUrl}/track/${orderNum}`;

    this.http.get<{ success: boolean; data: TrackingResponse }>(url).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.tracking.set(res.data);
          this.searched.set(true);
          this.loading.set(false);
        }
      },
      error: (err) => {
        const errorMsg = err.error?.message || `Order "${orderNum}" not found. Please check the order number and try again.`;
        this.error.set(errorMsg);
        this.searched.set(true);
        this.loading.set(false);
      },
    });
  }

  getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return '#10b981';
      case 'in_transit':
        return '#f59e0b';
      case 'pickup_done':
        return '#f59e0b';
      case 'out_for_delivery':
        return '#3b82f6';
      case 'shipped':
      case 'in progress':
        return '#8b5cf6';
      case 'confirmed':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }

  getStatusLabel(status: string) {
    const statusMap: Record<string, string> = {
      'delivered': '✓ Delivered',
      'in_transit': 'In Transit',
      'pickup_done': 'Pickup Done',
      'out_for_delivery': 'Out for Delivery',
      'shipped': 'Shipped',
      'in progress': 'Ready to Ship',
      'confirmed': 'Order Placed',
      'pending': 'Pending',
    };
    return statusMap[status?.toLowerCase()] || status || 'Unknown';
  }

  formatDate(dateString: string) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  }

  openTrackingUrl() {
    const url = this.tracking()?.shiprocket?.trackingUrl;
    if (url) {
      window.open(url, '_blank');
    }
  }

  hasShiprocketData(): boolean {
    return !!(this.tracking()?.shiprocket &&
              (this.tracking()?.shiprocket?.awbCode ||
               this.tracking()?.shiprocket?.courierName));
  }

  getDeliveryEstimate(): string {
    const date = this.tracking()?.shiprocket?.estimatedDelivery;
    if (!date) {
      return 'Not available';
    }
    return this.formatDate(date);
  }

  getVisibleStatusHistory(): StatusHistoryEntry[] {
    return this.tracking()?.statusHistory || [];
  }

  getFullTrackingHistory(): { label: string; timestamp: string }[] {
    // Entries synced from Shiprocket just mirror an activity we already show below -
    // keep only the pre-Shiprocket internal step (e.g. "Ready to Ship") to avoid duplicates.
    const statusEntries = this.getVisibleStatusHistory()
      .filter(entry => !entry.note?.startsWith('Synced from Shiprocket'))
      .map(entry => ({
        label: this.getStatusLabel(entry.status),
        timestamp: entry.timestamp,
      }));

    const activityEntries = (this.tracking()?.shiprocket?.activities || [])
      .filter(activity => activity.status?.toLowerCase() !== 'data received')
      .map(activity => ({
        label: activity.status,
        timestamp: activity.date,
      }));

    return [...statusEntries, ...activityEntries]
      .filter(entry => entry.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'delivered';
      case 'in_transit':
      case 'pickup_done':
      case 'out_for_delivery':
        return 'processing';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'processing';
    }
  }
}
