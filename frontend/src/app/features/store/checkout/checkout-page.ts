import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CartStore } from '../../core/services/cart.store';
import { CheckoutService } from '../../core/services/checkout.service';
import { CartStepComponent } from './steps/cart-step.component';
import { AddressStepComponent } from './steps/address-step.component';
import { SummaryStepComponent } from './steps/summary-step.component';

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
  private readonly checkoutService = inject(CheckoutService);

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
    // Initialize checkout with cart data
    this.initializeCheckout();

    // Listen to query param changes
    this.route.queryParamMap.subscribe((params) => {
      const step = (params.get('step') as Step) || 'cart';

      // Validate step
      if (['cart', 'address', 'summary'].includes(step)) {
        this.currentStep.set(step);
      } else {
        this.currentStep.set('cart');
      }
    });
  }

  private initializeCheckout() {
    // Check if this is a buy-now scenario
    this.route.queryParamMap.pipe().subscribe((params) => {
      const buyNowProduct = params.get('buyNow');

      if (buyNowProduct) {
        // Buy-now: will be set by the component that navigated here
        // For now, mark as buy-now and empty cart
        this.checkoutService.initializeCheckout([], true);
      } else {
        // Regular checkout: load from cart store
        const cartItems = this.cartStore.cartItems();
        if (cartItems.length === 0) {
          // No cart items, redirect to products
          this.router.navigate(['/products']);
        } else {
          this.checkoutService.initializeCheckout(cartItems, false);
        }
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
