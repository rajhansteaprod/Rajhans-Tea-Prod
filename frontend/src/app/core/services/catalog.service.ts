import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ---------------------------------------------------------------------------
// Shared response shapes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface CategoryRef {
  _id: string;
  name: string;
  slug: string;
}

export interface Category extends CategoryRef {
  description?: string;
  image?: string;
  parent: CategoryRef | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: CategoryRef;
  collections: { _id: string; name: string; slug: string }[];
  basePrice: number;
  images: string[];
  attributes: Record<string, string>;
  tags: string[];
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface CreateCategoryPayload {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryPayload extends Partial<CreateCategoryPayload> {
  parentId?: string | null;
  isActive?: boolean;
}

export interface CreateCollectionPayload {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface UpdateCollectionPayload extends Partial<CreateCollectionPayload> {
  isActive?: boolean;
}

export interface CreateProductPayload {
  name: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  categoryId: string;
  collectionIds?: string[];
  basePrice: number;
  images?: string[];
  attributes?: Record<string, string>;
  tags?: string[];
  status?: 'draft' | 'active' | 'archived';
  isFeatured?: boolean;
}

export interface UpdateProductPayload extends Partial<CreateProductPayload> {}

export interface ProductListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  categoryId?: string;
  collectionId?: string;
  status?: string;
  isFeatured?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly adminUrl  = `${environment.apiUrl}/admin`;
  private readonly publicUrl = `${environment.apiUrl}/catalog`;

  constructor(private http: HttpClient) {}

  // --- Categories ---

  getCategories(params: Record<string, string | number | boolean> = {}): Observable<PaginatedResponse<Category>> {
    let httpParams = new HttpParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') httpParams = httpParams.set(k, String(v));
    }
    return this.http.get<PaginatedResponse<Category>>(`${this.adminUrl}/categories`, { params: httpParams });
  }

  getCategoriesPublic(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(`${this.publicUrl}/categories`);
  }

  createCategory(payload: CreateCategoryPayload): Observable<ApiResponse<Category>> {
    return this.http.post<ApiResponse<Category>>(`${this.adminUrl}/categories`, payload);
  }

  updateCategory(id: string, payload: UpdateCategoryPayload): Observable<ApiResponse<Category>> {
    return this.http.put<ApiResponse<Category>>(`${this.adminUrl}/categories/${id}`, payload);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/categories/${id}`);
  }

  // --- Collections ---

  getCollections(params: Record<string, string | number> = {}): Observable<PaginatedResponse<Collection>> {
    let httpParams = new HttpParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') httpParams = httpParams.set(k, String(v));
    }
    return this.http.get<PaginatedResponse<Collection>>(`${this.adminUrl}/collections`, { params: httpParams });
  }

  getCollectionsPublic(): Observable<ApiResponse<Collection[]>> {
    return this.http.get<ApiResponse<Collection[]>>(`${this.publicUrl}/collections`);
  }

  createCollection(payload: CreateCollectionPayload): Observable<ApiResponse<Collection>> {
    return this.http.post<ApiResponse<Collection>>(`${this.adminUrl}/collections`, payload);
  }

  updateCollection(id: string, payload: UpdateCollectionPayload): Observable<ApiResponse<Collection>> {
    return this.http.put<ApiResponse<Collection>>(`${this.adminUrl}/collections/${id}`, payload);
  }

  deleteCollection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/collections/${id}`);
  }

  // --- Products ---

  getProducts(params: ProductListParams = {}): Observable<PaginatedResponse<Product>> {
    let httpParams = new HttpParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') httpParams = httpParams.set(k, String(v));
    }
    return this.http.get<PaginatedResponse<Product>>(`${this.adminUrl}/products`, { params: httpParams });
  }

  getProduct(id: string): Observable<ApiResponse<Product>> {
    return this.http.get<ApiResponse<Product>>(`${this.adminUrl}/products/${id}`);
  }

  createProduct(payload: CreateProductPayload): Observable<ApiResponse<Product>> {
    return this.http.post<ApiResponse<Product>>(`${this.adminUrl}/products`, payload);
  }

  updateProduct(id: string, payload: UpdateProductPayload): Observable<ApiResponse<Product>> {
    return this.http.put<ApiResponse<Product>>(`${this.adminUrl}/products/${id}`, payload);
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/products/${id}`);
  }

  // --- Image upload ---

  uploadImage(file: File): Observable<ApiResponse<{ url: string }>> {
    const form = new FormData();
    form.append('image', file);
    return this.http.post<ApiResponse<{ url: string }>>(`${this.adminUrl}/uploads`, form);
  }
}
