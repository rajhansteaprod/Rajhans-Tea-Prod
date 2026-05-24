import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { PaymentStore } from '../../../../core/services/payment.store';
import { CartStore } from '../../../../core/services/cart.store';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
})
export class SummaryStepComponent {
  readonly checkoutService = inject(CheckoutService);
  private readonly payment = inject(PaymentStore);
  private readonly cart = inject(CartStore);
  private readonly router = inject(Router);

  // Outputs
  readonly prevStep = output<void>();
  readonly placeOrderClick = output<void>();

  // Signals
  readonly isPlacing = signal(false);
  readonly orderError = signal('');
  readonly promoCode = signal('');
  readonly promoError = signal('');

  // Get data from service
  readonly cartItems = this.checkoutService.cartItems;
  readonly address = this.checkoutService.address;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTotal = this.checkoutService.cartTotal;

  goBack() {
    this.prevStep.emit();
  }

  async placeOrder() {
    this.orderError.set('');

    if (!this.address().name) {
      this.orderError.set('Please select a delivery address');
      return;
    }

    // Guard: ensure pricing is loaded from backend before payment
    if (!this.checkoutService.isPricingFromBackend()) {
      this.orderError.set('Pricing is not loaded. Please go back to cart and try again.');
      return;
    }

    this.isPlacing.set(true);
    
    try {
      this.promoError.set('');

      // ✅ Use PaymentStore.pay() which handles:
      // 1. Create order on backend
      // 2. Open Razorpay modal
      // 3. Verify payment signature (CRITICAL!)
      // 4. Update database
      const success = await this.payment.pay(
        this.address(),
        0, // walletAmount (can be added later)
        0, // loyaltyPoints (can be added later)
        this.promoCode().trim(),
        this.cartItems(), // Pass checkout items with updated quantities
      );

      if (success) {
        // ✅ Payment verified and captured by backend
        this.checkoutService.resetPricingCache(); // Reset cache for next checkout
        // Note: cart clearing is now handled in payment.store based on cartType
        this.placeOrderClick.emit();

        // Navigate to order confirmation page after short delay
        const paymentId = this.payment.lastPaymentId();
        setTimeout(() => {
          this.router.navigate(['/order-confirmation'], {
            queryParams: paymentId ? { paymentId } : {},
          });
        }, 300);
      } else {
        // ❌ Payment failed or cancelled
        this.orderError.set(this.payment.paymentError() || 'Payment failed. Please try again.');
        this.isPlacing.set(false);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      this.orderError.set(error.message || 'An error occurred. Please try again.');
      this.isPlacing.set(false);
    }
  }
}
