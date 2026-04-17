import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';
import { CheckoutService } from '../../../core/services/checkout.service';

@Component({
  selector: 'app-cart-step',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cart-step.component.html',
  styleUrls: ['./cart-step.component.scss'],
})
export class CartStepComponent {
  private readonly cartStore = inject(CartStore);
  private readonly checkoutService = inject(CheckoutService);

  // Outputs
  readonly nextStep = output<void>();

  // Signals from checkout service
  readonly cartItems = this.checkoutService.cartItems;
  readonly isBuyNow = this.checkoutService.isBuyNow;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTotal = this.checkoutService.cartTotal;

  // Local state
  readonly promoCode = signal('');

  // Computed
  readonly isEmpty = computed(() => this.cartItems().length === 0);

  ngOnInit() {
    // Initialize checkout service with current cart or buy-now item
    if (this.isBuyNow()) {
      // Buy-now: cartItems already set by caller
    } else {
      // Regular checkout: load from cart store
      this.checkoutService.setCartItems(this.cartStore.cartItems());
    }
  }

  updateQty(productId: string, newQty: number, variantId?: string) {
    if (newQty < 1 || newQty > 10) return;

    const items = this.cartItems().map((item) =>
      item.productId === productId && item.variantId === variantId
        ? { ...item, qty: newQty, lineTotal: item.basePrice * 0.9 * newQty }
        : item
    );
    this.checkoutService.setCartItems(items);
  }

  removeItem(productId: string, variantId?: string) {
    if (this.isBuyNow()) return; // Can't remove in buy-now

    const items = this.cartItems().filter(
      (item) => !(item.productId === productId && item.variantId === variantId)
    );
    this.checkoutService.setCartItems(items);
  }

  applyPromo() {
    // TODO: Implement promo code logic
    console.log('Promo code applied:', this.promoCode());
  }

  goNext() {
    if (this.isEmpty()) return;
    this.nextStep.emit();
  }
}
