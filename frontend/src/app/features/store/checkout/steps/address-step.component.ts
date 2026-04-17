import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CheckoutService, CheckoutAddress } from '../../../core/services/checkout.service';

@Component({
  selector: 'app-address-step',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './address-step.component.html',
  styleUrls: ['./address-step.component.scss'],
})
export class AddressStepComponent {
  private readonly checkoutService = inject(CheckoutService);
  private readonly fb = inject(FormBuilder);

  // Outputs
  readonly prevStep = output<void>();
  readonly nextStep = output<void>();

  // Form
  readonly form = this.fb.group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    street: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', Validators.required],
  });

  // Signals
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');

  ngOnInit() {
    // Load existing address from service
    const existingAddress = this.checkoutService.getAddress();
    if (existingAddress.name) {
      this.form.patchValue(existingAddress);
    }
  }

  saveAddress() {
    this.submitError.set('');

    if (!this.form.valid) {
      this.submitError.set('Please fill all fields correctly');
      return;
    }

    this.isSubmitting.set(true);

    // Simulate API call
    setTimeout(() => {
      const address: CheckoutAddress = this.form.value as CheckoutAddress;
      this.checkoutService.saveAddress(address);
      this.isSubmitting.set(false);
      this.nextStep.emit();
    }, 500);
  }

  goBack() {
    this.prevStep.emit();
  }

  get nameError(): string {
    return this.form.get('name')?.hasError('required') ? 'Name is required' : '';
  }

  get phoneError(): string {
    const control = this.form.get('phone');
    if (control?.hasError('required')) return 'Phone is required';
    if (control?.hasError('pattern')) return 'Phone must be 10 digits';
    return '';
  }

  get pincodeError(): string {
    const control = this.form.get('pincode');
    if (control?.hasError('required')) return 'Pincode is required';
    if (control?.hasError('pattern')) return 'Pincode must be 6 digits';
    return '';
  }

  get streetError(): string {
    return this.form.get('street')?.hasError('required') ? 'Street address is required' : '';
  }

  get cityError(): string {
    return this.form.get('city')?.hasError('required') ? 'City is required' : '';
  }

  get stateError(): string {
    return this.form.get('state')?.hasError('required') ? 'State is required' : '';
  }
}
