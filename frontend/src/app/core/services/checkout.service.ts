import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient , HttpHeaders} from '@angular/common/http';
import { CartItem } from './cart.store';
import { environment } from '../../../environments/environment';
import { PlatformService } from './platform.service';
import { AuthService } from './auth.service';
export interface CheckoutAddress {
  name: string;
  phone: string;
  pinCode: string;
  address: string;
  landmark?: string;
  city: string;
  state: string;
  _id?: string;
}

export interface CheckoutState {
  cartItems: CartItem[];
  address: CheckoutAddress;
}

export interface CheckoutSummary {
  sessionId: string;
  items: any[];
  subtotal: number;
  totalDiscount: number; // per-line rule discounts (excludes coupon)
  totalTax: number;
  itemsTotal?: number; // line totals before coupon
  couponCode?: string | null;
  couponDiscount?: number; // order-level coupon discount
  shippingCost?: number;
  total: number; // grand total — exactly what the backend will charge
  itemCount: number;
  promoError?: string;
}

export interface Offer {
  _id: string;
  code?: string;
  title: string;
  type: 'promo_code' | 'offer';
  description?: string;
  valueType: 'percentage' | 'fixed';
  value: number;
  maxCap?: number;
  minOrderAmount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const emptyAddress = (): CheckoutAddress => ({
  name: '',
  phone: '',
  pinCode: '',
  address: '',
  landmark: '',
  city: '',
  state: '',
});

@Injectable({
  providedIn: 'root',
})
export class CheckoutService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly platform = inject(PlatformService);
  private readonly auth = inject(AuthService);

  // State signals
  private cartItemsSignal = signal<CartItem[]>([]);
  private addressSignal = signal<CheckoutAddress>(emptyAddress());
  private selectedOfferSignal = signal<Offer | null>(null);
  private offersSignal = signal<Offer[]>([]);
  private offersLoadingSignal = signal(false);

  // Applied promo code — single source shared by cart step, summary step and payment
  private appliedPromoCodeSignal = signal<string>('');

  // Backend pricing sync signals
  private summaryDataSignal = signal<CheckoutSummary | null>(null);
  private summaryLoadingSignal = signal(false);
  private summaryErrorSignal = signal<string | null>(null);
  private lastSummaryFetchTime = signal<number>(0);
  private summaryFetchInProgress = signal(false);
  private skipNextEffectCall = false;

  // Public readonly accessors
  readonly cartItems = this.cartItemsSignal.asReadonly();
  readonly address = this.addressSignal.asReadonly();
  readonly summaryLoading = this.summaryLoadingSignal.asReadonly();
  readonly summaryError = this.summaryErrorSignal.asReadonly();
  readonly selectedOffer = this.selectedOfferSignal.asReadonly();
  readonly offers = this.offersSignal.asReadonly();
  readonly offersLoading = this.offersLoadingSignal.asReadonly();
  // Computed values — prefer backend pricing if available, fallback to client calculation
  readonly cartSubtotal = computed(() => {
    const backendSummary = this.summaryDataSignal();
    if (backendSummary) {
      // Original MRP = discounted subtotal + discount amount (MRP never changes, only discount varies)
      return backendSummary.subtotal + backendSummary.totalDiscount;
    }
    return this.cartItems().reduce((sum, item) => sum + item.lineTotal, 0);
  });

  readonly cartDiscount = computed(() => {
    const backendSummary = this.summaryDataSignal();
    if (!backendSummary) return 0;
    return backendSummary.totalDiscount + (backendSummary.couponDiscount ?? 0);
  });

  // Tax is ONLY ever calculated by the backend — no client-side estimates.
  readonly cartTax = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return backendSummary?.totalTax ?? 0;
  });

  readonly cartTotal = computed(() => {
    const backendSummary = this.summaryDataSignal();
    return backendSummary?.total ?? this.cartSubtotal() - this.cartDiscount();
  });

  readonly appliedPromoCode = this.appliedPromoCodeSignal.asReadonly();

  readonly isPricingFromBackend = computed(() => !!this.summaryDataSignal());

  // Load eligible offers based on current cart total
  async loadOffers(): Promise<Offer[]> {
    const cartTotal = this.cartSubtotal();
    if (cartTotal === 0) {
      this.offersSignal.set([]);
      return [];
    }

    this.offersLoadingSignal.set(true);
    try {
      const response = await this.http
        .get<ApiResponse<Offer[]>>(`${this.api}/discounts/offers?cartTotal=${cartTotal}`)
        .toPromise();

      if (response?.data) {
        this.offersSignal.set(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Failed to load offers:', error);
      this.offersSignal.set([]);
    } finally {
      this.offersLoadingSignal.set(false);
    }
    return [];
  }

  // Select an offer (only one at a time)
  selectOffer(offer: Offer) {
    this.selectedOfferSignal.set(offer);
  }

  // Deselect current offer
  deselectOffer() {
    this.selectedOfferSignal.set(null);
  }

  // Get selected offer ID for API
  getSelectedOfferId(): string | null {
    return this.selectedOfferSignal()?._id ?? null;
  }

  constructor() {
    // Load address from localStorage on init
    const saved = this.platform.localStorage.getItem('checkout_address');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Validate required fields
        if (data.phone && data.pinCode && data.address && data.city && data.state) {
          this.addressSignal.set(data);
        }
      } catch (e) {
        // Ignore invalid localStorage data
      }
    }

    // Auto-refresh pricing when cart items change (with debounce)
    let debounceTimer: any;
    effect(() => {
      this.cartItems(); // Track changes
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Skip effect if explicit call was made during initialization
        if (this.skipNextEffectCall) {
          this.skipNextEffectCall = false;
          return;
        }
        // Only refresh if we have items
        if (this.cartItems().length > 0) {
          this.loadCheckoutSummary(true);
        }
      }, 500); // 500ms debounce
    });
  }

  // Initialize checkout with cart items
  initializeCheckout(items: CartItem[]) {
    this.skipNextEffectCall = true;
    this.cartItemsSignal.set([...items]);
    this.loadCheckoutSummary(true);
  }

  // Update cart items
  setCartItems(items: CartItem[]) {
    this.cartItemsSignal.set([...items]);
  }

  // Save address (called when user clicks Next on address step)
  saveAddress(address: CheckoutAddress) {
    this.addressSignal.set({ ...address });
    // Persist to localStorage for recovery on page reload
    this.platform.localStorage.setItem('checkout_address', JSON.stringify(address));
  }

  // Get current address
  getAddress(): CheckoutAddress {
    return this.addressSignal();
  }

  // Load pricing summary from backend with robust error handling and retry
  // forceRefresh: skip cache even if fresh data exists
  // promoCode: undefined → keep currently applied code; '' → remove code
  async loadCheckoutSummary(forceRefresh = false, promoCode?: string): Promise<CheckoutSummary | null> {
    const items = this.cartItems();
    if (items.length === 0) {
      this.summaryDataSignal.set(null);
      return null;
    }

    // Resolve the promo code for this refresh and remember it so later
    // refreshes (qty change, step change, payment) use the same code.
    const effectivePromo = (promoCode === undefined ? this.appliedPromoCodeSignal() : promoCode)
      .trim()
      .toUpperCase();

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
      // Retry logic: exponential backoff, max 3 attempts
      let lastError: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Always send current items in body (temporary cart or updated quantities)
          const body: Record<string, any> = { items };
          if (effectivePromo) {
            body['promoCode'] = effectivePromo;
          }
          const selectedOfferId = this.getSelectedOfferId();
          if (selectedOfferId && !effectivePromo) {
            body['offerId'] = selectedOfferId;
          }

          const response = await this.http
            .post<
              ApiResponse<CheckoutSummary>
            >(`${this.api}/checkout/summary`, body, { headers: this.headers() })
            .toPromise();

          if (response?.data) {
            this.summaryDataSignal.set(response.data);
            this.lastSummaryFetchTime.set(now);
            this.summaryErrorSignal.set(null);
            // Persist the promo only when the backend accepted it
            if (effectivePromo && !response.data.promoError) {
              this.appliedPromoCodeSignal.set(effectivePromo);
            } else {
              this.appliedPromoCodeSignal.set('');
            }
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
    this.selectedOfferSignal.set(null);
    this.offersSignal.set([]);
    this.appliedPromoCodeSignal.set('');
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
    // Only send X-Session-ID for guests; logged-in users use JWT
    if (this.auth.isLoggedIn()) {
      return new HttpHeaders();
    }
    return new HttpHeaders({ 'X-Session-ID': this.platform.localStorage.getItem('guestSessionId') ?? '' });
  }
}
