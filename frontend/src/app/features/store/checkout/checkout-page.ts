import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { CartStore } from '../../../core/services/cart.store';
import { CheckoutService } from '../../../core/services/checkout.service';
import { CartStepComponent } from './cart-step/cart-step.component';
import { AddressStepComponent } from './address-step/address-step.component';
import { SummaryStepComponent } from './summary-step/summary-step.component';

type Step = 'cart' | 'address' | 'summary';

interface StepConfig {
  key: Step;
  label: string;
}

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CartStepComponent,
    AddressStepComponent,
    SummaryStepComponent,
  ],
  templateUrl: './checkout-page.html',
  styleUrls: ['./checkout-page.scss'],
})
export class CheckoutPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cartStore = inject(CartStore);
  readonly checkoutService = inject(CheckoutService);

  // Step configuration
  readonly steps: StepConfig[] = [
    { key: 'cart', label: 'Cart' },
    { key: 'address', label: 'Address' },
    { key: 'summary', label: 'Summary' },
  ];

  // Current step from query param
  readonly currentStep = signal<Step>('cart');

  // Step completion tracking
  readonly isCartDone = computed(() => this.checkoutService.cartItems().length > 0);
  readonly isAddressDone = computed(() => !!this.checkoutService.address().name);

  ngOnInit() {
    // Load cart once and initialize checkout
    this.cartStore.loadCart().subscribe(() => {
      const tempCart = this.cartStore.getTemporaryCart();
      const sessionCart = this.cartStore.cartItems();

      const checkoutItems = tempCart.length > 0 ? tempCart : sessionCart;
      console.log('✅ Cart loaded. Items:', checkoutItems.length);

      if (checkoutItems.length === 0) {
        console.log('❌ No items found, redirecting to /products');
        this.router.navigate(['/products']);
        return;
      }

      // Initialize checkout once
      this.checkoutService.initializeCheckout(checkoutItems);
    });

    // Separately listen to route changes (doesn't re-initialize)
    this.route.queryParamMap.subscribe((params) => {
      const step = (params.get('step') as Step) || 'cart';
      if (['cart', 'address', 'summary'].includes(step)) {
        this.currentStep.set(step);
      } else {
        this.currentStep.set('cart');
      }
    });
  }

  // Navigation handlers from child components
  goToStep(step: Step) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step },
      queryParamsHandling: 'merge',
    });
  }

  onCartNext() {
    this.goToStep('address');
  }

  onAddressPrev() {
    this.goToStep('cart');
  }

  onAddressNext() {
    this.goToStep('summary');
  }

  onSummaryPrev() {
    this.goToStep('address');
  }

  onPlaceOrder() {
    // TODO: Implement payment gateway integration
    console.log('Placing order:', this.checkoutService.getState());
  }

  isStepDone(step: Step): boolean {
    if (step === 'cart') return this.isCartDone();
    if (step === 'address') return this.isAddressDone();
    return false;
  }
}
