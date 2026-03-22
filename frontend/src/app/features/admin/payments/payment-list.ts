import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface PaymentItem {
  _id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  status: string;
  userId: { _id: string; phone: string; firstName?: string; lastName?: string; role: string } | null;
  checkoutSnapshot: {
    items: { productId: string; name: string; qty: number; unitPrice: number; totalPrice: number }[];
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    total: number;
  };
  shippingAddress: { name: string; phone: string; street: string; city: string; state: string; pincode: string };
  refundedAmount: number;
  refunds: { razorpayRefundId: string; amount: number; reason: string; createdAt: string }[];
  invoiceId: string | null;
  createdAt: string;
}

interface Stats {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  totalRefunded: number;
}

@Component({
  selector: 'app-admin-payment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-list.html',
  styleUrls: ['./payment-list.scss'],
})
export class AdminPaymentListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly payments = signal<PaymentItem[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly loading = signal(false);
  readonly meta = signal<{ page: number; totalPages: number } | null>(null);
  readonly selectedPayment = signal<PaymentItem | null>(null);
  readonly refundTarget = signal<PaymentItem | null>(null);
  readonly refundProcessing = signal(false);
  readonly refundError = signal<string | null>(null);

  searchQuery = '';
  statusFilter = '';
  refundAmount: number | null = null;
  refundReason = '';
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadStats();
    this.loadPayments();
  }

  loadStats(): void {
    this.http.get<{ data: Stats }>(`${this.api}/admin/payments/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadPayments(page = 1): void {
    this.loading.set(true);
    let url = `${this.api}/admin/payments?page=${page}&limit=15`;
    if (this.statusFilter) url += `&status=${this.statusFilter}`;
    if (this.searchQuery) url += `&search=${encodeURIComponent(this.searchQuery)}`;

    this.http.get<{ data: PaymentItem[]; meta: { page: number; totalPages: number } }>(url).subscribe({
      next: (res) => {
        this.payments.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadPayments(), 400);
  }

  openDetail(p: PaymentItem): void { this.selectedPayment.set(p); }
  openRefund(p: PaymentItem): void {
    this.refundTarget.set(p);
    this.refundAmount = null;
    this.refundReason = '';
    this.refundError.set(null);
  }

  submitRefund(): void {
    if (!this.refundTarget() || !this.refundAmount || !this.refundReason) return;
    this.refundProcessing.set(true);
    this.refundError.set(null);

    this.http.post(`${this.api}/payments/${this.refundTarget()!._id}/refund`, {
      amount: this.refundAmount,
      reason: this.refundReason,
    }).subscribe({
      next: () => {
        this.refundProcessing.set(false);
        this.refundTarget.set(null);
        this.refundError.set(null);
        this.loadPayments();
        this.loadStats();
      },
      error: (err) => {
        this.refundProcessing.set(false);
        this.refundError.set(err.error?.message || 'Refund failed');
      },
    });
  }
}
