import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckoutService } from '../../../../core/services/checkout.service';

@Component({
  selector: 'app-cart-step',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cart-step.component.html',
  styleUrls: ['./cart-step.component.scss'],
})
export class CartStepComponent {
  readonly checkoutService = inject(CheckoutService);

  // Outputs
  readonly nextStep = output<void>();

  // Signals from checkout service
  readonly cartItems = this.checkoutService.cartItems;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTotal = this.checkoutService.cartTotal;

  // Local state
  readonly promoCode = signal('');

  // Computed
  readonly isEmpty = computed(() => this.cartItems().length === 0);
  readonly canProceed = computed(
    () => !this.isEmpty() && !this.checkoutService.summaryLoading()
  );

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
