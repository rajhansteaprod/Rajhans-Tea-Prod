import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  pairwise,
  filter,
  switchMap,
  startWith,
  Observable,
  tap,
  finalize,
  catchError,
  of,
  map,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { PlatformService } from './platform.service';
import { Product, ProductVariant } from './catalog.service';

// ─── API types (mirror backend) ───────────────────────────────────────────────

export interface CartItem {
  productId: string;
  variantId?: string;
  variantName?: string;
  variantPrice?: number;
  name: string;
  slug: string;
  image: string;
  basePrice: number;
  qty: number;
  lineTotal: number;
  shortDescription?: string;
  description?: string;
  price?: number;
  quantity?: number;
  discountedPrice?: number;
}

export interface CartView {
  sessionId: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
}

export interface WishlistItem {
  productId: string;
  name: string;
  slug: string;
  image: string;
  basePrice: number;
  status: string;
}

export interface WishlistView {
  sessionId: string;
  items: WishlistItem[];
  productIds: string[];
}

export interface CheckoutLineItem {
  productId: string;
  name: string;
  slug: string;
  image: string;
  qty: number;
  pricing: {
    basePrice: number;
    qty: number;
    discountPercent: number;
    discountAmount: number;
    priceAfterDiscount: number;
    taxRate: number;
    taxAmount: number;
    isInclusive: boolean;
    finalPrice: number;
    unitPrice: number;
    totalPrice: number;
    isOnSale: boolean;
    appliedRule: string | null;
  };
}

export interface CheckoutSummary {
  sessionId: string;
  items: CheckoutLineItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  itemCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ─── CartStore ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  private readonly api = environment.apiUrl;

  // ─── Session Management ────────────────────────────────────────────────────
  // For guests: guestSessionId (from localStorage)
  // For logged-in: userId (from auth service)
  // This is sent as X-Session-ID header to backend
  private readonly _sessionId = signal<string>(this.getOrCreateSessionId());

  // Expose sessionId as a getter that returns current signal value
  get sessionId(): string {
    return this._sessionId();
  }

  // ─── Signals ───────────────────────────────────────────────────────────────

  private readonly _cartItems = signal<CartItem[]>([]);
  private readonly _cartLoading = signal(false);
  private readonly _sidebarOpen = signal(false);

  private readonly _wishlistIds = signal<Set<string>>(new Set());
  private readonly _wishlistItems = signal<WishlistItem[]>([]);
  private readonly _wishlistLoading = signal(false);
  private readonly _merging = signal(false);

  // Temporary cart for buy-now flow (doesn't affect session cart)
  private readonly _temporaryCart = signal<CartItem[]>([]);
  private readonly _cartType = signal<'guest' | 'user' | 'temporary'>('guest');

  readonly cartItems = this._cartItems.asReadonly();
  readonly cartLoading = this._cartLoading.asReadonly();
  readonly sidebarOpen = this._sidebarOpen.asReadonly();
  readonly wishlistIds = this._wishlistIds.asReadonly();
  readonly wishlistItems = this._wishlistItems.asReadonly();
  readonly wishlistLoading = this._wishlistLoading.asReadonly();
  readonly merging = this._merging.asReadonly();
  readonly temporaryCart = this._temporaryCart.asReadonly();
  readonly cartType = this._cartType.asReadonly();

  readonly cartCount = computed(() => this._cartItems().reduce((s, i) => s + i.qty, 0));
  readonly cartSubtotal = computed(() => this._cartItems().reduce((s, i) => s + i.lineTotal, 0));
  readonly isWishlisted = (productId: string) => computed(() => this._wishlistIds().has(productId));

  // ─── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    this.loadCart().subscribe();
    this.loadTemporaryCart();
    this.loadWishlist();

    // AUTO-UPDATE sessionId when user logs in (guestSessionId → userId)
    // AND merge guest cart into user cart
    toObservable(this.auth.isLoggedIn)
      .pipe(
        startWith(false),
        pairwise(),
        filter(([prev, curr]) => !prev && curr), // false → true (login)
      )
      .subscribe(() => {
        const user = this.auth.user();
        if (user) {
          const guestSessionId = this._sessionId();
          // ✅ Keep using guestSessionId for merge request
          this._merging.set(true);

          // Merge guest cart into user cart (before switching sessionId!)
          this.http.post<ApiResponse<CartView>>(
            `${this.api}/cart/merge`,
            { guestSessionId },
            { headers: this.headers() },
          ).subscribe({
            next: (res) => {
              this.applyCart(res.data);
              // ✅ Only after merge succeeds, switch to userId
              this._sessionId.set(user._id);
              this._cartType.set('user');
              this._merging.set(false);
              this.loadWishlist();
            },
            error: () => {
              this._merging.set(false);
              // Keep using guestSessionId, try merge again
              this.loadCart();
            },
          });
        }
      });

    toObservable(this.auth.isLoggedIn)
      .pipe(
        startWith(false),
        pairwise(),
        filter(([prev, curr]) => !prev && curr),
        switchMap(() => {
          // ✅ Capture guestSessionId BEFORE any sessionId changes
          const guestSessionId = this._sessionId();
          return this.http.post<ApiResponse<WishlistView>>(
            `${this.api}/wishlist/merge`,
            { guestSessionId },
            { headers: this.headers() },
          );
        }),
      )
      .subscribe({
        next: (res) => this.applyWishlist(res.data),
        error: () => this.loadWishlist(),
      });
  }

  // ─── Cart Actions ──────────────────────────────────────────────────────────
  loadCart(): Observable<CartView> {
    this._cartLoading.set(true);
    return this.http
      .get<ApiResponse<CartView>>(`${this.api}/cart`, { headers: this.headers() })
      .pipe(
        map((res) => res.data),
        tap((data) => {
          this.applyCart(data);
          // Only update localStorage sessionId for guests, not for logged-in users
          if (data.sessionId && !this.auth.isLoggedIn()) {
            this.platform.localStorage.setItem('guestSessionId', data.sessionId);
          }
        }),
        finalize(() => this._cartLoading.set(false)),
        catchError(() => {
          this._cartLoading.set(false);
          return of({
            items: [],
            sessionId: this.sessionId,
            itemCount: 0,
            subtotal: 0,
          } as CartView);
        }),
      );
  }

  addItem(productId: string, qty = 1, variantId?: string, openSidebar = true, slug?: string): void {
    this._cartLoading.set(true);
    const body: Record<string, unknown> = { productId, qty };
    if (variantId) body['variantId'] = variantId;
    if (slug) body['slug'] = slug;

    this.http
      .post<ApiResponse<CartView>>(`${this.api}/cart/items`, body, { headers: this.headers() })
      .subscribe({
        next: (res) => {
          this.applyCart(res.data);
          this._cartLoading.set(false);
          if (openSidebar) this.openSidebar();
        },
        error: () => this._cartLoading.set(false),
      });
  }

  updateQty(productId: string, qty: number, variantId?: string): void {
    if (qty < 1) {
      this.removeItem(productId, variantId);
      return;
    }
    const body: Record<string, unknown> = { qty };
    if (variantId) body['variantId'] = variantId;

    this.http
      .put<
        ApiResponse<CartView>
      >(`${this.api}/cart/items/${productId}`, body, { headers: this.headers() })
      .subscribe({ next: (res) => this.applyCart(res.data) });
  }

  removeItem(productId: string, variantId?: string): void {
    const body: Record<string, unknown> = {};
    if (variantId) body['variantId'] = variantId;

    this.http
      .delete<
        ApiResponse<CartView>
      >(`${this.api}/cart/items/${productId}`, { body, headers: this.headers() })
      .subscribe({ next: (res) => this.applyCart(res.data) });
  }

  clearCart(): void {
    this.http
      .delete(`${this.api}/cart`, { headers: this.headers() })
      .subscribe({ next: () => this._cartItems.set([]) });
  }

  // ─── Buy Now (Temporary Cart) ──────────────────────────────────────────────

  buyNowItem(product: Product, qty = 1, variant?: ProductVariant): void {
    const basePrice = variant?.price ?? product.basePrice;
    const image = variant?.images?.[0] ?? product.images?.[0] ?? '';
    const variantName = variant?.name;

    const buyNowItem: CartItem = {
      productId: product._id,
      variantId: variant?._id,
      variantName,
      name: product.name,
      slug: product.slug,
      image,
      basePrice,
      discountedPrice: product.discountedPrice,
      qty,
      lineTotal: product!.discountedPrice? product!.discountedPrice * qty : basePrice * qty,
    };

    // Mark this as temporary cart for buy-now
    this._cartType.set('temporary');
    this.setTemporaryCart(buyNowItem);
  }

  setTemporaryCart(item: CartItem): void {
    this._temporaryCart.set([item]);
    this.platform.localStorage.setItem('tempCart', JSON.stringify([item]));
  }

  /**
   * Get temporary cart items
   */
  getTemporaryCart(): CartItem[] {
    return this._temporaryCart();
  }

  /**
   * Load temporary cart from localStorage
   */
  private loadTemporaryCart(): void {
    try {
      const stored = this.platform.localStorage.getItem('tempCart');
      if (stored) {
        const items = JSON.parse(stored) as CartItem[];
        this._temporaryCart.set(items);
      }
    } catch (error) {
      console.error('Failed to load temporary cart:', error);
    }
  }

  /**
   * Clear temporary cart (call after successful order)
   */
  clearTemporaryCart(): void {
    this._temporaryCart.set([]);
    this.platform.localStorage.removeItem('tempCart');
  }

  // ─── Sidebar ───────────────────────────────────────────────────────────────

  openSidebar(): void {
    this._sidebarOpen.set(true);
  }
  closeSidebar(): void {
    this._sidebarOpen.set(false);
  }
  toggleSidebar(): void {
    this._sidebarOpen.update((v) => !v);
  }

  // ─── Wishlist Actions ──────────────────────────────────────────────────────

  loadWishlist(): void {
    this._wishlistLoading.set(true);
    this.http
      .get<ApiResponse<WishlistView>>(`${this.api}/wishlist`, { headers: this.headers() })
      .subscribe({
        next: (res) => {
          this.applyWishlist(res.data);
          this._wishlistLoading.set(false);
        },
        error: () => this._wishlistLoading.set(false),
      });
  }

  addToCartFromWishlist(productId: string): void {
    this.addItem(productId, 1);
  }

  toggleWishlist(productId: string): void {
    this.http
      .post<
        ApiResponse<WishlistView>
      >(`${this.api}/wishlist/${productId}`, {}, { headers: this.headers() })
      .subscribe({ next: (res) => this.applyWishlist(res.data) });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private applyCart(data: CartView): void {
    this._cartItems.set(data.items ?? []);
  }

  private applyWishlist(data: WishlistView): void {
    this._wishlistItems.set(data.items ?? []);
    this._wishlistIds.set(new Set(data.productIds ?? []));
  }

  private headers(): HttpHeaders {
    // Only send X-Session-ID for guests; logged-in users use JWT
    if (this.auth.isLoggedIn()) {
      return new HttpHeaders();
    }
    return new HttpHeaders({ 'X-Session-ID': this.sessionId });
  }

  private getOrCreateSessionId(): string {
    const existing = this.platform.localStorage.getItem('guestSessionId');
    if (existing) return existing;
    const id = crypto.randomUUID();
    this.platform.localStorage.setItem('guestSessionId', id);
    return id;
  }
}
