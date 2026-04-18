import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { PaymentStore } from '../../../../core/services/payment.store';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
})
export class SummaryStepComponent {
  private readonly checkoutService = inject(CheckoutService);
  readonly payment = inject(PaymentStore);

  // Outputs
  readonly prevStep = output<void>();
  readonly placeOrderClick = output<void>();

  // Signals
  readonly isPlacing = signal(false);
  readonly selectedPaymentMethod = signal<'card' | 'upi' | 'razorpay'>('razorpay');
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

  selectPaymentMethod(method: 'card' | 'upi' | 'razorpay') {
    this.selectedPaymentMethod.set(method);
  }

  placeOrder() {
    this.orderError.set('');

    if (!this.address().name) {
      this.orderError.set('Please select a delivery address');
      return;
    }

    if (!this.selectedPaymentMethod()) {
      this.orderError.set('Please select a payment method');
      return;
    }

    this.isPlacing.set(true);

    if (this.selectedPaymentMethod() === 'razorpay') {
      this.openRazorpay();
    } else {
      this.processOrder();
    }
  }

  private openRazorpay() {
    const options = {
      key: 'YOUR_RAZORPAY_KEY_ID',
      amount: this.cartTotal() * 100,
      currency: 'INR',
      name: 'Rajhans Tea',
      description: 'Order Payment',
      order_id: 'order_' + Date.now(),
      handler: () => {
        this.processOrder();
      },
      onClose: () => {
        this.isPlacing.set(false);
        this.orderError.set('Payment cancelled. Please try again.');
      },
    };

    if (window.Razorpay) {
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    }
  }

  private processOrder() {
    this.isPlacing.set(true);
    setTimeout(() => {
      this.placeOrderClick.emit();
    }, 500);
  }
}
