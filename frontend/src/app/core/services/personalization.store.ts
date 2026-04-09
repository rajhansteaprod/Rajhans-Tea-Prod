import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Product } from './catalog.service';
import { PlatformService } from './platform.service';

export interface Banner { _id: string; title: string; subtitle: string | null; image: string; link: string | null; }
export interface FeedSection { key: string; title: string; products: Product[]; }
export interface HomeFeed { banners: Banner[]; sections: FeedSection[]; }
export interface ProductRecommendations { frequentlyBoughtTogether: Product[]; similar: Product[]; alsoViewed: Product[]; }

interface ApiResponse<T> { success: boolean; data: T; }

@Injectable({ providedIn: 'root' })
export class PersonalizationStore {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(PlatformService);
  private readonly api = environment.apiUrl;

  readonly feed = signal<HomeFeed | null>(null);
  readonly feedLoading = signal(false);
  readonly productRecos = signal<ProductRecommendations | null>(null);
  readonly crossSell = signal<Product[]>([]);

  private get sessionId(): string {
    return this.platform.localStorage.getItem('guestSessionId') || '';
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Session-ID': this.sessionId });
  }

  loadHomeFeed(): void {
    this.feedLoading.set(true);
    this.http.get<ApiResponse<HomeFeed>>(`${this.api}/personalization/feed`, { headers: this.headers() }).subscribe({
      next: (res) => { this.feed.set(res.data); this.feedLoading.set(false); },
      error: () => this.feedLoading.set(false),
    });
  }

  trackProductView(productId: string): void {
    this.http.post(`${this.api}/personalization/track-view`, { productId }, { headers: this.headers() }).subscribe();
    // Also save to localStorage
    const key = 'recentlyViewed';
    const stored: { productId: string; ts: number }[] = JSON.parse(this.platform.localStorage.getItem(key) || '[]');
    const filtered = stored.filter((s) => s.productId !== productId);
    filtered.unshift({ productId, ts: Date.now() });
    this.platform.localStorage.setItem(key, JSON.stringify(filtered.slice(0, 30)));
  }

  loadProductRecommendations(productId: string): void {
    this.http.get<ApiResponse<ProductRecommendations>>(`${this.api}/personalization/product/${productId}/recommendations`, { headers: this.headers() }).subscribe({
      next: (res) => this.productRecos.set(res.data),
    });
  }

  loadCrossSellForCart(productIds: string[]): void {
    if (productIds.length === 0) { this.crossSell.set([]); return; }
    this.http.get<ApiResponse<Product[]>>(`${this.api}/personalization/cart/cross-sell?productIds=${productIds.join(',')}`, { headers: this.headers() }).subscribe({
      next: (res) => this.crossSell.set(res.data),
    });
  }
}
