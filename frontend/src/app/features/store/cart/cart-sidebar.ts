import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';
import { CatalogService, Product } from '../../../core/services/catalog.service';
import { CheckoutService } from '../../../core/services/checkout.service';

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
  private readonly checkoutService = inject(CheckoutService);
  private readonly router = inject(Router);

  private readonly productCache = signal<Map<string, Product>>(new Map());

  constructor() {
    // Auto-load products with variants for all cart items (using public endpoint)
    effect(() => {
      const items = this.cart.cartItems();
      const uniqueSlugs = [...new Set(items.map(i => i.slug))];

      for (const slug of uniqueSlugs) {
        this.getProductWithVariants(slug);
      }
    });
  }

  getVariantsForProduct(productId: string) {
    return this.productCache().get(productId)?.variants || [];
  }

  private async getProductWithVariants(slug: string): Promise<Product | undefined> {
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

  async changeVariant(productId: string, oldVariantId: string | undefined, newVariantId: string) {
    const product = await this.getProductWithVariants(productId);
    if (!product?.variants) return;

    const selectedVariant = product.variants.find(v => v._id === newVariantId);
    if (!selectedVariant) return;

    // Update cart with new variant
    this.cart.removeItem(productId, oldVariantId);
    this.cart.addItem(productId, 1, newVariantId, false);
  }

  proceedToCheckout() {
    // Initialize checkout with current cart items and load summary from backend
    this.checkoutService.initializeCheckout(this.cart.cartItems());
    this.cart.closeSidebar();
    this.router.navigate(['/checkout']);
  }
}
