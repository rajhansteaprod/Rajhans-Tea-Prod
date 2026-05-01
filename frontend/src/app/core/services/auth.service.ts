import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PlatformService } from './platform.service';

interface AuthUser {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
}

interface VerifyTokenResponse {
  success: boolean;
  data: {
    user: AuthUser;
    tokens: { accessToken: string };
    isNewUser: boolean;
  };
}

interface RefreshResponse {
  success: boolean;
  data: {
    tokens: { accessToken: string };
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly platform = inject(PlatformService);

  private _user = signal<AuthUser | null>(this.loadUserFromStorage());
  private _accessToken = signal<string | null>(this.loadTokenFromStorage());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  /** Update user data in signal + localStorage (e.g. after profile edit) */
  updateUser(partial: Partial<AuthUser>): void {
    const current = this._user();
    if (!current) return;
    const updated = { ...current, ...partial };
    this._user.set(updated);
    this.platform.localStorage.setItem('user', JSON.stringify(updated));
  }

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    // On app startup, validate stored session with backend
    if (this._user() && this._accessToken()) {
      this.validateSession();
    }
  }

  /** Send Firebase ID token to backend, get our JWT tokens back */
  verifyFirebaseToken(idToken: string): Observable<VerifyTokenResponse> {
    console.log('🔐 [Frontend] Sending idToken to backend:', {
      endpoint: `${this.apiUrl}/verify-token`,
      tokenLength: idToken.length,
      tokenPreview: idToken.substring(0, 50) + '...',
    });
    return this.http
      .post<VerifyTokenResponse>(`${this.apiUrl}/verify-token`, { idToken }, { withCredentials: true })
      .pipe(
        tap((res) => {
          console.log('✅ [Frontend] Backend verified successfully');
          this._user.set(res.data.user);
          this._accessToken.set(res.data.tokens.accessToken);
          this.platform.localStorage.setItem('user', JSON.stringify(res.data.user));
          this.platform.localStorage.setItem('accessToken', res.data.tokens.accessToken);
          // refreshToken is now in httpOnly cookie — not stored in localStorage
        }),
      );
  }

  refreshToken(): Observable<RefreshResponse> {
    // refreshToken is sent automatically via httpOnly cookie (withCredentials: true)
    return this.http
      .post<RefreshResponse>(`${this.apiUrl}/refresh-token`, {}, { withCredentials: true })
      .pipe(
        tap((res) => {
          this._accessToken.set(res.data.tokens.accessToken);
          this.platform.localStorage.setItem('accessToken', res.data.tokens.accessToken);
        }),
      );
  }


  private validateSession(): void {
    this.refreshToken()
      .pipe(
        tap(() => console.log('✅ Session validated on startup')),
        catchError((error) => {
          console.warn('Session validation failed, clearing stored credentials:', error);
          this.logout();
          return of(null);
        })
      )
      .subscribe();
  }
  logout(): void {
    this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true }).subscribe();
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
    this.platform.localStorage.removeItem('user');
    this.platform.localStorage.removeItem('accessToken');
  }

  private loadUserFromStorage(): AuthUser | null {
    const user = this.platform.localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  private loadTokenFromStorage(): string | null {
    return this.platform.localStorage.getItem('accessToken');
  }
}
