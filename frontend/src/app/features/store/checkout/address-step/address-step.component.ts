import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CheckoutService, CheckoutAddress } from '../../../../core/services/checkout.service';
import { SavedAddressesComponent } from './saved-addresses.component';

@Component({
  selector: 'app-address-step',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SavedAddressesComponent],
  templateUrl: './address-step.component.html',
  styleUrls: ['./address-step.component.scss'],
})
export class AddressStepComponent {
  private readonly checkoutService = inject(CheckoutService);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  // Outputs
  readonly prevStep = output<void>();
  readonly nextStep = output<void>();

  // Form
  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    pincode: ['', [Validators.required, Validators.pattern(/^[1-9]\d{5}$/)]],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    address: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^(\+91\d{10}|0\d{10}|\d{10})$/)]],
  });

  // Signals
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly pincodeSuggestions = signal<any[]>([]);
  readonly showSuggestions = signal(false);
  readonly selectedPincodeData = signal<any>(null);

  private allPincodes: any[] = [];


  ngOnInit() {
    // Load pincode data from JSON file
    this.http.get<any[]>('/pincodes.json').subscribe({
      next: (data) => {
        this.allPincodes = data;
        console.log('Pincodes loaded:', this.allPincodes.length);
      },
      error: (error) => {
        console.error('Failed to load pincodes:', error);
      }
    });

    // Load existing address from service
    const existingAddress = this.checkoutService.getAddress();
    if (existingAddress.name) {
      const [firstName, ...lastNameParts] = existingAddress.name.split(' ');
      this.form.patchValue({
        firstName,
        lastName: lastNameParts.join(' '),
        phone: existingAddress.phone,
        pincode: existingAddress.pinCode,
        address: existingAddress.address,
        city: existingAddress.city,
        state: existingAddress.state,
      });
    }
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
      ).slice(0, 3); // Limit to 3
      console.log('Filtered pincodes:', filtered);  
      this.pincodeSuggestions.set(filtered);
      this.showSuggestions.set(filtered.length > 0);
    } catch (error) {
      console.error('Error filtering pincodes:', error);
      this.pincodeSuggestions.set([]);
      this.showSuggestions.set(false);
    }
  }

  selectPincode(pincode: any) {
    console.log('Selected pincode object:', pincode);

    this.selectedPincodeData.set(pincode);

    const pincodeStr = pincode.pincode ? (pincode.pincode + '') : '';
    console.log('Converted pincode:', pincode.pincode, '→', pincodeStr);

    this.form.patchValue({
      pincode: pincodeStr,
      city: pincode.districtName || '',
      state: pincode.stateName || '',
    });

    console.log('✅ Form updated:', this.form.value);
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

    setTimeout(() => {
      const formValue = this.form.value;
      const address: CheckoutAddress = {
        name: `${formValue.firstName} ${formValue.lastName}`,
        phone: formValue.phone!,
        pinCode: formValue.pincode!,
        address: formValue.address!,
        city: formValue.city!,
        state: formValue.state!,
      };
      this.checkoutService.saveAddress(address);
      this.isSubmitting.set(false);
      this.nextStep.emit();
    }, 500);
  }

  goBack() {
    this.prevStep.emit();
  }

  onAddressSelected(address: CheckoutAddress) {
    const [firstName, ...lastNameParts] = address.name.split(' ');
    this.form.patchValue({
      firstName,
      lastName: lastNameParts.join(' '),
      phone: address.phone,
      pincode: address.pinCode,
      address: address.address,
      city: address.city,
      state: address.state,
    });
  }
}
