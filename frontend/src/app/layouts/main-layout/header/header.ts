import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="header">
      <div class="header-inner">
        <a routerLink="/" class="logo">
          <span class="logo-mark">R</span>
          <span class="logo-text">Rajhans</span>
        </a>
        <div class="header-right">
          @if (authService.isLoggedIn()) {
            <a routerLink="/dashboard" class="nav-link">Dashboard</a>
            @if (authService.isAdmin()) {
              <a routerLink="/admin" class="nav-link admin-link">Admin Panel</a>
            }
            <div class="user-pill">
              <span class="user-avatar">{{ getInitials() }}</span>
              <span class="user-phone">{{ authService.user()?.phone }}</span>
            </div>
            <button class="btn-logout" (click)="authService.logout()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          } @else {
            <a routerLink="/auth/login" class="btn-login">Sign In</a>
          }
        </div>
      </div>
    </header>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .header {
      background: $color-bg-tertiary;
      border-bottom: 1px solid $color-border-light;
      padding: 0 $space-xxl;
      height: 64px;
      display: flex;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: $z-sticky;
      backdrop-filter: blur(12px);
      background: rgba(255, 255, 255, 0.9);
    }

    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: $space-sm;
      text-decoration: none;
    }

    .logo-mark {
      width: 32px;
      height: 32px;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-md;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      font-family: $font-family-display;
    }

    .logo-text {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
      font-family: $font-family-display;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: $space-md;
    }

    .nav-link {
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-secondary;
      text-decoration: none;
      transition: color $transition-fast;

      &:hover {
        color: $color-primary;
      }
    }

    .admin-link {
      color: $color-primary;
      font-weight: $font-weight-semibold;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-xxs $space-sm $space-xxs $space-xxs;
      border-radius: $radius-full;
      background: $color-bg-secondary;
      border: 1px solid $color-border-light;
    }

    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: $color-primary-light;
      color: $color-primary;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
    }

    .user-phone {
      font-size: $font-size-sm;
      color: $color-text-secondary;
      font-weight: $font-weight-medium;
    }

    .btn-logout {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: $radius-md;
      border: 1px solid $color-border-light;
      background: transparent;
      color: $color-text-tertiary;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover {
        background: rgba(192, 57, 43, 0.06);
        border-color: rgba(192, 57, 43, 0.2);
        color: $color-error;
      }
    }

    .btn-login {
      display: inline-flex;
      align-items: center;
      padding: $space-xs $space-lg;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      text-decoration: none;
      transition: all $transition-fast;

      &:hover {
        background: $color-primary-hover;
        color: $color-text-inverse;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(204, 88, 3, 0.25);
      }
    }
  `],
})
export class HeaderComponent {
  constructor(public authService: AuthService) {}

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }
}
