import { Component, inject, signal, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CheckoutService, CheckoutAddress } from '../../../../core/services/checkout.service';
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
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  // Outputs
  readonly prevStep = output<void>();
  readonly nextStep = output<void>();

  // Form
  readonly form = this.fb.group({
    email: ['', [Validators.email]],
    pincode: ['', [Validators.required, Validators.pattern(/^[1-9]\d{5}$/)]],
    name: ['', Validators.required],
    address: ['', Validators.required],
    landmark: [''],
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
      },
      error: (error) => {
        console.error('Failed to load pincodes:', error);
      }
    });

    // Load address from localStorage with validation
    const saved = localStorage.getItem('checkout_address');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Validate phone format
        const phonePattern = /^(\+91\d{10}|0\d{10}|\d{10})$/;
        const pincodePattern = /^[1-9]\d{5}$/;

        if (data.phone && !phonePattern.test(data.phone)) {
          localStorage.removeItem('checkout_address');
          return;
        }
        if (data.pinCode && !pincodePattern.test(data.pinCode)) {
          localStorage.removeItem('checkout_address');
          return;
        }

        // Set valid values
        this.form.get('name')?.setValue(data.name || '', { emitEvent: false });
        this.form.get('phone')?.setValue(data.phone || '', { emitEvent: false });
        this.form.get('pincode')?.setValue(data.pinCode || '', { emitEvent: false });
        this.form.get('address')?.setValue(data.address || '', { emitEvent: false });
        this.form.get('landmark')?.setValue(data.landmark || '', { emitEvent: false });
        this.form.get('city')?.setValue(data.city || '', { emitEvent: false });
        this.form.get('state')?.setValue(data.state || '', { emitEvent: false });
        this.form.get('email')?.setValue(data.email || '', { emitEvent: false });
      } catch (e) {
        localStorage.removeItem('checkout_address');
      }
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
        name: formValue.name!,
        phone: formValue.phone!,
        pinCode: formValue.pincode!,
        address: formValue.address!,
        landmark: formValue.landmark || '',
        city: formValue.city!,
        state: formValue.state!,
      };
      this.checkoutService.saveAddress(address);
      localStorage.setItem('checkout_address', JSON.stringify({ ...address, email: formValue.email || '' }));
      this.isSubmitting.set(false);
      this.nextStep.emit();
    }, 500);
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
