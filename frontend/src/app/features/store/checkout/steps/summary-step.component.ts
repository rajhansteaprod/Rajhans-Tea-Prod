import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CheckoutService } from '../../../core/services/checkout.service';
import { PaymentStore } from '../../../core/services/payment.store';

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
    this.isPlacing.set(true);
    this.placeOrderClick.emit();
  }
}
