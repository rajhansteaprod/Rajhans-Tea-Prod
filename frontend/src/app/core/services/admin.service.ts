import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUser {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
  isActive: boolean;
  isPhoneVerified: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  customerUsers: number;
  todaySignups: number;
  weekSignups: number;
}

export interface DashboardResponse {
  success: boolean;
  data: {
    stats: DashboardStats;
    recentUsers: AdminUser[];
  };
}

export interface UserListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  role?: string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  getDashboardStats(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.apiUrl}/dashboard/stats`);
  }

  getUsers(params: UserListParams = {}): Observable<PaginatedResponse<AdminUser>> {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return this.http.get<PaginatedResponse<AdminUser>>(`${this.apiUrl}/users`, {
      params: httpParams,
    });
  }
}
