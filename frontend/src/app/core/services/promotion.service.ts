import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> { success: boolean; data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }

export interface CouponValidation { valid: boolean; couponId: string; code: string; discountAmount: number; message: string; }
export interface Coupon { _id: string; code: string; description: string; discountType: string; discountValue: number; minOrderAmount: number; maxDiscountCap: number | null; usageLimitTotal: number | null; usageLimitPerUser: number; usedCount: number; validFrom: string; validUntil: string; scope: string; isActive: boolean; stackable: boolean; }
export interface Campaign { _id: string; name: string; slug: string; type: string; description: string; bannerImage: string; bannerLink: string; discountType: string; discountValue: number; startsAt: string; endsAt: string; isActive: boolean; priority: number; }
export interface LoyaltyAccount { balance: number; totalEarned: number; totalRedeemed: number; earnRate: number; redeemRate: number; transactions: { _id: string; type: string; points: number; balanceAfter: number; source: string; description: string; createdAt: string }[]; }
export interface ReferralInfo { code: string; total: number; completed: number; pending: number; }

@Injectable({ providedIn: 'root' })
export class PromotionHttpService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // ─── Public ────────────────────────────────────────────────────────────────

  getActiveCampaigns(): Observable<ApiResponse<Campaign[]>> {
    return this.http.get<ApiResponse<Campaign[]>>(`${this.api}/promotions/campaigns/active`);
  }

  validateCoupon(code: string, sessionId: string): Observable<ApiResponse<CouponValidation>> {
    return this.http.post<ApiResponse<CouponValidation>>(
      `${this.api}/promotions/coupons/validate`,
      { code },
      { headers: new HttpHeaders({ 'X-Session-ID': sessionId }) },
    );
  }

  // ─── Authenticated ─────────────────────────────────────────────────────────

  getLoyaltyAccount(): Observable<ApiResponse<LoyaltyAccount>> {
    return this.http.get<ApiResponse<LoyaltyAccount>>(`${this.api}/promotions/loyalty`);
  }

  getReferralInfo(): Observable<ApiResponse<ReferralInfo>> {
    return this.http.get<ApiResponse<ReferralInfo>>(`${this.api}/promotions/referral/code`);
  }

  // ─── Admin: Coupons ────────────────────────────────────────────────────────

  adminListCoupons(page = 1): Observable<PaginatedResponse<Coupon>> {
    return this.http.get<PaginatedResponse<Coupon>>(`${this.api}/admin/promotions/coupons?page=${page}&limit=20`);
  }

  adminCreateCoupon(data: any): Observable<ApiResponse<Coupon>> {
    return this.http.post<ApiResponse<Coupon>>(`${this.api}/admin/promotions/coupons`, data);
  }

  adminUpdateCoupon(id: string, data: any): Observable<ApiResponse<Coupon>> {
    return this.http.put<ApiResponse<Coupon>>(`${this.api}/admin/promotions/coupons/${id}`, data);
  }

  adminDeleteCoupon(id: string): Observable<any> {
    return this.http.delete(`${this.api}/admin/promotions/coupons/${id}`);
  }

  // ─── Admin: Campaigns ──────────────────────────────────────────────────────

  adminListCampaigns(page = 1): Observable<PaginatedResponse<Campaign>> {
    return this.http.get<PaginatedResponse<Campaign>>(`${this.api}/admin/promotions/campaigns?page=${page}&limit=20`);
  }

  adminCreateCampaign(data: any): Observable<ApiResponse<Campaign>> {
    return this.http.post<ApiResponse<Campaign>>(`${this.api}/admin/promotions/campaigns`, data);
  }

  adminUpdateCampaign(id: string, data: any): Observable<ApiResponse<Campaign>> {
    return this.http.put<ApiResponse<Campaign>>(`${this.api}/admin/promotions/campaigns/${id}`, data);
  }

  adminDeleteCampaign(id: string): Observable<any> {
    return this.http.delete(`${this.api}/admin/promotions/campaigns/${id}`);
  }

  // ─── Admin: Settings ───────────────────────────────────────────────────────

  adminGetLoyaltySettings(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.api}/admin/promotions/loyalty/settings`);
  }

  adminUpdateLoyaltySettings(data: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.api}/admin/promotions/loyalty/settings`, data);
  }

  adminGetReferralSettings(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.api}/admin/promotions/referral/settings`);
  }

  adminUpdateReferralSettings(data: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.api}/admin/promotions/referral/settings`, data);
  }

  adminListReferrals(page = 1): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(`${this.api}/admin/promotions/referral/list?page=${page}&limit=20`);
  }
}
