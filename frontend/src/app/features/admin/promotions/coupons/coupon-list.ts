import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Coupon {
  _id?: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountCap: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  scope: 'all' | 'products' | 'categories';
  isActive: boolean;
}

@Component({
  selector: 'app-coupon-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './coupon-list.html',
  styleUrls: ['./coupon-list.scss'],
})
export class CouponListComponent {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/admin/promotions/coupons';

  coupons = signal<Coupon[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  showForm = signal(false);

  formData = signal<Partial<Coupon>>({
    discountType: 'percentage',
    scope: 'all',
    isActive: true,
    usageLimitPerUser: 1,
    minOrderAmount: 0,
  });

  ngOnInit() {
    this.loadCoupons();
  }

  loadCoupons() {
    this.isLoading.set(true);
    this.error.set(null);
    this.http.get<{ data: Coupon[]; meta: any }>(this.apiUrl).subscribe({
      next: (response) => {
        this.coupons.set(response.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load coupons');
        this.isLoading.set(false);
      },
    });
  }

  openForm() {
    this.showForm.set(true);
    this.formData.set({
      discountType: 'percentage',
      scope: 'all',
      isActive: true,
      usageLimitPerUser: 1,
      minOrderAmount: 0,
    });
  }

  closeForm() {
    this.showForm.set(false);
  }

  saveCoupon() {
    const data = this.formData();
    const isEdit = data._id;

    this.http[isEdit ? 'put' : 'post'](
      isEdit ? `${this.apiUrl}/${data._id}` : this.apiUrl,
      this.prepareCouponData(data),
    ).subscribe({
      next: () => {
        this.closeForm();
        this.loadCoupons();
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to save coupon');
      },
    });
  }

  editCoupon(coupon: Coupon) {
    this.formData.set({ ...coupon });
    this.openForm();
  }

  deleteCoupon(id: string) {
    if (confirm('Are you sure you want to delete this coupon?')) {
      this.http.delete(`${this.apiUrl}/${id}`).subscribe({
        next: () => {
          this.loadCoupons();
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to delete coupon');
        },
      });
    }
  }

  toggleStatus(coupon: Coupon) {
    coupon.isActive = !coupon.isActive;
    this.http.put(`${this.apiUrl}/${coupon._id}`, { isActive: coupon.isActive }).subscribe({
      next: () => {
        this.loadCoupons();
      },
      error: (err) => {
        coupon.isActive = !coupon.isActive;
        this.error.set(err.error?.message || 'Failed to update coupon status');
      },
    });
  }

  private prepareCouponData(data: Partial<Coupon>) {
    return {
      code: data.code,
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderAmount: data.minOrderAmount,
      maxDiscountCap: data.maxDiscountCap,
      usageLimitTotal: data.usageLimitTotal,
      usageLimitPerUser: data.usageLimitPerUser,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      scope: data.scope,
      isActive: data.isActive,
    };
  }
}
