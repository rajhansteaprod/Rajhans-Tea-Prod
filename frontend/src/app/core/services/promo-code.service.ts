import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PromoValidationResponse {
  valid: boolean;
  code?: {
    _id: string;
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minOrderAmount: number;
    maxDiscount?: number;
  };
  error?: string;
}

export interface DiscountCalculationResponse {
  valid: boolean;
  discountAmount?: number;
  finalAmount?: number;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PromoCodeService {
  private apiUrl = `${environment.apiUrl}/promo`;

  constructor(private http: HttpClient) {}

  validatePromoCode(code: string): Observable<PromoValidationResponse> {
    return this.http.post<PromoValidationResponse>(`${this.apiUrl}/validate`, { code });
  }

  calculateDiscount(
    code: string,
    orderAmount: number,
  ): Observable<DiscountCalculationResponse> {
    return this.http.post<DiscountCalculationResponse>(`${this.apiUrl}/calculate-discount`, {
      code,
      orderAmount,
    });
  }
}
