import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { PaymentStore } from '../../../../core/services/payment.store';
import { RazorpayService } from '../../../../core/services/razorpay.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
})
export class SummaryStepComponent {
  private readonly checkoutService = inject(CheckoutService);
  private readonly razorpayService = inject(RazorpayService);
  readonly payment = inject(PaymentStore);

  // Outputs
  readonly prevStep = output<void>();
  readonly placeOrderClick = output<void>();

  // Signals
  readonly isPlacing = signal(false);
  readonly orderError = signal('');

  // Get data from service
  readonly cartItems = this.checkoutService.cartItems;
  readonly address = this.checkoutService.address;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTotal = this.checkoutService.cartTotal;

  goBack() {
    this.prevStep.emit();
  }

  placeOrder() {
    this.orderError.set('');

    if (!this.address().name) {
      this.orderError.set('Please select a delivery address');
      return;
    }

    this.isPlacing.set(true);
    this.openRazorpay();
  }

  private async openRazorpay() {
    try {
      await this.razorpayService.openCheckout({
        orderId: 'order_' + Date.now(),
        amountPaise: Math.round(this.cartTotal() * 100),
        currency: 'INR',
        keyId: environment.razorpayKeyId,
        prefill: {
          name: this.address().name,
          contact: this.address().phone,
        },
      });
      this.processOrder();
    } catch (error: any) {
      console.error('Razorpay error:', error);
      this.isPlacing.set(false);
      this.orderError.set(error.message || 'Payment failed. Please try again.');
    }
  }

  private processOrder() {
    setTimeout(() => {
      this.placeOrderClick.emit();
    }, 500);
  }
}
