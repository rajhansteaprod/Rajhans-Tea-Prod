import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Discount {
  _id?: string;
  code?: string;
  title: string;
  type: 'promo_code' | 'offer';
  description?: string;
  valueType: 'percentage' | 'fixed';
  value: number;
  maxCap?: number;
  minOrderAmount: number;
  usageLimit?: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}

@Component({
  selector: 'app-discount-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './coupon-list.html',
  styleUrls: ['./coupon-list.scss'],
})
export class DiscountListComponent {
  private http = inject(HttpClient);
  private apiUrl = '/api/v1/admin/discounts';

  discounts = signal<Discount[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  errorList = signal<string | null>(null);
  showForm = signal(false);
  discountType = signal<'promo_code' | 'offer'>('promo_code');

  formData = signal<Partial<Discount>>({
    valueType: 'percentage',
    isActive: true,
    minOrderAmount: 0,
  });

  ngOnInit() {
    this.loadDiscounts();
  }

  loadDiscounts() {
    this.isLoading.set(true);
    this.error.set(null);
    this.http.get<{ data: Discount[]; meta: any }>(this.apiUrl).subscribe({
      next: (response) => {
        this.discounts.set(response.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load discounts');

        this.isLoading.set(false);
      },
    });
  }

  openForm() {
    this.showForm.set(true);
    this.formData.set({
      valueType: 'percentage',
      isActive: true,
      minOrderAmount: 0,
    });
  }

  closeForm() {
    this.showForm.set(false);
  }

  saveDiscount() {
    const data = this.formData();
    const isEdit = data._id;
    const endpoint = this.discountType() === 'promo_code'
      ? `${this.apiUrl}/promo-codes`
      : `${this.apiUrl}/offers`;

    this.http[isEdit ? 'put' : 'post'](
      isEdit ? `${this.apiUrl}/${data._id}` : endpoint,
      this.prepareDiscountData(data),
    ).subscribe({
      next: () => {
        this.closeForm();
        this.error.set(null);
        this.errorList.set(null);
        this.loadDiscounts();
      },
      error: (err) => {
        const errorMessage = err.error?.message || err.message || 'Failed to save discount';
        this.error.set(errorMessage);
        this.errorList.set(null);
        console.log('Error saving discount:', err);
      },
    });
  }

  editDiscount(discount: Discount) {
    this.discountType.set(discount.type);
    this.formData.set({ ...discount });
    this.openForm();
  }

  deleteDiscount(id: string) {
    if (confirm('Are you sure you want to delete this discount?')) {
      this.http.delete(`${this.apiUrl}/${id}`).subscribe({
        next: () => {
          this.error.set(null);
          this.errorList.set(null);
          this.loadDiscounts();
        },
        error: (err) => {
          const errorMessage = err.error?.message || err.message || 'Failed to delete discount';
          this.error.set(errorMessage);
        },
      });
    }
  }

  toggleStatus(discount: Discount) {
    discount.isActive = !discount.isActive;
    this.http.put(`${this.apiUrl}/${discount._id}`, { isActive: discount.isActive }).subscribe({
      next: () => {
        this.error.set(null);
        this.errorList.set(null);
        this.loadDiscounts();
      },
      error: (err) => {
        discount.isActive = !discount.isActive;
        const errorMessage = err.error?.message || err.message || 'Failed to update discount status';
        this.error.set(errorMessage);
      },
    });
  }

  private prepareDiscountData(data: Partial<Discount>) {
    const baseData = {
      title: data.title,
      value: data.value,
      valueType: data.valueType,
      minOrderAmount: data.minOrderAmount || 0,
      maxCap: data.maxCap,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      isActive: data.isActive,
      description: data.description,
    };

    if (this.discountType() === 'promo_code') {
      return {
        ...baseData,
        code: data.code,
        usageLimit: data.usageLimit,
      };
    } else {
      return baseData;
    }
  }
}
