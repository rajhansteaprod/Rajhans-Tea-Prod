import { Component, inject, signal, computed, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { CatalogService, Product } from '../../../../core/services/catalog.service';

@Component({
  selector: 'app-cart-step',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cart-step.component.html',
  styleUrls: ['./cart-step.component.scss'],
})
export class CartStepComponent {
  readonly checkoutService = inject(CheckoutService);
  readonly catalogService = inject(CatalogService);

  // Outputs
  readonly nextStep = output<void>();

  // Signals from checkout service
  readonly cartItems = this.checkoutService.cartItems;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTotal = this.checkoutService.cartTotal;

  // Local state
  readonly promoCode = signal('');
  private readonly productCache = signal<Map<string, Product>>(new Map());

  // Computed
  readonly isEmpty = computed(() => this.cartItems().length === 0);
  readonly canProceed = computed(
    () => !this.isEmpty() && !this.checkoutService.summaryLoading()
  );

  constructor() {
    // Auto-load products with variants for all cart items
    effect(() => {
      const items = this.cartItems();
      const uniqueProductIds = [...new Set(items.map(i => i.productId))];

      for (const productId of uniqueProductIds) {
        this.getProductWithVariants(productId);
      }
    });
  }

  getVariantsForProduct(productId: string) {
    return this.productCache().get(productId)?.variants || [];
  }

  updateQty(productId: string, newQty: number, variantId?: string) {
    if (newQty < 1 || newQty > 10) return;

    const items = this.cartItems().map((item) =>
      item.productId === productId && item.variantId === variantId
        ? { ...item, qty: newQty, lineTotal: item.basePrice * newQty }
        : item
    );

    // Just update items - effect in CheckoutService will auto-refresh pricing
    this.checkoutService.setCartItems(items);
  }

  removeItem(productId: string, variantId?: string) {
    const items = this.cartItems().filter(
      (item) => !(item.productId === productId && item.variantId === variantId)
    );
    this.checkoutService.setCartItems(items);
  }

  async getProductWithVariants(productId: string): Promise<Product | undefined> {
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

    const items = this.cartItems().map((item) => {
      if (item.productId === productId && item.variantId === oldVariantId) {
        return {
          ...item,
          variantId: newVariantId,
          variantName: selectedVariant.name,
          variantPrice: selectedVariant.price,
          discountedPrice: selectedVariant.discountedPrice,
          lineTotal: (selectedVariant.discountedPrice ?? selectedVariant.price) * item.qty,
        };
      }
      return item;
    });

    this.checkoutService.setCartItems(items);
  }

  applyPromo() {
    // TODO: Implement promo code logic
    console.log('Promo code applied:', this.promoCode());
  }

  async goNext() {
    if (this.isEmpty()) return;

    // Ensure pricing is loaded before proceeding
    if (!this.checkoutService.isPricingFromBackend()) {
      await this.checkoutService.loadCheckoutSummary(false);
    }

    this.nextStep.emit();
  }
}
