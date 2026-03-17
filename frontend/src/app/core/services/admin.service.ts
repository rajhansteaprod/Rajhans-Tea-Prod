import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ---------------------------------------------------------------------------
// Shared response wrapper
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

export interface AdminUser {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
  isActive: boolean;
  isPhoneVerified: boolean;
  avatar?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Dashboard types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

/**
 * Represents one active session (refresh token) for a user.
 * Returned by GET /admin/users/:userId/sessions.
 */
export interface SessionView {
  _id: string;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  ip: string;           // masked: "192.168.1.xxx"
  fullIp: string;       // unmasked (admin only)
  userAgent: string;    // raw UA string (admin only)
  isCurrent: boolean;
  createdAt: string;
  lastUsedAt: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  // --- Dashboard ---

  getDashboardStats(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.apiUrl}/dashboard/stats`);
  }

  // --- Users ---

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

  // --- Sessions ---

  /**
   * List all active sessions for a specific user.
   * Returns the admin view (full IP + raw UA).
   */
  getUserSessions(userId: string): Observable<ApiResponse<SessionView[]>> {
    return this.http.get<ApiResponse<SessionView[]>>(
      `${this.apiUrl}/users/${userId}/sessions`,
    );
  }

  /**
   * Revoke a single session by its token document ID.
   * Admin can revoke any session regardless of which user it belongs to.
   */
  revokeSession(sessionId: string): Observable<ApiResponse<{ userId: string; deviceName: string }>> {
    return this.http.delete<ApiResponse<{ userId: string; deviceName: string }>>(
      `${this.apiUrl}/sessions/${sessionId}`,
    );
  }

  /**
   * Force-logout ALL sessions for a user.
   * Equivalent to the "Kick user off all devices" action.
   */
  revokeAllSessions(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${userId}/sessions`);
  }
}
