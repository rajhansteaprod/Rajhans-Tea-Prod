import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { ReviewStore, TokenReviewProduct } from '../../../core/services/review.store';

interface ProductForm {
  product: TokenReviewProduct;
  rating: number;
  name: string;
  comment: string;
  images: string[];
  uploading: boolean;
  submitting: boolean;
  submitted: boolean;
  error: string;
}

@Component({
  selector: 'app-review-token-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './review-token-page.html',
  styleUrls: ['./review-token-page.scss'],
})
export class ReviewTokenPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reviews = inject(ReviewStore);
  private readonly apiOrigin = new URL(environment.apiUrl).origin;

  private token = '';
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly orderNumber = signal('');
  readonly forms = signal<ProductForm[]>([]);
  readonly stars = [1, 2, 3, 4, 5];

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.loadError.set('This review link is invalid or has expired.');
      this.loading.set(false);
      return;
    }
    this.reviews.getReviewByToken(this.token).subscribe({
      next: (res) => {
        this.orderNumber.set(res.data.orderNumber);
        this.forms.set(
          res.data.products.map((product) => ({
            product,
            rating: 0,
            name: '',
            comment: '',
            images: [],
            uploading: false,
            submitting: false,
            submitted: product.reviewed,
            error: '',
          })),
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(err?.error?.message || 'This review link is invalid or has expired.');
        this.loading.set(false);
      },
    });
  }

  imgSrc(url: string): string {
    return url.startsWith('http') ? url : `${this.apiOrigin}${url}`;
  }

  setRating(form: ProductForm, value: number): void {
    if (form.submitted || form.submitting) return;
    form.rating = value;
    this.forms.set([...this.forms()]);
  }

  onFileSelected(form: ProductForm, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    form.uploading = true;
    form.error = '';
    this.forms.set([...this.forms()]);
    this.reviews.uploadTokenReviewImage(this.token, file).subscribe({
      next: (res) => {
        form.images = [...form.images, res.data.url];
        form.uploading = false;
        this.forms.set([...this.forms()]);
      },
      error: (err) => {
        form.uploading = false;
        form.error = err?.error?.message || 'Image upload failed.';
        this.forms.set([...this.forms()]);
      },
    });
    input.value = '';
  }

  removeImage(form: ProductForm, url: string): void {
    form.images = form.images.filter((i) => i !== url);
    this.forms.set([...this.forms()]);
  }

  submit(form: ProductForm): void {
    if (form.submitting || form.submitted) return;
    if (form.rating < 1) {
      form.error = 'Please select a rating.';
      this.forms.set([...this.forms()]);
      return;
    }
    form.submitting = true;
    form.error = '';
    this.forms.set([...this.forms()]);
    this.reviews
      .submitTokenReview(this.token, form.product.productId, {
        rating: form.rating,
        name: form.name.trim() || undefined,
        comment: form.comment.trim() || undefined,
        images: form.images.length ? form.images : undefined,
      })
      .subscribe({
        next: () => {
          form.submitting = false;
          form.submitted = true;
          this.forms.set([...this.forms()]);
        },
        error: (err) => {
          form.submitting = false;
          form.error = err?.error?.message || 'Failed to submit review.';
          this.forms.set([...this.forms()]);
        },
      });
  }

  get allDone(): boolean {
    const list = this.forms();
    return list.length > 0 && list.every((f) => f.submitted);
  }
}
