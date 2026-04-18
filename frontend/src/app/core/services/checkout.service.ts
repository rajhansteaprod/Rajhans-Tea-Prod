import { Injectable, signal, computed } from '@angular/core';
import { CartItem } from './cart.store';

export interface CheckoutAddress {
  name: string;
  phone: string;
  pincode: string;
  street: string;
  city: string;
  state: string;
}

export interface CheckoutState {
  cartItems: CartItem[];
  address: CheckoutAddress;
}

const emptyAddress = (): CheckoutAddress => ({
  name: '',
  phone: '',
  pincode: '',
  street: '',
  city: '',
  state: '',
});

@Injectable({
  providedIn: 'root',
})
export class CheckoutService {
  // State signals
  private cartItemsSignal = signal<CartItem[]>([]);
  private addressSignal = signal<CheckoutAddress>(emptyAddress());

  // Public readonly accessors
  readonly cartItems = this.cartItemsSignal.asReadonly();
  readonly address = this.addressSignal.asReadonly();

  // Computed values
  readonly cartSubtotal = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.lineTotal, 0)
  );

  readonly cartDiscount = computed(() => this.cartSubtotal() * 0.1);

  readonly cartTotal = computed(() => this.cartSubtotal() - this.cartDiscount());

  // Initialize checkout with cart items
  initializeCheckout(items: CartItem[]) {
    this.cartItemsSignal.set([...items]);
  }

  // Update cart items
  setCartItems(items: CartItem[]) {
    this.cartItemsSignal.set([...items]);
  }

  // Save address (called when user clicks Next on address step)
  saveAddress(address: CheckoutAddress) {
    this.addressSignal.set({ ...address });
  }

  // Get current address
  getAddress(): CheckoutAddress {
    return this.addressSignal();
  }

  // Reset checkout state
  resetCheckout() {
    this.cartItemsSignal.set([]);
    this.addressSignal.set(emptyAddress());
    
  }

  // Get full state (for debugging/persistence)
  getState(): CheckoutState {
    return {
      cartItems: this.cartItems(),
      address: this.address(),
    };
  }
}
