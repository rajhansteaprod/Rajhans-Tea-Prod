import { Component, inject, signal, computed, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { InputComponent } from '../../../../../shared/components/input/input.component';

@Component({
  selector: 'app-cart-step',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonComponent, InputComponent],
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
  readonly promoError = signal('');
  readonly promoSuccess = signal('');
  readonly isValidatingPromo = signal(false);
  readonly isPromoApplied = signal(false);
  private readonly productCache = signal<Map<string, Product>>(new Map());

  // Computed
  readonly isEmpty = computed(() => this.cartItems().length === 0);
  readonly canProceed = computed(
    () => !this.isEmpty() && !this.checkoutService.summaryLoading()
  );

  constructor() {
    // Auto-load products with variants for all cart items (using public endpoint)
    effect(() => {
      const items = this.cartItems();
      const uniqueSlugs = [...new Set(items.map(i => i.slug))];

      for (const slug of uniqueSlugs) {
        this.getProductWithVariants(slug);
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
    const code = this.promoCode().trim().toUpperCase();
    if (!code) {
      this.promoError.set('Please enter a promo code');
      this.promoSuccess.set('');
      return;
    }

    this.isValidatingPromo.set(true);
    this.promoError.set('');
    this.promoSuccess.set('');

    // Call summary API with promo code - it will validate and recalculate
    this.checkoutService.loadCheckoutSummary(true, code).then((summary) => {
      this.isValidatingPromo.set(false);
      if (summary?.promoError) {
        // Promo validation failed - show error
        this.promoError.set(summary.promoError);
        this.promoSuccess.set('');
        this.isPromoApplied.set(false);
      } else if (summary) {
        // Promo applied successfully
        this.promoSuccess.set('✓ Promo code applied successfully');
        this.promoError.set('');
        this.isPromoApplied.set(true);
      } else {
        this.promoError.set('Failed to apply promo code');
        this.promoSuccess.set('');
        this.isPromoApplied.set(false);
      }
    }).catch((error) => {
      this.isValidatingPromo.set(false);
      this.promoError.set(error?.error?.message || 'Invalid promo code');
      this.promoSuccess.set('');
      this.isPromoApplied.set(false);
    });
  }

  removePromo() {
    this.promoCode.set('');
    this.isPromoApplied.set(false);
    this.promoError.set('');
    this.promoSuccess.set('');
    this.isValidatingPromo.set(true);

    // Reload summary without promo code
    this.checkoutService.loadCheckoutSummary(true, '').then(() => {
      this.isValidatingPromo.set(false);
    }).catch((error) => {
      this.isValidatingPromo.set(false);
      console.error('Failed to remove promo code:', error);
    });
  }

  async goNext() {
    if (this.isEmpty()) return;

    // Load summary with promo code before proceeding
    await this.checkoutService.loadCheckoutSummary(true, this.promoCode());
    this.nextStep.emit();
  }
}
