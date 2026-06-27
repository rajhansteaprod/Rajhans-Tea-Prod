import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PromoValidationResponse {
  valid: boolean;
  discountAmount?: number;
  message?: string;
}

export interface AppliedDiscount {
  type: 'promo_code' | 'offer' | null;
  discountId?: string;
  code?: string;
  title?: string;
  discountAmount: number;
  finalAmount: number;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class PromoCodeService {
  private apiUrl = `${environment.apiUrl}/discounts`;

  constructor(private http: HttpClient) {}

  validatePromoCode(code: string, cartTotal: number): Observable<PromoValidationResponse> {
    return this.http.post<PromoValidationResponse>(`${this.apiUrl}/validate-promo`, {
      code,
      cartTotal,
    });
  }

  applyDiscount(
    cartTotal: number,
    promoCode?: string,
  ): Observable<AppliedDiscount> {
    return this.http.post<AppliedDiscount>(`${this.apiUrl}/apply`, {
      cartTotal,
      promoCode,
    });
  }
}
