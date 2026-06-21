import { Component, inject, signal, output, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CheckoutService, CheckoutAddress } from '../../../../core/services/checkout.service';
import { AddressService, Address } from '../../../../core/services/address.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CartStore } from '../../../../core/services/cart.store';
import { SavedAddressesComponent } from './saved-addresses.component';
import { ButtonComponent } from '../../../../../shared/components/button/button.component';

@Component({
  selector: 'app-address-step',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SavedAddressesComponent, ButtonComponent],
  templateUrl: './address-step.component.html',
  styleUrls: ['./address-step.component.scss'],
})
export class AddressStepComponent implements OnInit {
  private readonly checkoutService = inject(CheckoutService);
  private readonly addressService = inject(AddressService);
  private readonly auth = inject(AuthService);
  private readonly cartStore = inject(CartStore);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  // Outputs
  readonly prevStep = output<void>();
  readonly nextStep = output<void>();

  // Form
  readonly form = this.fb.group({
    email: ['', [Validators.email]],
    pincode: ['', [Validators.required, Validators.pattern(/^[1-9]\d{5}$/)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    address: ['', [Validators.required, Validators.minLength(5)]],
    landmark: [''],
    city: ['', [Validators.required, Validators.minLength(2)]],
    state: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
  });

  // Signals
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly isLoadingAddresses = signal(false);
  readonly pincodeSuggestions = signal<any[]>([]);
  readonly showSuggestions = signal(false);
  readonly selectedPincodeData = signal<any>(null);
  readonly savedAddresses = signal<Address[]>([]);
  readonly selectedAddressId = signal<string | null>(null);

  // Cart signals
  readonly cartSubtotal = this.checkoutService.cartSubtotal;
  readonly cartDiscount = this.checkoutService.cartDiscount;
  readonly cartTax = this.checkoutService.cartTax;
  readonly cartTotal = this.checkoutService.cartTotal;

  private allPincodes: any[] = [];

  ngOnInit() {
    // Load pincode data
    this.http.get<any[]>('/pincodes.json').subscribe({
      next: (data) => {
        this.allPincodes = data;
      },
      error: (error) => {
        console.error('Failed to load pincodes:', error);
      }
    });

    // Load saved addresses if authenticated
    if (this.auth.isLoggedIn()) {
      this.loadSavedAddresses();
    }

    // Load address from localStorage with validation
    const saved = localStorage.getItem('checkout_address');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.populateFormFromAddress(data);
      } catch (e) {
        localStorage.removeItem('checkout_address');
      }
    }

    // Load user profile to populate email
    if (this.auth.isLoggedIn()) {
      const user = this.auth.user();
      if (user?.email) {
        this.form.get('email')?.setValue(user.email, { emitEvent: false });
      }
    }
  }

  private loadSavedAddresses() {
    this.isLoadingAddresses.set(true);
    this.addressService.getAddresses().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.savedAddresses.set(response.data);

          // Auto-select default address if available
          const defaultAddress = response.data.find(addr => addr.isDefault);
          if (defaultAddress) {
            this.selectAddress(defaultAddress);
          }
        }
        this.isLoadingAddresses.set(false);
      },
      error: (error) => {
        console.error('Failed to load addresses:', error);
        this.submitError.set('Failed to load saved addresses');
        this.isLoadingAddresses.set(false);
      }
    });
  }

  private populateFormFromAddress(data: any) {
    const phonePattern = /^[6-9]\d{9}$/;
    const pincodePattern = /^[1-9]\d{5}$/;

    if (data.phone && !phonePattern.test(data.phone)) {
      localStorage.removeItem('checkout_address');
      return;
    }
    if (data.pinCode && !pincodePattern.test(data.pinCode)) {
      localStorage.removeItem('checkout_address');
      return;
    }

    this.form.patchValue({
      name: data.name || '',
      phone: data.phone || '',
      pincode: data.pinCode || '',
      address: data.address || '',
      landmark: data.landmark || '',
      city: data.city || '',
      state: data.state || '',
      email: data.email || '',
    }, { emitEvent: false });
  }

  selectAddress(address: Address) {
    this.selectedAddressId.set(address._id || null);
    this.form.patchValue({
      name: '',
      phone: address._id ? '' : '',
      pincode: address.pinCode,
      address: address.address,
      landmark: address.landmark || '',
      city: address.city,
      state: address.state,
    }, { emitEvent: false });
  }

  onPincodeInput(value: string) {
    if (!value || value.length < 2) {
      this.pincodeSuggestions.set([]);
      this.showSuggestions.set(false);
      return;
    }

    try {
      const filtered = this.allPincodes.filter((p: any) =>
        p.pincode.toString().includes(value)
      ).slice(0, 3);
      this.pincodeSuggestions.set(filtered);
      this.showSuggestions.set(filtered.length > 0);
    } catch (error) {
      console.error('Error filtering pincodes:', error);
      this.pincodeSuggestions.set([]);
      this.showSuggestions.set(false);
    }
  }

  selectPincode(pincode: any) {
    const pincodeStr = pincode.pincode ? (pincode.pincode + '') : '';
    this.form.patchValue({
      pincode: pincodeStr,
      city: pincode.districtName || '',
      state: pincode.stateName || '',
    });
    this.showSuggestions.set(false);
    this.pincodeSuggestions.set([]);
  }

  saveAddress() {
    this.submitError.set('');

    if (!this.form.valid) {
      this.submitError.set('Please fill all fields correctly');
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.form.value;

    const address: CheckoutAddress = {
      name: formValue.name!,
      phone: formValue.phone!,
      pinCode: formValue.pincode!,
      address: formValue.address!,
      landmark: formValue.landmark || '',
      city: formValue.city!,
      state: formValue.state!,
    };

    // If user is authenticated, save to backend, otherwise use localStorage
    if (this.auth.isLoggedIn()) {
      const backendAddress: Address = {
        label: `${formValue.city} - ${(formValue.address || '').substring(0, 20)}`,
        address: formValue.address!,
        landmark: formValue.landmark || undefined,
        city: formValue.city!,
        state: formValue.state!,
        pinCode: formValue.pincode!,
      };

      this.addressService.addAddress(backendAddress).subscribe({
        next: () => {
          this.checkoutService.saveAddress(address);
          localStorage.setItem('checkout_address', JSON.stringify({ ...address, email: formValue.email || '' }));
          this.isSubmitting.set(false);
          this.nextStep.emit();
        },
        error: (error) => {
          console.error('Failed to save address:', error);
          this.submitError.set('Failed to save address. Please try again.');
          this.isSubmitting.set(false);
        }
      });
    } else {
      // Guest checkout
      this.checkoutService.saveAddress(address);
      localStorage.setItem('checkout_address', JSON.stringify({ ...address, email: formValue.email || '' }));
      this.isSubmitting.set(false);
      this.nextStep.emit();
    }
  }

  goBack() {
    this.prevStep.emit();
  }

  onAddressSelected(address: CheckoutAddress) {
    this.form.patchValue({
      name: address.name,
      phone: address.phone,
      pincode: address.pinCode,
      address: address.address,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
    });
  }
}
