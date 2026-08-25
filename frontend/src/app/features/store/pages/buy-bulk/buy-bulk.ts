import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Title, Meta } from '@angular/platform-browser';
import { environment } from '../../../../../environments/environment';
import { trackPixelEvent } from '../../../../core/utils/meta-pixel';

@Component({
  selector: 'app-buy-bulk',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './buy-bulk.html',
  styleUrls: ['./buy-bulk.scss'],
})
export class BuyBulkComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  bulkForm!: FormGroup;
  giftingForm!: FormGroup;

  bulkSubmitting = signal(false);
  giftingSubmitting = signal(false);
  bulkSuccess = signal(false);
  giftingSuccess = signal(false);
  bulkError = signal('');
  giftingError = signal('');

  ngOnInit() {
    this.initForms();
    this.titleService.setTitle('Buy Tea in Bulk — Wholesale Loose-Leaf CTC Chai | Rajhans Tea');
    this.meta.updateTag({
      name: 'description',
      content:
        'Order Rajhans CTC chai in bulk for cafés, offices, retailers and gifting. Wholesale pricing on Assam, Nilgiri, Darjeeling & Dooars teas — enquire today.',
    });
  }

  private initForms() {
    this.bulkForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      businessName: ['', [Validators.required]],
      businessType: ['', [Validators.required]],
      city: ['', [Validators.required]],
      mobileNumber: ['', [Validators.required, Validators.pattern(/^\+?[\d\s]{10,}$/)]],
      emailAddress: ['', [Validators.required, Validators.email]],
      monthlyRequirement: ['', [Validators.required]],
      additionalInfo: [''],
    });

    this.giftingForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      companyName: ['', [Validators.required]],
      mobileNumber: ['', [Validators.required, Validators.pattern(/^\+?[\d\s]{10,}$/)]],
      emailAddress: ['', [Validators.required, Validators.email]],
      occasion: ['', [Validators.required]],
      numberOfSets: ['', [Validators.required]],
      budgetPerSet: ['', [Validators.required]],
      specialRequirements: [''],
    });
  }

  submitBulkEnquiry() {
    if (!this.bulkForm.valid) {
      return;
    }

    this.bulkSubmitting.set(true);
    this.bulkError.set('');

    const formData = this.bulkForm.getRawValue();
    const payload = {
      fullName: formData.fullName,
      mobileNumber: formData.mobileNumber.replace(/\D/g, '').slice(-10),
      emailAddress: formData.emailAddress,
      reasonToContact: 'bulk' as const,
      companyName: formData.businessName,
      address: `${formData.businessType}, ${formData.city}`,
      message: `Monthly Requirement: ${formData.monthlyRequirement}\n\n${formData.additionalInfo}`,
    };

    this.http.post(
      `${environment.apiUrl}/contact/submit`,
      payload
    ).subscribe({
      next: () => {
        // Meta Pixel: bulk enquiry submitted successfully.
        trackPixelEvent('Lead', { content_category: 'bulk' });
        this.bulkSuccess.set(true);
        this.bulkForm.reset();
        this.bulkSubmitting.set(false);
        setTimeout(() => this.bulkSuccess.set(false), 4000);
      },
      error: (err) => {
        this.bulkError.set(err?.error?.message || 'Failed to submit form');
        this.bulkSubmitting.set(false);
      },
    });
  }

  submitGiftingEnquiry() {
    if (!this.giftingForm.valid) {
      return;
    }

    this.giftingSubmitting.set(true);
    this.giftingError.set('');

    const formData = this.giftingForm.getRawValue();
    const payload = {
      fullName: formData.fullName,
      mobileNumber: formData.mobileNumber.replace(/\D/g, '').slice(-10),
      emailAddress: formData.emailAddress,
      reasonToContact: 'gifting' as const,
      companyName: formData.companyName,
      message: `Occasion: ${formData.occasion}\nNumber of Sets: ${formData.numberOfSets}\nBudget per Set: ${formData.budgetPerSet}\n\n${formData.specialRequirements}`,
    };

    this.http.post(
      `${environment.apiUrl}/contact/submit`,
      payload
    ).subscribe({
      next: () => {
        // Meta Pixel: corporate gifting enquiry submitted successfully.
        trackPixelEvent('Lead', { content_category: 'gifting' });
        this.giftingSuccess.set(true);
        this.giftingForm.reset();
        this.giftingSubmitting.set(false);
        setTimeout(() => this.giftingSuccess.set(false), 4000);
      },
      error: (err) => {
        this.giftingError.set(err?.error?.message || 'Failed to submit form');
        this.giftingSubmitting.set(false);
      },
    });
  }
}
