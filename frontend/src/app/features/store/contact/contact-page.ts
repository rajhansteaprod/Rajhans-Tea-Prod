import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { environment } from '../../../../environments/environment';

interface ContactFormData {
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  address?: string;
  reasonToContact: 'help' | 'bulk' | 'gifting';
  message?: string;
  companyName?: string;
  preferredDeliveryDate?: string;
}

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent],
  templateUrl: './contact-page.html',
  styleUrls: ['./contact-page.scss']
})
export class ContactPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  form!: FormGroup;
  submitted = signal(false);
  loading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  referenceId = signal('');
  successSubmitted = signal(false);

  readonly reasonOptions = [
    { value: 'help', label: 'Help & Support' },
    { value: 'bulk', label: 'Buy in Bulk' },
    { value: 'gifting', label: 'Corporate Gifting' }
  ];

  constructor() {
    this.initForm();
    this.preFillReasonFromQueryParam();
  }

  private preFillReasonFromQueryParam(): void {
    this.route.queryParams.subscribe(params => {
      const reason = params['reason'];
      if (reason && ['help', 'bulk', 'gifting'].includes(reason)) {
        this.form.get('reasonToContact')?.setValue(reason);
        this.updateMessageValidation();
      }
    });
  }

  private initForm(): void {
    this.form = this.fb.group({
      fullName: ['', [Validators.required]],
      mobileNumber: ['', [Validators.required, this.validateMobileNumber.bind(this)]],
      emailAddress: ['', [Validators.required, Validators.email]],
      address: [''],
      reasonToContact: ['', Validators.required],
      message: [''],
      companyName: [''],
      preferredDeliveryDate: ['']
    });

    this.form.get('reasonToContact')?.valueChanges.subscribe(() => {
      this.updateMessageValidation();
    });
  }

  private updateMessageValidation(): void {
    const messageControl = this.form.get('message');
    const reason = this.form.get('reasonToContact')?.value;

    if (reason === 'help') {
      messageControl?.setValidators([Validators.required]);
    } else {
      messageControl?.clearValidators();
    }
    messageControl?.updateValueAndValidity();
  }

  private validateMobileNumber(control: any) {
    if (!control.value) return null;

    // Remove non-digit characters except leading +
    const cleaned = control.value.replace(/[^\d+]/g, '');
    const digitsOnly = cleaned.replace(/\D/g, '');

    // Valid if: 10 digits, or 11 digits starting with 0, or 12 digits (country code + 10)
    if (/^\d{10}$/.test(digitsOnly) || /^0\d{10}$/.test(digitsOnly) || /^\d{12}$/.test(digitsOnly)) {
      return null;
    }

    return { invalidMobileNumber: true };
  }

  isFieldRequired(fieldName: string, reason?: string): boolean {
    const requiredFields = ['fullName', 'mobileNumber', 'emailAddress', 'reasonToContact'];
    if (requiredFields.includes(fieldName)) return true;

    if (fieldName === 'message' && reason === 'help') return true;
    return false;
  }

  isFieldVisible(fieldName: string): boolean {
    const reason = this.form.get('reasonToContact')?.value;

    switch (fieldName) {
      case 'message':
        return true;
      case 'companyName':
      case 'preferredDeliveryDate':
        return reason === 'gifting';
      default:
        return true;
    }
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    if (!this.form.valid) {
      this.errorMessage.set('Please fill in all required fields correctly.');
      return;
    }

    this.loading.set(true);
    const formData = this.form.value as ContactFormData;
    // Clean mobile number - remove all non-digits
    formData.mobileNumber = formData.mobileNumber.replace(/\D/g, '');

    this.http.post(`${environment.apiUrl}/contact/submit`, formData).subscribe({
      next: (response: any) => {
        this.loading.set(false);
        this.referenceId.set(response.referenceId);
        this.showSuccessMessage(formData.reasonToContact);
        this.form.reset();
        this.submitted.set(false);
        this.successSubmitted.set(true);
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set('Failed to submit form. Please try again.');
        console.error('Form submission error:', error);
      }
    });
  }

  private showSuccessMessage(reason: string): void {
    const messages = {
      help: `Thank you for reaching out! We've received your support request. Our team will get back to you within 24 hours at the mobile number and email you provided.\n\nTicket ID: #${this.referenceId()}`,
      bulk: `Thank you for your interest! We've received your bulk inquiry. Our sales team will contact you within 2 business days to discuss pricing and delivery options.\n\nReference ID: #${this.referenceId()}`,
      gifting: `Thank you for choosing Rajhans! We've received your corporate gifting request. Our gifting specialist will reach out to you shortly to customize the perfect gift solution.\n\nRequest ID: #${this.referenceId()}`
    };
    this.successMessage.set(messages[reason as keyof typeof messages]);
  }
}
