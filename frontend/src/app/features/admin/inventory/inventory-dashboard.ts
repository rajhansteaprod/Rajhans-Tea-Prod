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
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Inventory</h1>
        <p class="page-subtitle">Stock levels, movements, and alerts</p>
      </div>

      <!-- Stats -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-value">{{ stats()!.totalProducts }}</span><span class="stat-label">Tracked</span></div>
          <div class="stat-card warn"><span class="stat-value">{{ stats()!.lowStock }}</span><span class="stat-label">Low Stock</span></div>
          <div class="stat-card danger"><span class="stat-value">{{ stats()!.outOfStock }}</span><span class="stat-label">Out of Stock</span></div>
        </div>
      }

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'stock'" (click)="switchTab('stock')">Stock Overview</button>
        <button class="tab" [class.active]="activeTab() === 'movements'" (click)="switchTab('movements')">Movements</button>
        <button class="tab" [class.active]="activeTab() === 'alerts'" (click)="switchTab('alerts')">
          Alerts
          @if (stats() && stats()!.alerts.length > 0) {
            <span class="tab-badge">{{ stats()!.alerts.length }}</span>
          }
        </button>
      </div>

      <!-- TAB: Stock Overview -->
      @if (activeTab() === 'stock') {
        <div class="toolbar">
          <input class="search" placeholder="Search product..." [(ngModel)]="searchQuery" (ngModelChange)="loadProducts()" />
          <select class="sort-select" [(ngModel)]="sortBy" (ngModelChange)="loadProducts()">
            <option value="name">Sort: Name</option>
            <option value="stock">Sort: Stock (low first)</option>
          </select>
        </div>

        @if (productsLoading()) {
          <div class="loading"><div class="spinner"></div></div>
        } @else if (products().length === 0) {
          <div class="empty">No tracked products. Enable "Track Inventory" on products.</div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                @for (p of products(); track p._id) {
                  <tr>
                    <td>
                      <div class="product-cell">
                        <div class="thumb">
                          @if (p.images[0]) { <img [src]="p.images[0]" /> } @else { <div class="ph"></div> }
                        </div>
                        <span class="pname">{{ p.name }}</span>
                      </div>
                    </td>
                    <td>₹{{ p.basePrice | number:'1.0-0' }}</td>
                    <td>
                      <span class="stock-val" [class.ok]="p.stock > 5" [class.low]="p.stock > 0 && p.stock <= 5" [class.out]="p.stock === 0">
                        {{ p.stock }}
                      </span>
                    </td>
                    <td><span class="badge" [attr.data-status]="p.status">{{ p.status }}</span></td>
                    <td>
                      <div class="actions">
                        <button class="btn-sm add" (click)="openModal('adjust', p)" title="Add/Remove">+/−</button>
                        <button class="btn-sm set" (click)="openModal('set', p)" title="Set Stock">Set</button>
                        <button class="btn-sm" (click)="viewHistory(p._id)" title="History">📋</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      <!-- TAB: Movements -->
      @if (activeTab() === 'movements') {
        <div class="toolbar">
          <select class="sort-select" [(ngModel)]="movementTypeFilter" (ngModelChange)="loadMovements()">
            <option value="">All Types</option>
            <option value="purchase_deduction">Purchase Deduction</option>
            <option value="manual_adjustment">Manual Adjustment</option>
            <option value="return_restock">Return Restock</option>
            <option value="damage_writeoff">Damage Writeoff</option>
          </select>
        </div>

        @if (movementsLoading()) {
          <div class="loading"><div class="spinner"></div></div>
        } @else if (movements().length === 0) {
          <div class="empty">No stock movements yet.</div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Before → After</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                @for (m of movements(); track m._id) {
                  <tr>
                    <td class="date">{{ m.createdAt | date:'dd MMM, h:mm a' }}</td>
                    <td class="pname">{{ m.productId?.name || '—' }}</td>
                    <td><span class="type-badge" [attr.data-type]="m.type">{{ formatType(m.type) }}</span></td>
                    <td [class.positive]="m.qty > 0" [class.negative]="m.qty < 0">{{ m.qty > 0 ? '+' : '' }}{{ m.qty }}</td>
                    <td>{{ m.previousStock }} → {{ m.newStock }}</td>
                    <td>{{ m.performedBy?.firstName || m.performedBy?.phone || 'System' }}</td>
                    <td class="note">{{ m.note || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (movementsMeta()) {
            <div class="pagination">
              <button [disabled]="movementsMeta()!.page <= 1" (click)="loadMovements(movementsMeta()!.page - 1)">←</button>
              <span>{{ movementsMeta()!.page }} / {{ movementsMeta()!.totalPages }}</span>
              <button [disabled]="movementsMeta()!.page >= movementsMeta()!.totalPages" (click)="loadMovements(movementsMeta()!.page + 1)">→</button>
            </div>
          }
        }
      }

      <!-- TAB: Alerts -->
      @if (activeTab() === 'alerts') {
        @if (alertsLoading()) {
          <div class="loading"><div class="spinner"></div></div>
        } @else if (alerts().length === 0) {
          <div class="empty">No unresolved alerts. All good!</div>
        } @else {
          <div class="alert-list">
            @for (a of alerts(); track a._id) {
              <div class="alert-card" [class.out]="a.type === 'out_of_stock'">
                <div class="alert-info">
                  <span class="alert-type">{{ a.type === 'out_of_stock' ? 'OUT OF STOCK' : 'LOW STOCK' }}</span>
                  <span class="alert-product">{{ a.productId?.name }}</span>
                  <span class="alert-stock">Current: {{ a.currentStock }} · Threshold: {{ a.threshold }}</span>
                </div>
                <div class="alert-actions">
                  <button class="btn-sm add" (click)="openModal('adjust', { _id: a.productId._id, name: a.productId.name, slug: '', stock: a.currentStock, images: a.productId.images || [], basePrice: 0, status: '' })">Restock</button>
                  <button class="btn-sm" (click)="resolveAlert(a._id)">Resolve</button>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- Product History Modal -->
      @if (historyProductId()) {
        <div class="backdrop" (click)="historyProductId.set(null)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Stock History</h2><button (click)="historyProductId.set(null)">✕</button></div>
          <div class="modal-body">
            @if (productMovements().length === 0) {
              <p class="empty">No movements for this product.</p>
            } @else {
              @for (m of productMovements(); track m._id) {
                <div class="history-row">
                  <span class="date">{{ m.createdAt | date:'dd MMM, h:mm a' }}</span>
                  <span class="type-badge" [attr.data-type]="m.type">{{ formatType(m.type) }}</span>
                  <span [class.positive]="m.qty > 0" [class.negative]="m.qty < 0">{{ m.qty > 0 ? '+' : '' }}{{ m.qty }}</span>
                  <span>{{ m.previousStock }} → {{ m.newStock }}</span>
                  <span class="note">{{ m.note || '' }}</span>
                </div>
              }
            }
          </div>
        </div>
      }

      <!-- Adjust / Set Stock Modal -->
      @if (modalType() && modalProduct()) {
        <div class="backdrop" (click)="closeModal()"></div>
        <div class="modal small">
          <div class="modal-head">
            <h2>{{ modalType() === 'adjust' ? 'Add / Remove Stock' : 'Set Stock' }}: {{ modalProduct()!.name }}</h2>
            <button (click)="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <p>Current stock: <strong>{{ modalProduct()!.stock }}</strong></p>

            @if (modalType() === 'adjust') {
              <div class="form-field">
                <label>Quantity (+add / −remove)</label>
                <input type="number" [(ngModel)]="modalQty" placeholder="+10 or -5" />
              </div>
            } @else {
              <div class="form-field">
                <label>New Stock Value</label>
                <input type="number" [(ngModel)]="modalSetValue" min="0" placeholder="50" />
              </div>
            }

            <div class="form-field">
              <label>Reason *</label>
              <input type="text" [(ngModel)]="modalNote" placeholder="Restocking, damage, correction..." />
            </div>

            @if (modalType() === 'adjust' && modalQty) {
              <p class="preview">New stock: <strong>{{ Math.max(0, modalProduct()!.stock + modalQty) }}</strong></p>
            }
            @if (modalType() === 'set' && modalSetValue !== null) {
              <p class="preview">Change: <strong>{{ (modalSetValue ?? 0) - modalProduct()!.stock > 0 ? '+' : '' }}{{ (modalSetValue ?? 0) - modalProduct()!.stock }}</strong></p>
            }

            <div class="modal-actions">
              <button (click)="closeModal()">Cancel</button>
              <button class="btn-confirm" [disabled]="!modalNote || (modalType() === 'adjust' && !modalQty) || (modalType() === 'set' && modalSetValue === null)" (click)="submitModal()">
                {{ modalType() === 'adjust' ? 'Apply' : 'Set Stock' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .stats-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.warn { border-color: rgba(204,88,3,.3); }
      &.danger { border-color: rgba(192,57,43,.3); }
    }
    .stat-value { display:block; font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; .warn & { color: $color-warning; } .danger & { color: $color-error; } }
    .stat-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }

    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom: 2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px; transition: all $transition-fast; display:flex; align-items:center; gap: $space-xs;
      &.active { color: $color-primary; border-bottom-color: $color-primary; font-weight: $font-weight-semibold; }
      &:hover { color: $color-text-primary; }
    }
    .tab-badge { background: $color-error; color: $color-text-inverse; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; min-width:18px; height:18px; padding:0 4px; display:inline-flex; align-items:center; justify-content:center; }

    .toolbar { display:flex; gap: $space-md; margin-bottom: $space-lg; }
    .search { flex:1; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; &:focus { border-color: $color-primary; } }
    .sort-select { padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; font-size: $font-size-sm; }

    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
      tr:hover td { background: $color-bg-secondary; }
    }
    .product-cell { display:flex; align-items:center; gap: $space-sm; }
    .thumb { width:36px; height:36px; border-radius: $radius-md; overflow:hidden; background: $color-bg-secondary; flex-shrink:0;
      img { width:100%; height:100%; object-fit:cover; }
    }
    .ph { width:100%; height:100%; background: $color-bg-secondary; }
    .pname { font-weight: $font-weight-medium; }

    .stock-val { font-weight: $font-weight-bold; padding:2px $space-xs; border-radius: $radius-full; font-size: $font-size-sm;
      &.ok { color: $color-success; }
      &.low { color: $color-warning; background: rgba(204,88,3,.08); }
      &.out { color: $color-error; background: rgba(192,57,43,.08); }
    }

    .badge { display:inline-block; padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="active"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="draft"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="archived"] { background:rgba(192,57,43,.1); color: $color-error; }
    }

    .type-badge { display:inline-block; padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-semibold;
      &[data-type="purchase_deduction"] { background:rgba(192,57,43,.08); color: $color-error; }
      &[data-type="manual_adjustment"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-type="return_restock"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-type="damage_writeoff"] { background:rgba(58,45,50,.1); color: $color-text-secondary; }
      &[data-type="initial_stock"] { background:rgba(162,126,142,.12); color: $color-accent; }
    }

    .positive { color: $color-success; font-weight: $font-weight-bold; }
    .negative { color: $color-error; font-weight: $font-weight-bold; }
    .date { font-size: $font-size-xs; color: $color-text-tertiary; white-space:nowrap; }
    .note { font-size: $font-size-xs; color: $color-text-secondary; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .actions { display:flex; gap: $space-xxs; }
    .btn-sm { padding: $space-xxs $space-xs; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; transition: all $transition-fast;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.add:hover { border-color: $color-success; color: $color-success; }
      &.set:hover { border-color: $color-accent; color: $color-accent; }
    }

    .pagination { display:flex; align-items:center; justify-content:center; gap: $space-md; padding: $space-lg;
      button { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; cursor:pointer; &:disabled { opacity:.4; } }
      span { font-size: $font-size-sm; color: $color-text-tertiary; }
    }

    .alert-list { display:flex; flex-direction:column; gap: $space-sm; }
    .alert-card { display:flex; align-items:center; justify-content:space-between; padding: $space-md $space-lg; background: rgba(204,88,3,.04); border:1px solid rgba(204,88,3,.2); border-radius: $radius-lg;
      &.out { background: rgba(192,57,43,.04); border-color: rgba(192,57,43,.2); }
    }
    .alert-info { display:flex; flex-direction:column; gap:2px; }
    .alert-type { font-size: $font-size-xs; font-weight: $font-weight-bold; text-transform:uppercase; color: $color-warning; .out & { color: $color-error; } }
    .alert-product { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }
    .alert-stock { font-size: $font-size-xs; color: $color-text-tertiary; }
    .alert-actions { display:flex; gap: $space-sm; }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:550px; max-width:90vw; max-height:80vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal;
      &.small { width:420px; }
    }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-md; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl;
      p { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-md; }
    }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }
    .preview { font-size: $font-size-sm; color: $color-success; margin: $space-sm 0; }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-confirm { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; &:disabled { opacity:.5; cursor:not-allowed; } }

    .history-row { display:grid; grid-template-columns: auto auto auto auto 1fr; gap: $space-sm; padding: $space-xs 0; font-size: $font-size-sm; align-items:center; border-bottom:1px solid $color-border-light; &:last-child { border-bottom:none; } }
  `],
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
