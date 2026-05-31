import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OrderItem {
  productId: string;
  variantId?: string;
  name: string;
  image?: string;
  variant?: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  fulfillmentStatus: string;
}

export interface OrderView {
  _id: string;
  orderNumber: string;
  userId: { _id: string; phone: string; firstName?: string; lastName?: string } | null;
  items: OrderItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  shippingCost: number;
  total: number;
  status: string;
  statusHistory: { status: string; timestamp: string; note: string | null }[];
  shippingAddress: { name: string; phone: string; street: string; city: string; state: string; pincode: string };
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

export interface TrackingInfo {
  orderNumber: string;
  status: string;
  statusHistory: { status: string; timestamp: string; note: string | null }[];
  shiprocket: any;
  tracking: {
    currentStatus: string;
    trackingUrl: string | null;
    estimatedDelivery: string | null;
    activities: { date: string; status: string; location: string }[];
  } | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class OrderStore {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly _orders = signal<OrderView[]>([]);
  private readonly _currentOrder = signal<OrderView | null>(null);
  private readonly _tracking = signal<TrackingInfo | null>(null);
  private readonly _loading = signal(false);
  private readonly _meta = signal<{ page: number; totalPages: number } | null>(null);

  readonly orders = this._orders.asReadonly();
  readonly currentOrder = this._currentOrder.asReadonly();
  readonly tracking = this._tracking.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly meta = this._meta.asReadonly();

  loadOrders(page = 1): void {
    this._loading.set(true);
    this.http
      .get<PaginatedResponse<OrderView>>(`${this.api}/orders/user?page=${page}&limit=5`)
      .subscribe({
        next: (res) => {
          this._orders.set(res.data);
          this._meta.set({ page: res.meta.page, totalPages: res.meta.totalPages });
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  loadOrderDetail(orderId: string): Observable<OrderView> {
    this._loading.set(true);
    return new Observable((observer) => {
      this.http
        .get<ApiResponse<OrderView>>(`${this.api}/orders/user/${orderId}`)
        .subscribe({
          next: (res) => {
            this._currentOrder.set(res.data);
            this._loading.set(false);
            observer.next(res.data);
            observer.complete();
          },
          error: (err) => {
            this._loading.set(false);
            observer.error(err);
          },
        });
    });
  }

  loadOrderTracking(orderId: string): Observable<TrackingInfo> {
    return new Observable((observer) => {
      this.http
        .get<ApiResponse<TrackingInfo>>(`${this.api}/orders/user/${orderId}/tracking`)
        .subscribe({
          next: (res) => {
            this._tracking.set(res.data);
            observer.next(res.data);
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
    });
  }

  getShippingRates(pincode: string, weight = 0.5): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(
      `${this.api}/shipping/rates?pincode=${pincode}&weight=${weight}`,
    );
  }
}
