import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> { success: boolean; data: T[]; meta: any; }

export interface Review { _id: string; userId: any; productId: any; rating: number; title: string; body: string; images: string[]; isVerifiedPurchase: boolean; status: string; helpfulVotes: number; reportCount: number; adminReply: { body: string; repliedAt: string } | null; isPinned: boolean; createdAt: string; }
export interface RatingSummary { averageRating: number; totalReviews: number; distribution: { 1: number; 2: number; 3: number; 4: number; 5: number }; ratingOneLiner?: string; }
export interface Question { _id: string; userId: any; productId: any; questionText: string; voteCount: number; answers: { _id: string; userId: any; body: string; isAdminAnswer: boolean; createdAt: string }[]; createdAt: string; }

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // Public
  getProductReviews(productId: string, params: any = {}): Observable<PaginatedResponse<Review>> {
    let url = `${this.api}/reviews/products/${productId}/reviews?limit=10`;
    if (params.page) url += `&page=${params.page}`;
    if (params.sort) url += `&sort=${params.sort}`;
    if (params.rating) url += `&rating=${params.rating}`;
    return this.http.get<PaginatedResponse<Review>>(url);
  }

  getRatingSummary(productId: string): Observable<ApiResponse<RatingSummary>> {
    return this.http.get<ApiResponse<RatingSummary>>(`${this.api}/reviews/products/${productId}/summary`);
  }

  getProductQA(productId: string, page = 1): Observable<PaginatedResponse<Question>> {
    return this.http.get<PaginatedResponse<Question>>(`${this.api}/reviews/products/${productId}/qa?page=${page}&limit=10`);
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

  approveReview(id: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/approve`, {}); }
  rejectReview(id: string, reason: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/reject`, { reason }); }
  replyToReview(id: string, body: string): Observable<any> { return this.http.post(`${this.api}/admin/reviews/reviews/${id}/reply`, { body }); }
  pinReview(id: string): Observable<any> { return this.http.patch(`${this.api}/admin/reviews/reviews/${id}/pin`, {}); }
  getAnalytics(): Observable<ApiResponse<any>> { return this.http.get<ApiResponse<any>>(`${this.api}/admin/reviews/analytics`); }
  getReported(page = 1): Observable<PaginatedResponse<Review>> { return this.http.get<PaginatedResponse<Review>>(`${this.api}/admin/reviews/reported?page=${page}&limit=20`); }
}
