import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CartStore } from './cart.store';
import { RazorpayService, RazorpayResponse } from './razorpay.service';
import { AuthService } from './auth.service';

// ─── API Types ───────────────────────────────────────────────────────────────

export interface CreateOrderResponse {
  paymentId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentResponse {
  paymentId: string;
  status: string;
  amountPaise: number;
}

export interface PaymentHistoryItem {
  _id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  checkoutSnapshot: {
    items: { productId: string; name: string; qty: number; unitPrice: number; totalPrice: number }[];
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    total: number;
  };
  shippingAddress: { name: string; phone: string; street: string; city: string; state: string; pincode: string };
  invoiceId: string | null;
  createdAt: string;
}

export interface WalletBalance {
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  source: string;
  description: string;
  createdAt: string;
}

export interface InvoiceItem {
  _id: string;
  invoiceNumber: string;
  grandTotal: number;
  pdfPath: string | null;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AddressForm {
  name: string;
  phone: string;
  pincode: string;
  street: string;
  city: string;
  state: string;
}

// ─── PaymentStore ────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PaymentStore {
  private readonly http = inject(HttpClient);
  private readonly cart = inject(CartStore);
  private readonly razorpay = inject(RazorpayService);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  // ─── Signals ───────────────────────────────────────────────────────────────

  private readonly _paymentLoading = signal(false);
  private readonly _paymentError = signal<string | null>(null);
  private readonly _paymentSuccess = signal(false);
  private readonly _lastPaymentId = signal<string | null>(null);

  private readonly _walletBalance = signal(0);
  private readonly _walletTransactions = signal<WalletTransaction[]>([]);
  private readonly _walletLoading = signal(false);

  private readonly _paymentHistory = signal<PaymentHistoryItem[]>([]);
  private readonly _historyLoading = signal(false);
  private readonly _historyMeta = signal<{ page: number; totalPages: number } | null>(null);

  private readonly _invoices = signal<InvoiceItem[]>([]);
  private readonly _invoicesLoading = signal(false);

  readonly paymentLoading = this._paymentLoading.asReadonly();
  readonly paymentError = this._paymentError.asReadonly();
  readonly paymentSuccess = this._paymentSuccess.asReadonly();
  readonly lastPaymentId = this._lastPaymentId.asReadonly();

  readonly walletBalance = this._walletBalance.asReadonly();
  readonly walletTransactions = this._walletTransactions.asReadonly();
  readonly walletLoading = this._walletLoading.asReadonly();

  readonly paymentHistory = this._paymentHistory.asReadonly();
  readonly historyLoading = this._historyLoading.asReadonly();
  readonly historyMeta = this._historyMeta.asReadonly();

  readonly invoices = this._invoices.asReadonly();
  readonly invoicesLoading = this._invoicesLoading.asReadonly();

  // ─── Payment Flow ──────────────────────────────────────────────────────────

  /**
   * Full Razorpay payment flow:
   * 1. Create order (backend)
   * 2. Open Razorpay modal (frontend)
   * 3. Verify payment (backend)
   */
  async pay(address: AddressForm): Promise<boolean> {
    this._paymentLoading.set(true);
    this._paymentError.set(null);
    this._paymentSuccess.set(false);

    try {
      // Step 1: Create Razorpay order
      const orderRes = await this.http
        .post<ApiResponse<CreateOrderResponse>>(
          `${this.api}/payments/orders`,
          { address },
          { headers: this.sessionHeaders() },
        )
        .toPromise();

      const order = orderRes!.data;

      // Step 2: Open Razorpay checkout modal
      const user = this.auth.user();
      let rzpResponse: RazorpayResponse;
      try {
        rzpResponse = await this.razorpay.openCheckout({
          orderId: order.razorpayOrderId,
          amountPaise: order.amountPaise,
          currency: order.currency,
          keyId: order.keyId,
          prefill: user ? { name: user.firstName, contact: user.phone } : undefined,
        });
      } catch {
        // User dismissed modal
        this._paymentLoading.set(false);
        this._paymentError.set('Payment cancelled');
        return false;
      }

      // Step 3: Verify payment
      const verifyRes = await this.http
        .post<ApiResponse<VerifyPaymentResponse>>(
          `${this.api}/payments/verify`,
          {
            razorpayOrderId: rzpResponse.razorpay_order_id,
            razorpayPaymentId: rzpResponse.razorpay_payment_id,
            razorpaySignature: rzpResponse.razorpay_signature,
          },
          { headers: this.sessionHeaders() },
        )
        .toPromise();

      this._lastPaymentId.set(verifyRes!.data.paymentId);
      this._paymentSuccess.set(true);
      this._paymentLoading.set(false);

      // Clear cart (backend already cleared it, sync frontend)
      this.cart.loadCart();

      return true;
    } catch (err: any) {
      this._paymentLoading.set(false);
      this._paymentError.set(err?.error?.message || err?.message || 'Payment failed');
      return false;
    }
  }

  resetPaymentState(): void {
    this._paymentLoading.set(false);
    this._paymentError.set(null);
    this._paymentSuccess.set(false);
    this._lastPaymentId.set(null);
  }

  // ─── Wallet ────────────────────────────────────────────────────────────────

  loadWalletBalance(): void {
    this._walletLoading.set(true);
    this.http.get<ApiResponse<WalletBalance>>(`${this.api}/wallet`).subscribe({
      next: (res) => {
        this._walletBalance.set(res.data.balance);
        this._walletLoading.set(false);
      },
      error: () => this._walletLoading.set(false),
    });
  }

  loadWalletTransactions(page = 1): void {
    this._walletLoading.set(true);
    this.http
      .get<PaginatedResponse<WalletTransaction>>(`${this.api}/wallet/transactions?page=${page}&limit=20`)
      .subscribe({
        next: (res) => {
          this._walletTransactions.set(res.data);
          this._walletLoading.set(false);
        },
        error: () => this._walletLoading.set(false),
      });
  }

  // ─── Payment History ───────────────────────────────────────────────────────

  loadPaymentHistory(page = 1): void {
    this._historyLoading.set(true);
    this.http
      .get<PaginatedResponse<PaymentHistoryItem>>(`${this.api}/payments/history?page=${page}&limit=10`)
      .subscribe({
        next: (res) => {
          this._paymentHistory.set(res.data);
          this._historyMeta.set({ page: res.meta.page, totalPages: res.meta.totalPages });
          this._historyLoading.set(false);
        },
        error: () => this._historyLoading.set(false),
      });
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────

  loadInvoices(page = 1): void {
    this._invoicesLoading.set(true);
    this.http
      .get<PaginatedResponse<InvoiceItem>>(`${this.api}/invoices?page=${page}&limit=20`)
      .subscribe({
        next: (res) => {
          this._invoices.set(res.data);
          this._invoicesLoading.set(false);
        },
        error: () => this._invoicesLoading.set(false),
      });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private sessionHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Session-ID': this.cart.sessionId });
  }
}
