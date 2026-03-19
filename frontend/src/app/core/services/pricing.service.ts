import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface QuantityTier {
  minQty: number;
  maxQty: number | null;
  discountPercent: number;
}

export type PriceRuleType = 'quantity_tier' | 'percentage' | 'fixed_price';
export type PriceRuleScope = 'product' | 'category' | 'collection' | 'global';

export interface PriceRule {
  _id: string;
  name: string;
  type: PriceRuleType;
  scope: PriceRuleScope;
  productId?: string;
  categoryId?: string;
  collectionId?: string;
  tiers?: QuantityTier[];
  discountPercent?: number;
  fixedPrice?: number;
  priority: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxRule {
  _id: string;
  name: string;
  categoryId?: string | null;
  rate: number;
  isInclusive: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceBreakdown {
  basePrice: number;
  qty: number;
  appliedRule: string | null;
  discountPercent: number;
  discountAmount: number;
  priceAfterDiscount: number;
  taxRate: number;
  taxAmount: number;
  isInclusive: boolean;
  finalPrice: number;
  unitPrice: number;
  totalPrice: number;
  isOnSale: boolean;
}

export interface CalculatePricePayload {
  productId: string;
  basePrice: number;
  categoryId?: string;
  collectionIds?: string[];
  qty?: number;
}

export interface CreatePriceRulePayload {
  name: string;
  type: PriceRuleType;
  scope: PriceRuleScope;
  productId?: string;
  categoryId?: string;
  collectionId?: string;
  tiers?: QuantityTier[];
  discountPercent?: number;
  fixedPrice?: number;
  priority?: number;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface CreateTaxRulePayload {
  name: string;
  categoryId?: string | null;
  rate: number;
  isInclusive?: boolean;
  isActive?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class PricingService {
  private adminUrl = '/api/v1/admin';
  private publicUrl = '/api/v1';

  constructor(private http: HttpClient) {}

  // ─── Calculate ─────────────────────────────────────────────────────────────

  calculate(payload: CalculatePricePayload): Observable<ApiResponse<PriceBreakdown>> {
    return this.http.post<ApiResponse<PriceBreakdown>>(
      `${this.publicUrl}/pricing/calculate`,
      payload,
    );
  }

  // ─── Price Rules ───────────────────────────────────────────────────────────

  getPriceRules(): Observable<ApiResponse<PriceRule[]>> {
    return this.http.get<ApiResponse<PriceRule[]>>(`${this.adminUrl}/pricing/rules`);
  }

  createPriceRule(payload: CreatePriceRulePayload): Observable<ApiResponse<PriceRule>> {
    return this.http.post<ApiResponse<PriceRule>>(`${this.adminUrl}/pricing/rules`, payload);
  }

  updatePriceRule(
    id: string,
    payload: Partial<CreatePriceRulePayload>,
  ): Observable<ApiResponse<PriceRule>> {
    return this.http.put<ApiResponse<PriceRule>>(`${this.adminUrl}/pricing/rules/${id}`, payload);
  }

  deletePriceRule(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.adminUrl}/pricing/rules/${id}`);
  }

  // ─── Tax Rules ─────────────────────────────────────────────────────────────

  getTaxRules(): Observable<ApiResponse<TaxRule[]>> {
    return this.http.get<ApiResponse<TaxRule[]>>(`${this.adminUrl}/pricing/tax-rules`);
  }

  createTaxRule(payload: CreateTaxRulePayload): Observable<ApiResponse<TaxRule>> {
    return this.http.post<ApiResponse<TaxRule>>(`${this.adminUrl}/pricing/tax-rules`, payload);
  }

  updateTaxRule(
    id: string,
    payload: Partial<CreateTaxRulePayload>,
  ): Observable<ApiResponse<TaxRule>> {
    return this.http.put<ApiResponse<TaxRule>>(`${this.adminUrl}/pricing/tax-rules/${id}`, payload);
  }

  deleteTaxRule(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.adminUrl}/pricing/tax-rules/${id}`);
  }
}
