import { Component, inject, signal, computed, effect, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CheckoutService, Offer } from '../../../../core/services/checkout.service';

@Component({
  selector: 'app-offer-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './offer-cards.component.html',
  styleUrls: ['./offer-cards.component.scss'],
})
export class OfferCardsComponent {
  private readonly checkoutService = inject(CheckoutService);

  readonly offers = this.checkoutService.offers;
  readonly selectedOffer = this.checkoutService.selectedOffer;
  readonly offersLoading = this.checkoutService.offersLoading;
  readonly cartSubtotal = this.checkoutService.cartSubtotal;

  readonly offerSelected = output<Offer | null>();

  readonly isEmpty = computed(() => this.offers().length === 0 && !this.offersLoading());
  readonly showLoading = computed(() => this.offersLoading());

  // Calculate best offer (max savings)
  readonly bestOfferId = computed(() => {
    const cartTotal = this.cartSubtotal();
    const offers = this.offers();
    if (offers.length === 0 || cartTotal === 0) return null;

    let bestOffer = offers[0];
    let maxSavings = this.calculateSavings(bestOffer, cartTotal);

    for (const offer of offers.slice(1)) {
      const savings = this.calculateSavings(offer, cartTotal);
      if (savings > maxSavings) {
        maxSavings = savings;
        bestOffer = offer;
      }
    }

    return bestOffer._id;
  });

  constructor() {
    // Load offers when cart subtotal changes
    effect(() => {
      const subtotal = this.cartSubtotal();
      if (subtotal > 0) {
        this.checkoutService.loadOffers();
      } else {
        this.checkoutService.deselectOffer();
      }
    });
  }

  calculateSavings(offer: Offer, cartTotal: number): number {
    if (cartTotal < offer.minOrderAmount) return 0;

    let savings = 0;
    if (offer.valueType === 'percentage') {
      savings = (cartTotal * offer.value) / 100;
      if (offer.maxCap) {
        savings = Math.min(savings, offer.maxCap);
      }
    } else if (offer.valueType === 'fixed') {
      savings = Math.min(offer.value, cartTotal);
    }

    return Math.round(savings);
  }

  selectOffer(offer: Offer) {
    this.checkoutService.selectOffer(offer);
    this.offerSelected.emit(offer);
  }

  deselectOffer() {
    this.checkoutService.deselectOffer();
    this.offerSelected.emit(null);
  }

  toggleOffer(offer: Offer) {
    if (this.selectedOffer()?._id === offer._id) {
      this.deselectOffer();
    } else {
      this.selectOffer(offer);
    }
  }

  isBestOffer(offerId: string): boolean {
    return offerId === this.bestOfferId();
  }

  isSelected(offerId: string): boolean {
    return this.selectedOffer()?._id === offerId;
  }

  getFormattedDiscount(offer: Offer): string {
    const cartTotal = this.cartSubtotal();
    if (cartTotal < offer.minOrderAmount) return '—';

    if (offer.valueType === 'percentage') {
      return `${offer.value}%`;
    } else {
      return `₹${offer.value}`;
    }
  }

  getFormattedSavings(offer: Offer): string {
    const savings = this.calculateSavings(offer, this.cartSubtotal());
    return `₹${savings}`;
  }
}
