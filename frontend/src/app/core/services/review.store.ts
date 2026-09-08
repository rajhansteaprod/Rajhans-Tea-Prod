import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> { success: boolean; data: T[]; meta: any; }

export interface Review { _id: string; userId: any; productId: any; reviewerName?: string; rating: number; title: string; body: string; images: string[]; isVerifiedPurchase: boolean; status: string; helpfulVotes: number; reportCount: number; adminReply: { body: string; repliedAt: string } | null; isPinned: boolean; createdAt: string; }
export interface RatingSummary { averageRating: number; totalReviews: number; distribution: { 1: number; 2: number; 3: number; 4: number; 5: number }; ratingOneLiner?: string; }
export interface ProductRatingSummary { productId: string; averageRating: number; totalReviews: number; }
export interface Question { _id: string; userId: any; productId: any; questionText: string; voteCount: number; answers: { _id: string; userId: any; body: string; isAdminAnswer: boolean; createdAt: string }[]; createdAt: string; }
export interface TokenReviewProduct { productId: string; name: string; image: string | null; reviewed: boolean; }
export interface TokenReviewInfo { orderNumber: string; products: TokenReviewProduct[]; }

// ─── Admin moderation ────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type ModerationStatus = ReviewStatus | 'all';

export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number; }
export interface AdminPaginated<T> { success: boolean; data: T[]; meta: PaginationMeta; }

/** Populated by the moderation queue — may be a bare id if the product was deleted. */
export interface AdminReviewProduct { _id: string; name: string; slug: string; primaryImage?: string; images?: string[]; }
export interface AdminReviewUser { _id: string; phone?: string; firstName?: string; lastName?: string; }

export interface AdminReview {
  _id: string;
  userId: AdminReviewUser | string | null;
  productId: AdminReviewProduct | string;
  orderId?: string | null;
  orderNumber?: string | null;
  reviewerName?: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  rejectionReason: string | null;
  helpfulVotes: number;
  reportCount: number;
  adminReply: { body: string; repliedAt: string } | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAnalytics {
  totalApproved: number;
  pendingCount: number;
  reportedCount: number;
  overallAvgRating: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // Public
  getProductReviews(productId: string, params: any = {}): Observable<PaginatedResponse<Review>> {
    let url = `${this.api}/reviews/products/${productId}/reviews?limit=${params.limit ?? 10}`;
    if (params.page) url += `&page=${params.page}`;
    if (params.sort) url += `&sort=${params.sort}`;
    if (params.rating) url += `&rating=${params.rating}`;
    return this.http.get<PaginatedResponse<Review>>(url);
  }

  getRatingSummary(productId: string): Observable<ApiResponse<RatingSummary>> {
    return this.http.get<ApiResponse<RatingSummary>>(`${this.api}/reviews/products/${productId}/summary`);
  }

  /** Batch summaries for listing pages — one request for all visible cards */
  getSummaries(productIds: string[]): Observable<ApiResponse<ProductRatingSummary[]>> {
    return this.http.get<ApiResponse<ProductRatingSummary[]>>(`${this.api}/reviews/summaries?productIds=${productIds.join(',')}`);
  }

  getProductQA(productId: string, page = 1): Observable<PaginatedResponse<Question>> {
    return this.http.get<PaginatedResponse<Question>>(`${this.api}/reviews/products/${productId}/qa?page=${page}&limit=10`);
  }

  // Anonymous order-token reviews (no auth)
  getReviewByToken(token: string): Observable<ApiResponse<TokenReviewInfo>> {
    return this.http.get<ApiResponse<TokenReviewInfo>>(`${this.api}/reviews/token/${token}`);
  }

  submitTokenReview(
    token: string,
    productId: string,
    data: { rating: number; name?: string; comment?: string; images?: string[] },
  ): Observable<ApiResponse<Review>> {
    return this.http.post<ApiResponse<Review>>(
      `${this.api}/reviews/token/${token}/products/${productId}`,
      data,
    );
  }

  uploadTokenReviewImage(token: string, file: File): Observable<ApiResponse<{ url: string }>> {
    const form = new FormData();
    form.append('image', file);
    return this.http.post<ApiResponse<{ url: string }>>(
      `${this.api}/reviews/token/${token}/upload`,
      form,
    );
  }

  // Authenticated
  submitReview(productId: string, data: any): Observable<ApiResponse<Review>> {
    return this.http.post<ApiResponse<Review>>(`${this.api}/reviews/products/${productId}/reviews`, data);
  }

  deleteReview(reviewId: string): Observable<any> {
    return this.http.delete(`${this.api}/reviews/reviews/${reviewId}`);
  }

  voteHelpful(reviewId: string): Observable<ApiResponse<{ action: string }>> {
    return this.http.post<ApiResponse<{ action: string }>>(`${this.api}/reviews/reviews/${reviewId}/vote`, {});
  }

  reportReview(reviewId: string, reason: string, details?: string): Observable<any> {
    return this.http.post(`${this.api}/reviews/reviews/${reviewId}/report`, { reason, details });
  }

  submitQuestion(productId: string, questionText: string): Observable<any> {
    return this.http.post(`${this.api}/reviews/products/${productId}/questions`, { questionText });
  }

  submitAnswer(questionId: string, body: string): Observable<any> {
    return this.http.post(`${this.api}/reviews/questions/${questionId}/answers`, { body });
  }

  getMyReviews(page = 1): Observable<PaginatedResponse<Review>> {
    return this.http.get<PaginatedResponse<Review>>(`${this.api}/reviews/my-reviews?page=${page}&limit=10`);
  }

  // Admin
  getModeration(type = 'reviews', page = 1): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(`${this.api}/admin/reviews/moderation?type=${type}&page=${page}&limit=20`);
  }

  /** Moderation queue filtered by status ('all' returns every status). */
  getReviewModeration(
    status: ModerationStatus,
    page = 1,
    limit = 20,
  ): Observable<AdminPaginated<AdminReview>> {
    return this.http.get<AdminPaginated<AdminReview>>(
      `${this.api}/admin/reviews/moderation?type=reviews&status=${status}&page=${page}&limit=${limit}`,
    );
  }

  adminCreateReview(productId: string, data: { reviewerName: string; rating: number; reviewText?: string; images?: string[] }): Observable<ApiResponse<Review>> {
    return this.http.post<ApiResponse<Review>>(`${this.api}/admin/reviews/products/${productId}/reviews`, data);
  }
  adminDeleteReview(reviewId: string): Observable<any> { return this.http.delete(`${this.api}/admin/reviews/reviews/${reviewId}`); }
  approveReview(id: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/approve`, {}); }
  rejectReview(id: string, reason: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/reject`, { reason }); }
  replyToReview(id: string, body: string): Observable<any> { return this.http.post(`${this.api}/admin/reviews/reviews/${id}/reply`, { body }); }
  pinReview(id: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/pin`, {}); }
  getAnalytics(): Observable<ApiResponse<ReviewAnalytics>> { return this.http.get<ApiResponse<ReviewAnalytics>>(`${this.api}/admin/reviews/analytics`); }
  getReported(page = 1, limit = 20): Observable<AdminPaginated<AdminReview>> {
    return this.http.get<AdminPaginated<AdminReview>>(`${this.api}/admin/reviews/reported?page=${page}&limit=${limit}`);
  }
}
