import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Warehouse {
  _id: string;
  name: string;
  address: { street: string; city: string; state: string; pincode: string; phone: string; email: string };
  isDefault: boolean;
  isActive: boolean;
  shiprocketPickupLocationId: string | null;
}

@Component({
  selector: 'app-warehouse-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Warehouses</h1>
          <p class="page-subtitle">Manage pickup locations</p>
        </div>
        <button class="btn-add" (click)="openCreate()">+ Add Warehouse</button>
      </div>

      @if (warehouses().length === 0) {
        <div class="empty">
          <p>No warehouses yet. Add one to start fulfilling orders.</p>
        </div>
      } @else {
        <div class="warehouse-grid">
          @for (w of warehouses(); track w._id) {
            <div class="warehouse-card" [class.default]="w.isDefault">
              @if (w.isDefault) {
                <span class="default-badge">Default</span>
              }
              <h3 class="wh-name">{{ w.name }}</h3>
              <p class="wh-address">{{ w.address.street }}, {{ w.address.city }}, {{ w.address.state }} - {{ w.address.pincode }}</p>
              <p class="wh-contact">{{ w.address.phone }} · {{ w.address.email }}</p>
              <div class="wh-actions">
                <button class="btn-sm" (click)="openEdit(w)">Edit</button>
                @if (!w.isDefault) {
                  <button class="btn-sm danger" (click)="deleteWarehouse(w._id)">Delete</button>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="backdrop" (click)="showModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ editId ? 'Edit' : 'Add' }} Warehouse</h2><button (click)="showModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-group"><label>Name *</label><input [(ngModel)]="form.name" placeholder="Main Warehouse" /></div>
            <div class="form-group"><label>Street *</label><input [(ngModel)]="form.street" placeholder="123, Industrial Area" /></div>
            <div class="form-row">
              <div class="form-group"><label>City *</label><input [(ngModel)]="form.city" placeholder="Bhopal" /></div>
              <div class="form-group"><label>State *</label><input [(ngModel)]="form.state" placeholder="Madhya Pradesh" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Pincode *</label><input [(ngModel)]="form.pincode" maxlength="6" placeholder="462001" /></div>
              <div class="form-group"><label>Phone *</label><input [(ngModel)]="form.phone" maxlength="10" placeholder="9876543210" /></div>
            </div>
            <div class="form-group"><label>Email *</label><input [(ngModel)]="form.email" placeholder="warehouse@rajhans.com" /></div>
            <label class="checkbox-row"><input type="checkbox" [(ngModel)]="form.isDefault" /> Set as default warehouse</label>
            <div class="modal-actions">
              <button (click)="showModal.set(false)">Cancel</button>
              <button class="btn-save" (click)="save()">{{ editId ? 'Update' : 'Create' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast; &:hover { background: $color-primary-hover; } }

    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; }

    .warehouse-grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(320px,1fr)); gap: $space-lg; }
    .warehouse-card { position:relative; padding: $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; transition: all $transition-fast;
      &:hover { border-color: $color-border; box-shadow: $shadow-md; }
      &.default { border-color: $color-primary; border-width:2px; }
    }
    .default-badge { position:absolute; top: $space-md; right: $space-md; padding:2px $space-sm; background: $color-primary; color: $color-text-inverse; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase; }
    .wh-name { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-sm; }
    .wh-address { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-xxs; line-height: $line-height-relaxed; }
    .wh-contact { font-size: $font-size-xs; color: $color-text-tertiary; margin:0 0 $space-md; }
    .wh-actions { display:flex; gap: $space-sm; }
    .btn-sm { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; transition: all $transition-fast;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.danger:hover { border-color: $color-error; color: $color-error; }
    }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:480px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .form-group { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; min-width:0; flex:1;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }
    .form-row { display:flex; gap: $space-md;
      .form-group { flex:1; min-width:0; }
    }
    .checkbox-row { display:flex; align-items:center; gap: $space-sm; font-size: $font-size-sm; color: $color-text-secondary; cursor:pointer; margin-bottom: $space-md; input { cursor:pointer; } }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; }
  `],
})
export class WarehouseListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly warehouses = signal<Warehouse[]>([]);
  readonly showModal = signal(false);
  editId: string | null = null;
  form = { name: '', street: '', city: '', state: '', pincode: '', phone: '', email: '', isDefault: false };

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<{ data: Warehouse[] }>(`${this.api}/admin/warehouses`).subscribe({
      next: (res) => this.warehouses.set(res.data),
    });
  }

  openCreate(): void {
    this.editId = null;
    this.form = { name: '', street: '', city: '', state: '', pincode: '', phone: '', email: '', isDefault: false };
    this.showModal.set(true);
  }

  openEdit(w: Warehouse): void {
    this.editId = w._id;
    this.form = { name: w.name, ...w.address, isDefault: w.isDefault };
    this.showModal.set(true);
  }

  save(): void {
    const body = {
      name: this.form.name,
      address: { street: this.form.street, city: this.form.city, state: this.form.state, pincode: this.form.pincode, phone: this.form.phone, email: this.form.email },
      isDefault: this.form.isDefault,
    };
    const req = this.editId
      ? this.http.put(`${this.api}/admin/warehouses/${this.editId}`, body)
      : this.http.post(`${this.api}/admin/warehouses`, body);
    req.subscribe({ next: () => { this.showModal.set(false); this.load(); } });
  }

  deleteWarehouse(id: string): void {
    if (!confirm('Delete this warehouse?')) return;
    this.http.delete(`${this.api}/admin/warehouses/${id}`).subscribe({ next: () => this.load() });
  }
}
