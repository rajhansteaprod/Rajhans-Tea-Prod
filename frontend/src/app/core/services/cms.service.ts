import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeroSlide {
  _id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  desktopImage: string;
  mobileImage: string;
  textAlign: 'left' | 'center' | 'right';
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class CmsService {
  private readonly adminUrl = `${environment.apiUrl}/admin/cms`;
  private readonly publicUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  // --- Public ---

  getActiveHeroSlides(): Observable<ApiResponse<HeroSlide[]>> {
    return this.http.get<ApiResponse<HeroSlide[]>>(`${this.publicUrl}/hero-slides`);
  }

  // --- Admin: Hero Slides ---

  getHeroSlides(): Observable<ApiResponse<HeroSlide[]>> {
    return this.http.get<ApiResponse<HeroSlide[]>>(`${this.adminUrl}/hero-slides`);
  }

  createHeroSlide(formData: FormData): Observable<ApiResponse<HeroSlide>> {
    return this.http.post<ApiResponse<HeroSlide>>(`${this.adminUrl}/hero-slides`, formData);
  }

  updateHeroSlide(id: string, formData: FormData): Observable<ApiResponse<HeroSlide>> {
    return this.http.put<ApiResponse<HeroSlide>>(`${this.adminUrl}/hero-slides/${id}`, formData);
  }

  deleteHeroSlide(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/hero-slides/${id}`);
  }

  reorderHeroSlides(orderedIds: string[]): Observable<ApiResponse<HeroSlide[]>> {
    return this.http.patch<ApiResponse<HeroSlide[]>>(`${this.adminUrl}/hero-slides/reorder`, { orderedIds });
  }
}
