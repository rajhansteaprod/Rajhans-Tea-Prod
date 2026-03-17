import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

interface AuthUser {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

interface VerifyTokenResponse {
  success: boolean;
  data: {
    user: AuthUser;
    tokens: { accessToken: string; refreshToken: string };
    isNewUser: boolean;
  };
}

interface RefreshResponse {
  success: boolean;
  data: {
    tokens: { accessToken: string; refreshToken: string };
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  private _user = signal<AuthUser | null>(this.loadUserFromStorage());
  private _accessToken = signal<string | null>(this.loadTokenFromStorage());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  /** Send Firebase ID token to backend, get our JWT tokens back */
  verifyFirebaseToken(idToken: string): Observable<VerifyTokenResponse> {
    return this.http
      .post<VerifyTokenResponse>(`${this.apiUrl}/verify-token`, { idToken })
      .pipe(
        tap((res) => {
          this._user.set(res.data.user);
          this._accessToken.set(res.data.tokens.accessToken);
          localStorage.setItem('user', JSON.stringify(res.data.user));
          localStorage.setItem('accessToken', res.data.tokens.accessToken);
          localStorage.setItem('refreshToken', res.data.tokens.refreshToken);
        }),
      );
  }

  refreshToken(): Observable<RefreshResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http
      .post<RefreshResponse>(`${this.apiUrl}/refresh-token`, { refreshToken })
      .pipe(
        tap((res) => {
          this._accessToken.set(res.data.tokens.accessToken);
          localStorage.setItem('accessToken', res.data.tokens.accessToken);
          localStorage.setItem('refreshToken', res.data.tokens.refreshToken);
        }),
      );
  }

  logout(): void {
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe();
    this.clearAuth();
    this.router.navigate(['/auth/login']);
  }

  logoutBanned(): void {
    this.clearAuth();
    this.router.navigate(['/auth/login'], {
      queryParams: { reason: 'banned' },
    });
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  /**
   * Called once at app startup via APP_INITIALIZER.
   * Attempts a token refresh to validate the stored session.
   * If the refresh token was revoked (session deleted), clears auth state
   * so the user is immediately signed out on next page load.
   */
  initializeAuth(): Observable<unknown> {
    if (!this._user()) {
      return of(null); // not logged in — nothing to validate
    }
    return this.refreshToken().pipe(
      catchError(() => {
        this.clearAuth();
        return of(null);
      }),
    );
  }

  private clearAuth(): void {
    this._user.set(null);
    this._accessToken.set(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private loadUserFromStorage(): AuthUser | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  private loadTokenFromStorage(): string | null {
    return localStorage.getItem('accessToken');
  }
}
