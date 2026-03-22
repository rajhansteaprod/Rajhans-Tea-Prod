import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface InventoryStats { totalProducts: number; lowStock: number; outOfStock: number; alerts: any[]; }
interface TrackedProduct { _id: string; name: string; slug: string; images: string[]; stock: number; basePrice: number; status: string; }
interface StockMovement { _id: string; productId: { _id: string; name: string; images: string[] }; type: string; qty: number; previousStock: number; newStock: number; note: string | null; performedBy: { firstName?: string; phone: string } | null; createdAt: string; }
interface Alert { _id: string; productId: { _id: string; name: string; stock: number; images: string[] }; type: string; currentStock: number; threshold: number; createdAt: string; }

type Tab = 'stock' | 'movements' | 'alerts';
type ModalType = 'adjust' | 'set' | null;

@Component({
  selector: 'app-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-dashboard.html',
  styleUrls: ['./inventory-dashboard.scss'],
})
export class InventoryDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  readonly Math = Math;

  readonly activeTab = signal<Tab>('stock');
  readonly stats = signal<InventoryStats | null>(null);

  // Stock tab
  readonly products = signal<TrackedProduct[]>([]);
  readonly productsLoading = signal(false);
  searchQuery = '';
  sortBy = 'name';

  // Movements tab
  readonly movements = signal<StockMovement[]>([]);
  readonly movementsLoading = signal(false);
  readonly movementsMeta = signal<{ page: number; totalPages: number } | null>(null);
  movementTypeFilter = '';

  // Alerts tab
  readonly alerts = signal<Alert[]>([]);
  readonly alertsLoading = signal(false);

  // Product history modal
  readonly historyProductId = signal<string | null>(null);
  readonly productMovements = signal<StockMovement[]>([]);

  // Adjust/Set modal
  readonly modalType = signal<ModalType>(null);
  readonly modalProduct = signal<TrackedProduct | null>(null);
  modalQty: number | null = null;
  modalSetValue: number | null = null;
  modalNote = '';

  ngOnInit(): void {
    this.loadStats();
    this.loadProducts();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'stock') this.loadProducts();
    if (tab === 'movements') this.loadMovements();
    if (tab === 'alerts') this.loadAlerts();
  }

  loadStats(): void {
    this.http.get<{ data: InventoryStats }>(`${this.api}/admin/inventory/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadProducts(): void {
    this.productsLoading.set(true);
    let url = `${this.api}/admin/inventory/products?sort=${this.sortBy}`;
    if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;
    this.http.get<{ data: TrackedProduct[] }>(url).subscribe({
      next: (res) => { this.products.set(res.data); this.productsLoading.set(false); },
      error: () => this.productsLoading.set(false),
    });
  }

  loadMovements(page = 1): void {
    this.movementsLoading.set(true);
    let url = `${this.api}/admin/inventory/movements?page=${page}&limit=20`;
    if (this.movementTypeFilter) url += `&type=${this.movementTypeFilter}`;
    this.http.get<{ data: StockMovement[]; meta: any }>(url).subscribe({
      next: (res) => { this.movements.set(res.data); this.movementsMeta.set(res.meta); this.movementsLoading.set(false); },
      error: () => this.movementsLoading.set(false),
    });
  }

  loadAlerts(): void {
    this.alertsLoading.set(true);
    this.http.get<{ data: Alert[]; meta: any }>(`${this.api}/admin/inventory/alerts?limit=50`).subscribe({
      next: (res) => { this.alerts.set(res.data); this.alertsLoading.set(false); },
      error: () => this.alertsLoading.set(false),
    });
  }

  viewHistory(productId: string): void {
    this.historyProductId.set(productId);
    this.http.get<{ data: StockMovement[] }>(`${this.api}/admin/inventory/${productId}/movements?limit=50`).subscribe({
      next: (res) => this.productMovements.set(res.data),
    });
  }

  openModal(type: 'adjust' | 'set', product: TrackedProduct): void {
    this.modalType.set(type);
    this.modalProduct.set(product);
    this.modalQty = null;
    this.modalSetValue = type === 'set' ? product.stock : null;
    this.modalNote = '';
  }

  closeModal(): void {
    this.modalType.set(null);
    this.modalProduct.set(null);
  }

  submitModal(): void {
    if (!this.modalProduct() || !this.modalNote) return;
    const productId = this.modalProduct()!._id;

    if (this.modalType() === 'adjust' && this.modalQty) {
      this.http.post(`${this.api}/admin/inventory/${productId}/adjust`, {
        qty: this.modalQty,
        note: this.modalNote,
      }).subscribe({ next: () => { this.closeModal(); this.refresh(); } });
    }

    if (this.modalType() === 'set' && this.modalSetValue !== null) {
      this.http.post(`${this.api}/admin/inventory/${productId}/set-stock`, {
        stock: this.modalSetValue,
        note: this.modalNote,
      }).subscribe({ next: () => { this.closeModal(); this.refresh(); } });
    }
  }

  resolveAlert(alertId: string): void {
    this.http.post(`${this.api}/admin/inventory/alerts/${alertId}/resolve`, {}).subscribe({
      next: () => { this.loadAlerts(); this.loadStats(); },
    });
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private refresh(): void {
    this.loadStats();
    this.loadProducts();
  }
}
