import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface ShipmentOrder {
  _id: string;
  orderNumber: string;
  userId: { phone: string; firstName?: string; lastName?: string } | null;
  items: { name: string; qty: number; totalPrice: number }[];
  total: number;
  status: string;
  shippingAddress: { name: string; phone: string; city: string; state: string; pincode: string };
  paymentType: string;
  createdAt: string;
  shiprocket?: {
    shipmentId: number | null;
    awbCode: string | null;
  };
}

interface ShipmentMeta {
  page: number;
  totalPages: number;
  total: number;
}

@Component({
  selector: 'app-ready-to-ship',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ready-to-ship.html',
  styleUrls: ['./ready-to-ship.scss'],
})
export class ReadyToShipComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly orders = signal<ShipmentOrder[]>([]);
  readonly meta = signal<ShipmentMeta | null>(null);
  readonly loading = signal(false);
  readonly selectedOrders = signal<Set<string>>(new Set());
  readonly shipmentLoading = signal(false);
  readonly shipmentError = signal('');
  readonly shipmentSuccess = signal('');
  readonly showShipmentModal = signal(false);
  readonly pickupLocationId = signal('');
  readonly courierId = signal<number | undefined>(undefined);

  searchQuery = '';
  currentPage = 1;

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(page = 1): void {
    this.loading.set(true);
    this.currentPage = page;
    let url = `${this.api}/admin/orders?status=confirmed&page=${page}&limit=15`;
    if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;

    this.http.get<{ data: ShipmentOrder[]; meta: ShipmentMeta }>(url).subscribe({
      next: (res) => {
        this.orders.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load orders:', err);
        this.loading.set(false);
      },
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadOrders();
  }

  toggleOrderSelection(orderId: string): void {
    this.selectedOrders.update((selected) => {
      const newSet = new Set(selected);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  }

  toggleSelectAll(): void {
    const currentSelected = this.selectedOrders().size;
    const totalOrders = this.orders().length;

    if (currentSelected === totalOrders && totalOrders > 0) {
      this.selectedOrders.set(new Set());
    } else {
      const allIds = new Set(this.orders().map((o) => o._id));
      this.selectedOrders.set(allIds);
    }
  }

  isOrderSelected(orderId: string): boolean {
    return this.selectedOrders().has(orderId);
  }

  isAllSelected(): boolean {
    const orders = this.orders();
    return orders.length > 0 && this.selectedOrders().size === orders.length;
  }

  getSelectedCount(): number {
    return this.selectedOrders().size;
  }

  clearSelection(): void {
    this.selectedOrders.set(new Set());
  }

  openShipmentModal(): void {
    if (this.getSelectedCount() === 0) {
      this.shipmentError.set('Please select at least one order');
      return;
    }
    this.shipmentError.set('');
    this.shipmentSuccess.set('');
    this.pickupLocationId.set('');
    this.courierId.set(undefined);
    this.showShipmentModal.set(true);
  }

  closeShipmentModal(): void {
    this.showShipmentModal.set(false);
    this.pickupLocationId.set('');
    this.courierId.set(undefined);
    this.shipmentError.set('');
    this.shipmentSuccess.set('');
  }

  shipSelectedOrders(): void {
    if (!this.pickupLocationId()) {
      this.shipmentError.set('Please select a pickup location');
      return;
    }

    const selectedIds = Array.from(this.selectedOrders());
    if (selectedIds.length === 0) {
      this.shipmentError.set('No orders selected');
      return;
    }

    this.shipmentLoading.set(true);
    this.shipmentError.set('');

    this.http
      .post<any>(`${this.api}/admin/shipments/bulk`, {
        orderIds: selectedIds,
        pickupLocationId: this.pickupLocationId(),
        courierId: this.courierId() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.shipmentSuccess.set(
            `Successfully created ${res.data.successCount} shipment(s). ${
              res.data.failedCount > 0 ? `${res.data.failedCount} failed.` : ''
            }`
          );
          this.shipmentLoading.set(false);
          this.selectedOrders.set(new Set());
          setTimeout(() => {
            this.closeShipmentModal();
            this.loadOrders(this.currentPage);
          }, 1500);
        },
        error: (err) => {
          this.shipmentError.set(err.error?.message || 'Failed to create shipments');
          this.shipmentLoading.set(false);
        },
      });
  }
}
