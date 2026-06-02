import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrderStore } from '../../../core/services/order.store';
import { OrderView } from '../../../core/services/order.store';
import { CatalogService } from '../../../core/services/catalog.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-order-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-history-page.html',
  styleUrls: ['./order-history-page.scss'],
})
export class OrderHistoryPageComponent implements OnInit {
  readonly store = inject(OrderStore);
  readonly catalog = inject(CatalogService);
  private readonly http = inject(HttpClient);
  readonly selectedOrderForTracking = signal<OrderView | null>(null);
  readonly trackingLoading = signal(false);
  readonly trackingError = signal('');

  ngOnInit(): void {
    this.store.loadOrders();
  }

  openTracking(order: OrderView): void {
    this.selectedOrderForTracking.set(order);
    this.trackingError.set('');
    this.fetchLiveTracking(order);
  }

  private fetchLiveTracking(order: OrderView): void {
    if (!order.shiprocket.shipmentId) {
      this.trackingError.set('Shipment not created yet');
      return;
    }

    this.trackingLoading.set(true);
    const trackingUrl = `${environment.apiUrl}/shipments/track/${order.shiprocket.shipmentId}?orderId=${order.orderNumber}`;
    this.http
      .get<any>(trackingUrl)
      .subscribe({
        next: (response) => {
          if (response.success && response.data && response.data.length > 0) {
            const trackingData = response.data[0]?.tracking_data;
            const shipmentTrack = trackingData?.shipment_track?.[0];

            // Update the selected order with live tracking data
            const updatedOrder = { ...order };

            // Extract and merge Shiprocket live data
            if (shipmentTrack) {
              updatedOrder.shiprocket = {
                ...updatedOrder.shiprocket,
                status: shipmentTrack.current_status,
                courierName: shipmentTrack.courier_name,
                awbCode: shipmentTrack.awb_code,
                trackingUrl: trackingData.track_url,
                estimatedDelivery: trackingData.etd,
              } as any;

              // Add tracking activities if available
              if (trackingData?.shipment_track_activities && trackingData.shipment_track_activities.length > 0) {
                (updatedOrder.shiprocket as any).trackingActivities = trackingData.shipment_track_activities.map((activity: any) => ({
                  date: activity.date,
                  status: activity.status || activity.activity,
                  location: activity.location,
                }));
              }
            }

            this.selectedOrderForTracking.set(updatedOrder);
          }
          this.trackingLoading.set(false);
        },
        error: (error) => {
          this.trackingError.set('Failed to fetch tracking information');
          this.trackingLoading.set(false);
          console.error('Tracking fetch error:', error);
        },
      });
  }

  closeTracking(): void {
    this.selectedOrderForTracking.set(null);
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
