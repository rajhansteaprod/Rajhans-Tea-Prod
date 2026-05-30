import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';
import { CatalogService, Product } from '../../../core/services/catalog.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './wishlist-page.html',
  styleUrls: ['./wishlist-page.scss'],
})
export class WishlistPageComponent implements OnInit {
  readonly cart = inject(CartStore);
  readonly catalogService = inject(CatalogService);

  private readonly productCache = signal<Map<string, Product>>(new Map());
  readonly cachedProducts = computed(() => this.productCache());

  constructor() {
    effect(() => {
      const items = this.cart.wishlistItems();
      const uniqueSlugs = [...new Set(items.map((i: any) => i.slug))];
      for (const slug of uniqueSlugs) {
        this.getProductWithVariants(slug);
      }
    });
  }

  ngOnInit(): void {
    this.cart.loadWishlist();
  }

  async getProductWithVariants(slug: string): Promise<Product | undefined> {
    const cache = this.productCache();
    if (cache.has(slug)) {
      return cache.get(slug);
    }

    try {
      const res = await this.catalogService.getProductBySlug(slug).toPromise();
      if (res?.data) {
        const newCache = new Map(cache);
        newCache.set(slug, res.data);
        this.productCache.set(newCache);
        return res.data;
      }
    } catch (error) {
      console.error('Failed to fetch product:', error);
    }
    return undefined;
  }

  getProductBySlug(slug: string): Product | undefined {
    return this.cachedProducts().get(slug);
  }

  onToggleWishlist(productId: string): void {
    this.cart.toggleWishlist(productId);
  }

  onAddToCart(data: { event: Event; variantId?: string }, productId: string): void {
    this.cart.addItem(productId, 1, data.variantId);
  }

  onBuyNow(data: { event: Event; variantId?: string }, product: Product): void {
    // For buy now, navigate to product page or handle directly
    this.cart.addItem(product._id, 1, data.variantId);
  }
}
