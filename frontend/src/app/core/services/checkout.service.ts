import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient , HttpHeaders} from '@angular/common/http';
import { CartItem } from './cart.store';
import { environment } from '../../../environments/environment';
import { PlatformService } from './platform.service';
export interface CheckoutAddress {
  name: string;
  phone: string;
  pincode: string;
  street: string;
  city: string;
  state: string;
}

export interface CheckoutState {
  cartItems: CartItem[];
  address: CheckoutAddress;
}

export interface CheckoutSummary {
  sessionId: string;
  items: any[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  itemCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const emptyAddress = (): CheckoutAddress => ({
  name: '',
  phone: '',
  pincode: '',
  street: '',
  city: '',
  state: '',
});

@Injectable({
  providedIn: 'root',
})
export class CheckoutService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly cart = inject(CartStore);

  // State signals
  private cartItemsSignal = signal<CartItem[]>([]);
  private addressSignal = signal<CheckoutAddress>(emptyAddress());

  // Backend pricing sync signals
  private summaryDataSignal = signal<CheckoutSummary | null>(null);
  private summaryLoadingSignal = signal(false);
  private summaryErrorSignal = signal<string | null>(null);
  private lastSummaryFetchTime = signal<number>(0);
  private summaryFetchInProgress = signal(false);

  // Public readonly accessors
  readonly cartItems = this.cartItemsSignal.asReadonly();
  readonly address = this.addressSignal.asReadonly();
  readonly summaryLoading = this.summaryLoadingSignal.asReadonly();
  readonly summaryError = this.summaryErrorSignal.asReadonly();
private readonly platform = inject(PlatformService);
  // Computed values — prefer backend pricing if available, fallback to client calculation
  readonly cartSubtotal = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return (
      backendSummary?.subtotal ?? this.cartItems().reduce((sum, item) => sum + item.lineTotal, 0)
    );
  });

  readonly cartDiscount = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return backendSummary?.totalDiscount ?? this.cartSubtotal() * 0.1;
  });

  readonly cartTax = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return backendSummary?.totalTax ?? this.cartSubtotal() * 0.18;
  });

  readonly cartTotal = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return backendSummary?.total ?? this.cartSubtotal() - this.cartDiscount();
  });

  readonly isPricingFromBackend = computed(() => !!this.summaryDataSignal());

  constructor() {
    // Auto-refresh pricing when cart items change (with debounce)
    let debounceTimer: any;
    effect(() => {
      this.cartItems(); // Track changes
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Only refresh if we have items and summary was previously loaded
        if (this.cartItems().length > 0 && this.isPricingFromBackend()) {
          this.loadCheckoutSummary(true);
        }
      }, 500); // 500ms debounce
    });
  }

  // Initialize checkout with cart items
  initializeCheckout(items: CartItem[]) {
    this.cartItemsSignal.set([...items]);
    // Load actual pricing from backend on init
    this.loadCheckoutSummary(false);
  }

  // Update cart items
  setCartItems(items: CartItem[]) {
    this.cartItemsSignal.set([...items]);
  }

  // Save address (called when user clicks Next on address step)
  saveAddress(address: CheckoutAddress) {
    this.addressSignal.set({ ...address });
  }

  // Get current address
  getAddress(): CheckoutAddress {
    return this.addressSignal();
  }

  // Load pricing summary from backend with robust error handling and retry
  // forceRefresh: skip cache even if fresh data exists
  async loadCheckoutSummary(forceRefresh = false): Promise<CheckoutSummary | null> {
    const items = this.cartItems();
    if (items.length === 0) {
      this.summaryDataSignal.set(null);
      return null;
    }

    // Cache check: 25-minute TTL (payment window timeout)
    const now = Date.now();
    const cacheAgeMs = now - this.lastSummaryFetchTime();
    const CACHE_TTL_MS = 25 * 60 * 1000;

    if (!forceRefresh && cacheAgeMs < CACHE_TTL_MS && this.summaryDataSignal()) {
      return this.summaryDataSignal();
    }

    // Dedup: if fetch already in progress, don't issue another request
    if (this.summaryFetchInProgress()) {
      return this.summaryDataSignal();
    }

    this.summaryFetchInProgress.set(true);
    this.summaryLoadingSignal.set(true);
    this.summaryErrorSignal.set(null);

    try {
      // Detect if using temporary cart (buy-now flow)
      const tempCart = this.cart.getTemporaryCart();
      const isTemporaryCheckout = tempCart.length > 0 && JSON.stringify(tempCart) === JSON.stringify(items);

      // Retry logic: exponential backoff, max 3 attempts
      let lastError: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Build request body
          const body: Record<string, any> = isTemporaryCheckout ? { items } : {};

          const response = await this.http
            .post<
              ApiResponse<CheckoutSummary>
            >(`${this.api}/checkout/summary`, body, { headers: this.headers() })
            .toPromise();

          if (response?.data) {
            this.summaryDataSignal.set(response.data);
            this.lastSummaryFetchTime.set(now);
            this.summaryErrorSignal.set(null);
            return response.data;
          }
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            // Exponential backoff: 500ms, 1000ms, then give up
            const delayMs = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      // All retries failed
      throw lastError;
    } catch (error: any) {
      // Graceful degradation: use client-side calculation as fallback
      const errorMsg = error?.error?.message || error?.message || 'Failed to load pricing';
      this.summaryErrorSignal.set(errorMsg);
      console.warn('Checkout pricing sync failed, using client-side fallback:', errorMsg);

      // Still return current summary or null (UI will show stale/estimated pricing)
      return this.summaryDataSignal();
    } finally {
      this.summaryFetchInProgress.set(false);
      this.summaryLoadingSignal.set(false);
    }
  }

  // Reset pricing cache (call after successful payment or on checkout reset)
  resetPricingCache() {
    this.summaryDataSignal.set(null);
    this.lastSummaryFetchTime.set(0);
    this.summaryErrorSignal.set(null);
  }

  // Reset checkout state
  resetCheckout() {
    this.cartItemsSignal.set([]);
    this.addressSignal.set(emptyAddress());
    this.resetPricingCache();
  }

  // Get full state (for debugging/persistence)
  getState(): CheckoutState {
    return {
      cartItems: this.cartItems(),
      address: this.address(),
    };
  }
  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Session-ID': this.platform.localStorage.getItem('guestSessionId')??'' });
  }
}
