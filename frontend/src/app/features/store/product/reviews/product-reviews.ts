import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ReviewStore, Review, RatingSummary, Question } from '../../../../core/services/review.store';

@Component({
  selector: 'app-product-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-reviews.html',
  styleUrls: ['./product-reviews.scss'],
})
export class ProductReviewsComponent implements OnInit {
  @Input({ required: true }) productId!: string;

  readonly auth = inject(AuthService);
  private readonly reviewStore = inject(ReviewStore);

  readonly Math = Math;

  // State
  readonly activeTab = signal<'reviews' | 'qa'>('reviews');
  readonly reviews = signal<Review[]>([]);
  readonly ratingSummary = signal<RatingSummary | null>(null);
  readonly questions = signal<Question[]>([]);
  readonly reviewsLoading = signal(false);
  readonly qaLoading = signal(false);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly answeringId = signal<string | null>(null);

  // Form fields
  readonly formRating = signal(0);
  formTitle = '';
  formBody = '';
  questionText = '';
  answerText = '';

  ngOnInit(): void {
    this.loadReviews();
    this.loadSummary();
  }

  private loadReviews(): void {
    this.reviewsLoading.set(true);
    this.reviewStore.getProductReviews(this.productId).subscribe({
      next: (res) => {
        this.reviews.set(res.data);
        this.reviewsLoading.set(false);
      },
      error: () => this.reviewsLoading.set(false),
    });
  }

  private loadSummary(): void {
    this.reviewStore.getRatingSummary(this.productId).subscribe({
      next: (res) => this.ratingSummary.set(res.data),
    });
  }

  switchToQA(): void {
    this.activeTab.set('qa');
    if (this.questions().length === 0) {
      this.loadQA();
    }
  }

  private loadQA(): void {
    this.qaLoading.set(true);
    this.reviewStore.getProductQA(this.productId).subscribe({
      next: (res) => {
        this.questions.set(res.data);
        this.qaLoading.set(false);
      },
      error: () => this.qaLoading.set(false),
    });
  }

  getBarWidth(rating: number): number {
    const summary = this.ratingSummary();
    if (!summary || summary.totalReviews === 0) return 0;
    const count = (summary.distribution as Record<number, number>)[rating] || 0;
    return (count / summary.totalReviews) * 100;
  }

  getDistCount(rating: number): number {
    const summary = this.ratingSummary();
    if (!summary) return 0;
    return (summary.distribution as Record<number, number>)[rating] || 0;
  }

  submitReview(): void {
    if (this.formRating() === 0) return;
    this.submitting.set(true);

    this.reviewStore.submitReview(this.productId, {
      rating: this.formRating(),
      title: this.formTitle,
      body: this.formBody,
    }).subscribe({
      next: () => {
        this.showForm.set(false);
        this.formRating.set(0);
        this.formTitle = '';
        this.formBody = '';
        this.submitting.set(false);
        this.loadReviews();
        this.loadSummary();
      },
      error: () => this.submitting.set(false),
    });
  }

  voteHelpful(reviewId: string): void {
    this.reviewStore.voteHelpful(reviewId).subscribe({
      next: () => this.loadReviews(),
    });
  }

  askQuestion(): void {
    if (!this.questionText.trim()) return;
    this.reviewStore.submitQuestion(this.productId, this.questionText).subscribe({
      next: () => {
        this.questionText = '';
        this.loadQA();
      },
    });
  }

  submitAnswer(questionId: string): void {
    if (!this.answerText.trim()) return;
    this.reviewStore.submitAnswer(questionId, this.answerText).subscribe({
      next: () => {
        this.answerText = '';
        this.answeringId.set(null);
        this.loadQA();
      },
    });
  }
}
