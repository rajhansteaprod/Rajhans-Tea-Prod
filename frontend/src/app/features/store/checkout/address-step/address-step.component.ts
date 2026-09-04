import { Component, inject, signal, output, OnInit, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
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
  protected readonly auth = inject(AuthService);
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

  // Computed: true if adding new address, false if using saved address
  readonly isNewAddress = computed(() => this.selectedAddressId() === null);

  // Reactive form status: form.invalid is NOT a signal, so it can't be read
  // directly inside a computed(). Bridge statusChanges into a signal so the
  // button state re-evaluates as the user fills the form.
  readonly formStatus = toSignal(
    this.form.statusChanges.pipe(startWith(this.form.status)),
    { initialValue: this.form.status }
  );

  // Computed: button disabled state (prevents flicker by being strict)
  readonly isButtonDisabled = computed(() => {
    // Always disabled while submitting
    if (this.isSubmitting()) return true;
    // If new address: form must be valid
    if (this.isNewAddress()) return this.formStatus() === 'INVALID';
    // If saved address: always enabled (it's already saved)
    return false;
  });

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
        if (data._id) {
          this.selectedAddressId.set(data._id);
        }
      } catch (e) {
        localStorage.removeItem('checkout_address');
      }
    }

    // Load user profile to populate email, name, and phone
    if (this.auth.isLoggedIn()) {
      const user = this.auth.user();
      if (user) {
        if (user.email && !this.form.get('email')?.value) {
          this.form.get('email')?.setValue(user.email, { emitEvent: false });
        }
        if ((user.firstName || user.lastName) && !this.form.get('name')?.value) {
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
          this.form.get('name')?.setValue(fullName, { emitEvent: false });
        }
        if (user.phone && !this.form.get('phone')?.value) {
          let cleanPhone = user.phone;
          if (cleanPhone.startsWith('+91')) {
            cleanPhone = cleanPhone.substring(3);
          }
          this.form.get('phone')?.setValue(cleanPhone, { emitEvent: false });
        }
      }
    }

    // Programmatic population above used { emitEvent: false }, which does not
    // fire statusChanges. Force one emission so formStatus reflects the
    // populated values and the submit button enables without needing a keystroke.
    this.form.updateValueAndValidity();
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
      name: address.name || '',
      phone: address.phone || '',
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
      this.submitError.set('Please Add a New Address');
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.form.value;

    const address: CheckoutAddress = {
      _id: this.selectedAddressId() || undefined,
      name: formValue.name!,
      phone: formValue.phone!,
      pinCode: formValue.pincode!,
      address: formValue.address!,
      landmark: formValue.landmark || '',
      city: formValue.city!,
      state: formValue.state!,
    };

    // If user is authenticated and it's a new address, save to backend
    if (this.auth.isLoggedIn() && !this.selectedAddressId()) {
      const backendAddress: Address = {
        label: `${formValue.city} - ${(formValue.address || '').substring(0, 20)}`,
        name: formValue.name!,
        phone: formValue.phone!,
        address: formValue.address!,
        landmark: formValue.landmark || undefined,
        city: formValue.city!,
        state: formValue.state!,
        pinCode: formValue.pincode!,
      };

      this.addressService.addAddress(backendAddress).subscribe({
        next: (response) => {
          // Find the newly created address in response data to set its _id
          let newAddressId: string | undefined;
          if (response.success && Array.isArray(response.data)) {
            const matched = response.data.find(addr => 
              addr.address === backendAddress.address && 
              addr.city === backendAddress.city && 
              addr.pinCode === backendAddress.pinCode
            );
            if (matched) {
              newAddressId = matched._id;
            }
          }
          const finalAddress = { ...address, _id: newAddressId };
          this.checkoutService.saveAddress(finalAddress);
          localStorage.setItem('checkout_address', JSON.stringify({ ...finalAddress, email: formValue.email || '' }));
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
      // Guest checkout OR using existing saved address
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
    this.selectedAddressId.set(address._id || null);

    // Keep name and phone if they are already filled or load from profile
    let currentName = this.form.get('name')?.value || '';
    let currentPhone = this.form.get('phone')?.value || '';

    if (!currentName && this.auth.isLoggedIn()) {
      const user = this.auth.user();
      if (user) {
        currentName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      }
    }
    if (!currentPhone && this.auth.isLoggedIn()) {
      const user = this.auth.user();
      if (user?.phone) {
        currentPhone = user.phone;
        if (currentPhone.startsWith('+91')) {
          currentPhone = currentPhone.substring(3);
        }
      }
    }

    this.form.patchValue({
      name: address.name || currentName,
      phone: address.phone || currentPhone,
      pincode: address.pinCode,
      address: address.address,
      landmark: address.landmark || '',
      city: address.city,
      state: address.state,
    });
  }

  selectNewAddress() {
    this.selectedAddressId.set(null);
    this.form.patchValue({
      pincode: '',
      address: '',
      landmark: '',
      city: '',
      state: '',
    });
  }
}
