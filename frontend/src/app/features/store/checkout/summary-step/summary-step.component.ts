import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CheckoutService } from '../../../../core/services/checkout.service';
import { PaymentStore } from '../../../../core/services/payment.store';
import { RazorpayService } from '../../../../core/services/razorpay.service';
import { CartStore } from '../../../../core/services/cart.store';
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
  private readonly http = inject(HttpClient);
  private readonly cartStore = inject(CartStore);
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
      // Step 1: Create order on backend
      const address = this.address();
      const phone = address.phone.replace(/\D/g, '').slice(-10); // Get last 10 digits only

      const orderResponse = await this.http
        .post<any>(`${environment.apiUrl}/payments/orders`, {
          address: {
            ...address,
            phone,
          },
          walletAmount: 0,
        }, {
          headers: {
            'X-Session-ID': this.cartStore.sessionId,
          },
        })
        .toPromise();

      const orderId = orderResponse?.data?.id;
      if (!orderId) {
        throw new Error('Failed to create order');
      }

      // Step 2: Open Razorpay with real order ID
      await this.razorpayService.openCheckout({
        orderId,
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
