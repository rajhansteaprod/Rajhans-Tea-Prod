import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard">
      <!-- Welcome Section -->
      <div class="welcome-section animate-in">
        <div class="welcome-text">
          <div class="greeting-badge">
            <span class="wave">{{ getGreetingEmoji() }}</span>
            {{ getGreeting() }}
          </div>
          <h1 class="welcome-title">
            Welcome back{{ userName() ? ', ' + userName() : '' }}
          </h1>
          <p class="welcome-subtitle">
            Here's what's happening with your {{ isAdmin() ? 'store' : 'account' }} today.
          </p>
        </div>
        <div class="welcome-avatar">
          <div class="avatar" [class.admin]="isAdmin()">
            {{ getInitials() }}
          </div>
          @if (isAdmin()) {
            <span class="role-badge">Admin</span>
          }
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        @for (stat of stats(); track stat.label) {
          <div class="stat-card animate-in" [style.--delay]="$index * 0.1 + 's'">
            <div class="stat-icon" [style.background]="stat.color + '12'" [style.color]="stat.color">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" [innerHTML]="stat.icon"></svg>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </div>
        }
      </div>

      <!-- Quick Actions -->
      <div class="section animate-in" style="--delay: 0.4s">
        <h2 class="section-title">Quick Actions</h2>
        <div class="actions-grid">
          @for (action of actions(); track action.label) {
            <button class="action-card" (click)="onAction(action.route)">
              <div class="action-icon">{{ action.emoji }}</div>
              <span class="action-label">{{ action.label }}</span>
              <svg class="action-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          }
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="section animate-in" style="--delay: 0.5s">
        <h2 class="section-title">Account Info</h2>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Phone</span>
            <span class="info-value">+91 {{ authService.user()?.phone }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Role</span>
            <span class="info-value capitalize">{{ authService.user()?.role }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Account ID</span>
            <span class="info-value mono">{{ authService.user()?._id?.slice(0, 12) }}...</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @use '../../core/design-tokens/tokens' as *;
    @use '../../core/design-tokens/mixins' as *;

    .dashboard {
      padding: $space-xl 0;
      max-width: 960px;
      margin: 0 auto;
    }

    .animate-in {
      opacity: 0;
      transform: translateY(16px);
      animation: fadeUp 0.5s ease forwards;
      animation-delay: var(--delay, 0s);
    }

    @keyframes fadeUp {
      to { opacity: 1; transform: translateY(0); }
    }

    // === Welcome ===
    .welcome-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: $space-xl;
      gap: $space-lg;
    }

    .greeting-badge {
      display: inline-flex;
      align-items: center;
      gap: $space-xs;
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin-bottom: $space-sm;
    }

    .welcome-title {
      font-family: $font-family-display;
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
      margin-bottom: $space-xs;

      @include respond-to(sm) {
        font-size: $font-size-xl;
      }
    }

    .welcome-subtitle {
      font-size: $font-size-md;
      color: $color-text-tertiary;
    }

    .welcome-avatar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $space-xs;
      flex-shrink: 0;
    }

    .avatar {
      width: 64px;
      height: 64px;
      border-radius: $radius-xl;
      background: $color-bg-secondary;
      color: $color-text-secondary;
      @include flex-center;
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      border: 2px solid $color-border-light;

      &.admin {
        background: $color-primary-light;
        color: $color-primary;
        border-color: rgba(204, 88, 3, 0.2);
      }
    }

    .role-badge {
      font-size: 10px;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      color: $color-primary;
      background: $color-primary-light;
      padding: 2px $space-xs;
      border-radius: $radius-full;
    }

    // === Stats ===
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: $space-md;
      margin-bottom: $space-xl;
    }

    .stat-card {
      @include card;
      padding: $space-lg;
      display: flex;
      align-items: center;
      gap: $space-md;
      transition: all $transition-normal;

      &:hover {
        transform: translateY(-2px);
        box-shadow: $shadow-md;
      }
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: $radius-lg;
      @include flex-center;
      flex-shrink: 0;

      ::ng-deep svg {
        width: 24px;
        height: 24px;
      }

      ::ng-deep path, ::ng-deep circle, ::ng-deep rect {
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
    }

    .stat-label {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
    }

    // === Sections ===
    .section {
      margin-bottom: $space-xl;
    }

    .section-title {
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin-bottom: $space-md;
    }

    // === Actions ===
    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: $space-sm;
    }

    .action-card {
      @include card;
      padding: $space-md $space-lg;
      display: flex;
      align-items: center;
      gap: $space-sm;
      border: none;
      cursor: pointer;
      font-family: $font-family;
      transition: all $transition-normal;
      text-align: left;
      width: 100%;

      &:hover {
        background: $color-bg-secondary;
        transform: translateX(4px);

        .action-arrow {
          transform: translateX(4px);
          color: $color-primary;
        }
      }
    }

    .action-icon {
      font-size: 20px;
      line-height: 1;
    }

    .action-label {
      flex: 1;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    .action-arrow {
      color: $color-text-disabled;
      transition: all $transition-fast;
      flex-shrink: 0;
    }

    // === Info Card ===
    .info-card {
      @include card;
      padding: 0;
      overflow: hidden;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: $space-md $space-lg;

      &:not(:last-child) {
        border-bottom: 1px solid $color-border-light;
      }
    }

    .info-label {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
    }

    .info-value {
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-primary;

      &.capitalize {
        text-transform: capitalize;
      }

      &.mono {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: $font-size-xs;
        color: $color-text-secondary;
      }
    }
  `],
})
export class DashboardComponent implements OnInit {
  stats = signal<{ label: string; value: string; color: string; icon: string }[]>([]);
  actions = signal<{ label: string; emoji: string; route: string }[]>([]);

  constructor(
    public authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const isAdmin = this.isAdmin();

    this.stats.set(
      isAdmin
        ? [
            { label: 'Total Orders', value: '0', color: '#CC5803', icon: '<path d="M3 3h18l-2 13H5L3 3ZM1 1h4"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' },
            { label: 'Products', value: '0', color: '#57886C', icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/>' },
            { label: 'Customers', value: '0', color: '#A27E8E', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
            { label: 'Revenue', value: '₹0', color: '#3A2D32', icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
          ]
        : [
            { label: 'My Orders', value: '0', color: '#CC5803', icon: '<path d="M3 3h18l-2 13H5L3 3ZM1 1h4"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' },
            { label: 'Wishlist', value: '0', color: '#A27E8E', icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>' },
            { label: 'Addresses', value: '0', color: '#57886C', icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>' },
          ],
    );

    this.actions.set(
      isAdmin
        ? [
            { label: 'Manage Products', emoji: '📦', route: '/admin/products' },
            { label: 'View Orders', emoji: '📋', route: '/admin/orders' },
            { label: 'Customer List', emoji: '👥', route: '/admin/customers' },
            { label: 'Store Settings', emoji: '⚙️', route: '/admin/settings' },
          ]
        : [
            { label: 'Browse Products', emoji: '🛍️', route: '/products' },
            { label: 'My Orders', emoji: '📦', route: '/orders' },
            { label: 'My Addresses', emoji: '📍', route: '/addresses' },
            { label: 'Edit Profile', emoji: '👤', route: '/profile' },
          ],
    );
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  userName(): string {
    const user = this.authService.user();
    return user?.firstName || '';
  }

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  getGreetingEmoji(): string {
    const hour = new Date().getHours();
    if (hour < 12) return '☀️';
    if (hour < 17) return '🌤️';
    return '🌙';
  }

  onAction(route: string): void {
    this.router.navigate([route]);
  }
}
