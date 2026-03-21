import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionHttpService, Coupon } from '../../../core/services/promotion.service';

@Component({
  selector: 'app-coupon-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">Coupons</h1><p class="page-sub">Manage discount codes</p></div>
        <button class="btn-add" (click)="openCreate()">+ Create Coupon</button>
      </div>

      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (coupons().length === 0) {
        <div class="empty">No coupons yet.</div>
      } @else {
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th>Valid</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              @for (c of coupons(); track c._id) {
                <tr>
                  <td class="mono">{{ c.code }}</td>
                  <td>{{ c.discountType }}</td>
                  <td>{{ c.discountType === 'percentage' ? c.discountValue + '%' : '₹' + c.discountValue }}</td>
                  <td>{{ c.usedCount }}{{ c.usageLimitTotal ? '/' + c.usageLimitTotal : '' }}</td>
                  <td class="date">{{ c.validFrom | date:'dd MMM' }} — {{ c.validUntil | date:'dd MMM yyyy' }}</td>
                  <td><span class="badge" [class.active]="c.isActive" [class.inactive]="!c.isActive">{{ c.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td>
                    <button class="btn-sm" (click)="openEdit(c)">Edit</button>
                    <button class="btn-sm danger" (click)="deleteCoupon(c._id)">Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="backdrop" (click)="showModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ editId ? 'Edit' : 'Create' }} Coupon</h2><button (click)="showModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-row">
              <div class="form-field"><label>Code *</label><input [(ngModel)]="form.code" placeholder="FLAT50" /></div>
              <div class="form-field"><label>Discount Type *</label>
                <select [(ngModel)]="form.discountType"><option value="percentage">Percentage</option><option value="fixed">Fixed ₹</option></select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field"><label>Value *</label><input type="number" [(ngModel)]="form.discountValue" placeholder="50" /></div>
              <div class="form-field"><label>Min Order ₹</label><input type="number" [(ngModel)]="form.minOrderAmount" placeholder="0" /></div>
            </div>
            <div class="form-row">
              <div class="form-field"><label>Max Discount Cap ₹</label><input type="number" [(ngModel)]="form.maxDiscountCap" placeholder="Leave empty for no cap" /></div>
              <div class="form-field"><label>Per User Limit</label><input type="number" [(ngModel)]="form.usageLimitPerUser" placeholder="1" /></div>
            </div>
            <div class="form-row">
              <div class="form-field"><label>Total Usage Limit</label><input type="number" [(ngModel)]="form.usageLimitTotal" placeholder="Unlimited" /></div>
              <div class="form-field"><label>Scope</label>
                <select [(ngModel)]="form.scope"><option value="all">All Products</option><option value="products">Specific Products</option><option value="categories">Specific Categories</option></select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field"><label>Valid From *</label><input type="date" [(ngModel)]="form.validFrom" /></div>
              <div class="form-field"><label>Valid Until *</label><input type="date" [(ngModel)]="form.validUntil" /></div>
            </div>
            <div class="form-field"><label>Description</label><input [(ngModel)]="form.description" placeholder="Coupon description" /></div>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.isActive" /> Active</label>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.stackable" /> Stackable with other discounts</label>
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
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; &:hover { background: $color-primary-hover; } }
    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }
    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
      tr:hover td { background: $color-bg-secondary; }
    }
    .mono { font-family:monospace; font-weight: $font-weight-bold; color: $color-primary; }
    .date { font-size: $font-size-xs; color: $color-text-tertiary; white-space:nowrap; }
    .badge { padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &.active { background:rgba(87,136,108,.12); color: $color-success; }
      &.inactive { background:rgba(192,57,43,.1); color: $color-error; }
    }
    .btn-sm { padding: $space-xxs $space-xs; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; margin-right: $space-xxs;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.danger:hover { border-color: $color-error; color: $color-error; }
    }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:550px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .form-row { display:flex; gap: $space-md; margin-bottom: $space-md; }
    .form-field { flex:1; display:flex; flex-direction:column; gap: $space-xs; min-width:0;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }
    .checkbox { display:flex; align-items:center; gap: $space-sm; font-size: $font-size-sm; color: $color-text-secondary; cursor:pointer; margin-bottom: $space-sm; input { cursor:pointer; } }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; }
  `],
})
export class CouponManagementComponent implements OnInit {
  private readonly promoService = inject(PromotionHttpService);

  readonly coupons = signal<Coupon[]>([]);
  readonly loading = signal(false);
  readonly showModal = signal(false);
  editId: string | null = null;
  form: any = this.emptyForm();

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.promoService.adminListCoupons().subscribe({
      next: (res) => { this.coupons.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void { this.editId = null; this.form = this.emptyForm(); this.showModal.set(true); }

  openEdit(c: Coupon): void {
    this.editId = c._id;
    this.form = {
      code: c.code, description: c.description, discountType: c.discountType, discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount, maxDiscountCap: c.maxDiscountCap, usageLimitTotal: c.usageLimitTotal,
      usageLimitPerUser: c.usageLimitPerUser, scope: c.scope, isActive: c.isActive, stackable: c.stackable,
      validFrom: c.validFrom?.slice(0, 10), validUntil: c.validUntil?.slice(0, 10),
    };
    this.showModal.set(true);
  }

  save(): void {
    const req = this.editId
      ? this.promoService.adminUpdateCoupon(this.editId, this.form)
      : this.promoService.adminCreateCoupon(this.form);
    req.subscribe({ next: () => { this.showModal.set(false); this.load(); } });
  }

  deleteCoupon(id: string): void {
    if (!confirm('Delete this coupon?')) return;
    this.promoService.adminDeleteCoupon(id).subscribe({ next: () => this.load() });
  }

  private emptyForm() {
    return {
      code: '', description: '', discountType: 'percentage', discountValue: null, minOrderAmount: 0,
      maxDiscountCap: null, usageLimitTotal: null, usageLimitPerUser: 1, scope: 'all',
      isActive: true, stackable: true, validFrom: '', validUntil: '',
    };
  }
}
