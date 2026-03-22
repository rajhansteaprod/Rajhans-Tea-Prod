import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CartStore } from '../../../core/services/cart.store';
import { SearchStore } from '../../../core/services/search.store';
import { NotificationStore } from '../../../core/services/notification.store';
import { ThemeService } from '../../../core/services/theme.service';
import { I18nService } from '../../../core/services/i18n.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="header">
      <div class="header-inner">
        <a routerLink="/" class="logo">
          <span class="logo-mark">R</span>
          <span class="logo-text">Rajhans Tea</span>
        </a>
        <!-- Search Bar -->
        <div class="search-bar-wrap">
          <div class="search-input-wrap">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input
              class="search-input"
              placeholder="Search products..."
              [(ngModel)]="searchQuery"
              (input)="searchStore.autocomplete(searchQuery)"
              (keyup.enter)="doSearch()"
              (focus)="searchStore.autocomplete(searchQuery)"
              (keyup.escape)="searchStore.closeSuggestions()"
            />
          </div>
          @if (searchStore.suggestionsOpen()) {
            <div class="suggestions-dropdown">
              @for (s of searchStore.suggestions(); track s.slug) {
                <a class="suggestion-item" (click)="selectSuggestion(s)">
                  @if (s.type === 'product' && s.image) {
                    <img [src]="s.image" class="suggestion-img" />
                  } @else {
                    <div class="suggestion-icon">
                      @if (s.type === 'category') {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2"/></svg>
                      } @else {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>
                      }
                    </div>
                  }
                  <div class="suggestion-text">
                    <span class="suggestion-name">{{ s.name }}</span>
                    <span class="suggestion-type">{{ s.type }}</span>
                  </div>
                </a>
              }
            </div>
          }
        </div>

        <div class="header-right">
          @if (authService.isLoggedIn()) {
            <a routerLink="/orders" class="nav-link">Orders</a>
            <a routerLink="/wallet" class="nav-link">Wallet</a>
            @if (authService.isAdmin()) {
              <a routerLink="/admin" class="nav-link admin-link">Admin</a>
            }
          }

          <!-- Wishlist -->
          <a routerLink="/wishlist" class="icon-btn" title="Wishlist">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
            @if (cartStore.wishlistIds().size > 0) {
              <span class="icon-badge">{{ cartStore.wishlistIds().size }}</span>
            }
          </a>

          <!-- Notifications Bell -->
          @if (authService.isLoggedIn()) {
            <button class="icon-btn" (click)="notifStore.toggleDrawer()" title="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              @if (notifStore.unreadCount() > 0) {
                <span class="icon-badge notif-badge">{{ notifStore.unreadCount() > 9 ? '9+' : notifStore.unreadCount() }}</span>
              }
            </button>
          }

          <!-- Cart -->
          <button class="icon-btn" (click)="cartStore.toggleSidebar()" title="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/>
              <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="2"/>
            </svg>
            @if (cartStore.cartCount() > 0) {
              <span class="icon-badge cart-badge">{{ cartStore.cartCount() }}</span>
            }
          </button>

          <!-- Language Toggle -->
          <button class="lang-btn" (click)="i18n.toggle()" [title]="i18n.language() === 'en' ? 'हिन्दी' : 'English'">
            {{ i18n.language() === 'en' ? 'हि' : 'EN' }}
          </button>

          <!-- Theme Toggle -->
          <button class="icon-btn theme-toggle" (click)="themeService.toggle()" [title]="themeService.theme() === 'light' ? 'Dark mode' : 'Light mode'">
            @if (themeService.theme() === 'light') {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            } @else {
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            }
          </button>

          @if (authService.isLoggedIn()) {
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

    // ── Search Bar ──────────────────────────────────────────────────────────
    .search-bar-wrap {
      position: relative;
      flex: 1;
      max-width: 420px;
      margin: 0 $space-lg;
    }

    .search-input-wrap {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-xs $space-md;
      background: $color-bg-secondary;
      border: 1px solid $color-border-light;
      border-radius: $radius-full;
      transition: all $transition-fast;

      &:focus-within {
        border-color: $color-primary;
        background: $color-bg-tertiary;
        box-shadow: $shadow-glow;
      }
    }

    .search-icon { color: $color-text-tertiary; flex-shrink: 0; }

    .search-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: $font-size-sm;
      color: $color-text-primary;
      font-family: $font-family;

      &::placeholder { color: $color-text-disabled; }
    }

    .suggestions-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: $color-bg-tertiary;
      border: 1px solid $color-border;
      border-radius: $radius-lg;
      box-shadow: $shadow-xl;
      z-index: $z-dropdown;
      max-height: 320px;
      overflow-y: auto;
    }

    .suggestion-item {
      display: flex;
      align-items: center;
      gap: $space-sm;
      padding: $space-sm $space-md;
      cursor: pointer;
      text-decoration: none;
      color: $color-text-primary;
      transition: background $transition-fast;

      &:hover { background: $color-bg-secondary; }
    }

    .suggestion-img {
      width: 32px;
      height: 32px;
      border-radius: $radius-sm;
      object-fit: cover;
    }

    .suggestion-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: $color-bg-secondary;
      border-radius: $radius-sm;
      color: $color-text-tertiary;
    }

    .suggestion-text { display: flex; flex-direction: column; gap: 1px; }
    .suggestion-name { font-size: $font-size-sm; font-weight: $font-weight-medium; }
    .suggestion-type { font-size: 10px; color: $color-text-tertiary; text-transform: uppercase; }

    .lang-btn {
      padding: 4px 8px;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      background: transparent;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
      color: $color-text-secondary;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover {
        border-color: $color-primary;
        color: $color-primary;
      }
    }

    .icon-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: $radius-md;
      border: 1px solid $color-border-light;
      background: transparent;
      color: $color-text-secondary;
      cursor: pointer;
      transition: all $transition-fast;
      text-decoration: none;

      &:hover {
        background: $color-bg-secondary;
        color: $color-primary;
        border-color: $color-primary;
      }
    }

    .icon-badge {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-full;
      font-size: 10px;
      font-weight: $font-weight-bold;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid $color-bg-tertiary;
    }

    .cart-badge {
      background: $color-primary;
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
  readonly authService = inject(AuthService);
  readonly cartStore = inject(CartStore);
  readonly searchStore = inject(SearchStore);
  readonly notifStore = inject(NotificationStore);
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  searchQuery = '';

  doSearch(): void {
    if (this.searchQuery.trim()) {
      this.searchStore.closeSuggestions();
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
    }
  }

  selectSuggestion(s: { type: string; name: string; slug: string }): void {
    this.searchStore.closeSuggestions();
    if (s.type === 'category') {
      this.router.navigate(['/search'], { queryParams: { category: s.slug } });
    } else {
      this.searchQuery = s.name;
      this.router.navigate(['/search'], { queryParams: { q: s.name } });
    }
  }

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }
}
