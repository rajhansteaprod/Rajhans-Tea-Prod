import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';
import { CatalogService, Product } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-cart-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cart-sidebar.html',
  styleUrls: ['./cart-sidebar.scss'],
})
export class CartSidebarComponent {
  readonly cart = inject(CartStore);
  readonly catalogService = inject(CatalogService);

  private readonly productCache = signal<Map<string, Product>>(new Map());

  constructor() {
    // Auto-load products with variants for all cart items
    effect(() => {
      const items = this.cart.cartItems();
      const uniqueProductIds = [...new Set(items.map(i => i.productId))];

      for (const productId of uniqueProductIds) {
        this.getProductWithVariants(productId);
      }
    });
  }

  getVariantsForProduct(productId: string) {
    return this.productCache().get(productId)?.variants || [];
  }

  private async getProductWithVariants(productId: string): Promise<Product | undefined> {
    const cache = this.productCache();
    if (cache.has(productId)) {
      return cache.get(productId);
    }

    try {
      const res = await this.catalogService.getProduct(productId).toPromise();
      if (res?.data) {
        const newCache = new Map(cache);
        newCache.set(productId, res.data);
        this.productCache.set(newCache);
        return res.data;
      }
    } catch (error) {
      console.error('Failed to fetch product:', error);
    }
    return undefined;
  }

  async changeVariant(productId: string, oldVariantId: string | undefined, newVariantId: string) {
    const product = await this.getProductWithVariants(productId);
    if (!product?.variants) return;

    const selectedVariant = product.variants.find(v => v._id === newVariantId);
    if (!selectedVariant) return;

    // Update cart with new variant
    this.cart.removeItem(productId, oldVariantId);
    this.cart.addItem(productId, 1, newVariantId, false);
  }
}
