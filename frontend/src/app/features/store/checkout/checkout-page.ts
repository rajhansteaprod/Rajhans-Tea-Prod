import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CartStore, CheckoutSummary, CartItem } from '../../../core/services/cart.store';
import { PaymentStore } from '../../../core/services/payment.store';
import { AuthService } from '../../../core/services/auth.service';
import { CatalogService, Product } from '../../../core/services/catalog.service';
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
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogService);
  private readonly api = environment.apiUrl;

  readonly isBuyNow = signal(false);
  readonly tempCartItems = signal<CartItem[]>([]);

  readonly displayCartItems = computed(() =>
    this.isBuyNow() ? this.tempCartItems() : this.cart.cartItems(),
  );

  readonly displayCartCount = computed(() => {
    if (this.isBuyNow()) {
      return this.tempCartItems().reduce((sum, item) => sum + item.qty, 0);
    }
    return this.cart.cartCount();
  });

  readonly displayCartSubtotal = computed(() => {
    if (this.isBuyNow()) {
      return this.tempCartItems().reduce((sum, item) => sum + item.lineTotal, 0);
    }
    return this.cart.cartSubtotal();
  });

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
  readonly loyaltyBalance = signal(0);
  readonly loyaltyEarnRate = signal(0);
  readonly loyaltyRedeemRate = signal(0);
  readonly loyaltyMinRedeem = signal(0);

  useWallet = false;
  useLoyalty = false;
  loyaltyPointsInput = 0;

  address: AddressForm = emptyAddress();

  ngOnInit(): void {
    // Check if this is a "Buy Now" checkout
    this.route.queryParams.subscribe((params) => {
      if (params['buyNow']) {
        this.isBuyNow.set(true);
        this.loadBuyNowProduct(params['buyNow'], parseInt(params['qty'] || '1', 10));
      } else {
        this.isBuyNow.set(false);
        // Load regular cart
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
      }
    });

    // Load wallet + loyalty balance if logged in
    if (this.auth.isLoggedIn()) {
      this.http.get<{ data: { balance: number } }>(`${this.api}/wallet`).subscribe({
        next: (res) => this.walletBalance.set(res.data.balance),
      });
      this.http.get<{ data: { balance: number; earnRate: number; redeemRate: number; minRedeemPoints: number } }>(`${this.api}/promotions/loyalty`).subscribe({
        next: (res) => {
          this.loyaltyBalance.set(res.data.balance);
          this.loyaltyEarnRate.set(res.data.earnRate);
          this.loyaltyRedeemRate.set(res.data.redeemRate);
          this.loyaltyMinRedeem.set(res.data.minRedeemPoints);
          this.loyaltyPointsInput = res.data.balance;
        },
      });
    }
  }

  private loadBuyNowProduct(productId: string, qty: number): void {
    // Fetch product by ID using slug-based approach or search
    this.catalog.getProductsPublic({ limit: 100 }).subscribe({
      next: (res) => {
        const product = res.data?.find((p) => p._id === productId);
        if (product) {
          const cartItem: CartItem = {
            productId: product._id,
            name: product.name,
            slug: product.slug,
            image: product.images?.[0] || '',
            basePrice: product.basePrice,
            qty: Math.max(1, qty),
            lineTotal: product.basePrice * Math.max(1, qty),
          };
          this.tempCartItems.set([cartItem]);
        }
      },
    });
  }

  loyaltyDiscount(): number {
    if (!this.useLoyalty || this.loyaltyPointsInput <= 0) return 0;
    const points = Math.min(this.loyaltyPointsInput, this.loyaltyBalance());
    return (points / 100) * this.loyaltyRedeemRate();
  }

  walletDeduction(): number {
    const total = (this.summary()?.total ?? 0) - this.loyaltyDiscount();
    return Math.min(this.walletBalance(), Math.max(0, total));
  }

  remainingAmount(): number {
    const total = this.summary()?.total ?? 0;
    return Math.max(0, total - this.loyaltyDiscount() - (this.useWallet ? this.walletDeduction() : 0));
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
      // For Buy Now, temporarily add item to cart for checkout/payment
      if (this.isBuyNow() && this.tempCartItems().length > 0) {
        const item = this.tempCartItems()[0];
        this.cart.addItem(item.productId, item.qty);
        // Give it a moment for the add to propagate
        setTimeout(() => this.goTo('summary'), 100);
      } else {
        this.goTo('summary');
      }
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
    const loyaltyPoints = this.useLoyalty ? Math.min(this.loyaltyPointsInput, this.loyaltyBalance()) : 0;
    const success = await this.payment.pay(this.address, walletAmount, loyaltyPoints);

    if (success) {
      this.orderPlacing.set(false);
      this.orderPlaced.set(true);

      // For Buy Now purchases, remove the temp item from cart after order success
      if (this.isBuyNow() && this.tempCartItems().length > 0) {
        const item = this.tempCartItems()[0];
        this.cart.removeItem(item.productId);
      }

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
