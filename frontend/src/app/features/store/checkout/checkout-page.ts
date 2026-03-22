import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CartStore, CheckoutSummary } from '../../../core/services/cart.store';
import { PaymentStore } from '../../../core/services/payment.store';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

type Step = 'cart' | 'address' | 'summary';

interface StockIssueItem {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

interface AddressForm {
  name: string;
  phone: string;
  pincode: string;
  street: string;
  city: string;
  state: string;
}

const emptyAddress = (): AddressForm => ({
  name: '',
  phone: '',
  pincode: '',
  street: '',
  city: '',
  state: '',
});

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './checkout-page.html',
  styleUrls: ['./checkout-page.scss'],
})
export class CheckoutPageComponent implements OnInit {
  readonly cart = inject(CartStore);
  readonly payment = inject(PaymentStore);
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = environment.apiUrl;

  readonly steps = [
    { key: 'cart' as Step, label: 'Cart' },
    { key: 'address' as Step, label: 'Address' },
    { key: 'summary' as Step, label: 'Summary' },
  ];

  readonly currentStep = signal<Step>('cart');
  readonly summary = signal<CheckoutSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly stockIssues = signal<StockIssueItem[]>([]);
  readonly orderPlacing = signal(false);
  readonly orderPlaced = signal(false);
  readonly walletBalance = signal(0);

  useWallet = false;

  address: AddressForm = emptyAddress();

  ngOnInit(): void {
    // If merge is in progress (user just logged in), wait for it to finish
    if (this.cart.merging()) {
      const interval = setInterval(() => {
        if (!this.cart.merging()) {
          clearInterval(interval);
          this.cart.loadCart();
        }
      }, 200);
    } else {
      this.cart.loadCart();
    }
    // Load wallet balance if logged in
    if (this.auth.isLoggedIn()) {
      this.http.get<{ data: { balance: number } }>(`${this.api}/wallet`).subscribe({
        next: (res) => this.walletBalance.set(res.data.balance),
      });
    }
  }

  walletDeduction(): number {
    const total = this.summary()?.total ?? 0;
    return Math.min(this.walletBalance(), total);
  }

  remainingAmount(): number {
    const total = this.summary()?.total ?? 0;
    return Math.max(0, total - this.walletDeduction());
  }

  isStepDone(step: Step): boolean {
    const order: Step[] = ['cart', 'address', 'summary'];
    return order.indexOf(step) < order.indexOf(this.currentStep());
  }

  goTo(step: Step): void {
    if (step === 'summary') {
      this.loadSummary();
    }
    this.currentStep.set(step);
  }

  onAddressSubmit(): void {
    if (this.isAddressValid()) {
      this.goTo('summary');
    }
  }

  isAddressValid(): boolean {
    return !!(
      this.address.name.trim() &&
      this.address.phone.trim().length >= 10 &&
      this.address.pincode.trim().length === 6 &&
      this.address.street.trim() &&
      this.address.city.trim() &&
      this.address.state.trim()
    );
  }

  private loadSummary(): void {
    this.summaryLoading.set(true);
    this.http
      .get<{ success: boolean; data: CheckoutSummary }>(
        `${this.api}/checkout/summary`,
        { headers: this.sessionHeaders() },
      )
      .subscribe({
        next: (res) => {
          this.summary.set(res.data);
          this.summaryLoading.set(false);
        },
        error: () => this.summaryLoading.set(false),
      });
  }

  async placeOrder(): Promise<void> {
    // Guest must login before payment
    if (!this.auth.isLoggedIn()) {
      // Save current URL so auth can redirect back after login
      localStorage.setItem('redirectAfterLogin', '/checkout');
      this.router.navigate(['/auth/login']);
      return;
    }

    this.orderPlacing.set(true);
    this.stockIssues.set([]);

    const walletAmount = this.useWallet ? this.walletDeduction() : 0;
    const success = await this.payment.pay(this.address, walletAmount);

    if (success) {
      this.orderPlacing.set(false);
      this.orderPlaced.set(true);
      setTimeout(() => {
        this.router.navigate(['/orders']);
      }, 2000);
    } else {
      this.orderPlacing.set(false);
      const error = this.payment.paymentError();
      if (error && error !== 'Payment cancelled') {
        // Could be stock issue or other error
        this.stockIssues.set([]);
      }
    }
  }

  private sessionHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Session-ID': this.cart.sessionId });
  }
}
