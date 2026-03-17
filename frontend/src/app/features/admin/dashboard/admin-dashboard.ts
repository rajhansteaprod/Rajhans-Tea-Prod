import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService, DashboardStats, AdminUser } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dash">
      <!-- Greeting -->
      <header class="dash-header animate-in" style="--i:0">
        <div>
          <p class="greeting">{{ getGreeting() }}, Admin</p>
          <h1 class="dash-title">Overview</h1>
        </div>
        <div class="header-actions">
          <div class="live-dot-container">
            <span class="live-dot"></span>
            <span class="live-text">Live</span>
          </div>
          <span class="date-text">{{ todayFormatted }}</span>
        </div>
      </header>

      <!-- KPI Cards -->
      <section class="kpi-grid">
        <div class="kpi-card animate-in" style="--i:1">
          <div class="kpi-top">
            <span class="kpi-label">Total Users</span>
            <div class="kpi-icon users">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stats()?.totalUsers ?? '—' }}</span>
            @if (stats()?.weekSignups) {
              <span class="kpi-change up">+{{ stats()!.weekSignups }} this week</span>
            }
          </div>
          <div class="kpi-bar">
            <div class="kpi-bar-fill users" [style.width.%]="getActivePercent()"></div>
          </div>
          <span class="kpi-footnote">{{ getActivePercent() }}% active</span>
        </div>

        <div class="kpi-card animate-in" style="--i:2">
          <div class="kpi-top">
            <span class="kpi-label">Active Users</span>
            <div class="kpi-icon active">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stats()?.activeUsers ?? '—' }}</span>
          </div>
          <div class="kpi-bar">
            <div class="kpi-bar-fill active" [style.width.%]="getActivePercent()"></div>
          </div>
          <span class="kpi-footnote">of {{ stats()?.totalUsers }} total</span>
        </div>

        <div class="kpi-card animate-in" style="--i:3">
          <div class="kpi-top">
            <span class="kpi-label">Customers</span>
            <div class="kpi-icon customers">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stats()?.customerUsers ?? '—' }}</span>
          </div>
          <div class="kpi-bar">
            <div class="kpi-bar-fill customers" [style.width.%]="getCustomerPercent()"></div>
          </div>
          <span class="kpi-footnote">{{ getCustomerPercent() }}% of users</span>
        </div>

        <div class="kpi-card animate-in" style="--i:4">
          <div class="kpi-top">
            <span class="kpi-label">Today's Signups</span>
            <div class="kpi-icon today">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="17 6 23 6 23 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stats()?.todaySignups ?? '—' }}</span>
          </div>
          <div class="kpi-bar">
            <div class="kpi-bar-fill today" style="width: 100%"></div>
          </div>
          <span class="kpi-footnote">{{ stats()?.weekSignups ?? 0 }} this week</span>
        </div>
      </section>

      <!-- Bottom Grid -->
      <section class="bottom-grid">
        <!-- Recent Users -->
        <div class="panel animate-in" style="--i:5">
          <div class="panel-header">
            <h2 class="panel-title">Recent Users</h2>
            <a routerLink="/admin/users" class="panel-link">View all →</a>
          </div>
          <div class="user-list">
            @for (user of recentUsers(); track user._id) {
              <div class="user-row">
                <div class="user-left">
                  <div class="avatar" [class.admin]="user.role === 'admin'">
                    {{ getInitials(user) }}
                  </div>
                  <div class="user-meta">
                    <span class="user-name">{{ getDisplayName(user) }}</span>
                    <span class="user-time">Joined {{ timeAgo(user.createdAt) }}</span>
                  </div>
                </div>
                <span class="role-pill" [class.admin]="user.role === 'admin'">{{ user.role }}</span>
              </div>
            }
            @if (!recentUsers().length && !loading()) {
              <div class="empty-state">No users yet</div>
            }
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="panel animate-in" style="--i:6">
          <div class="panel-header">
            <h2 class="panel-title">Quick Actions</h2>
          </div>
          <div class="actions-list">
            <a routerLink="/admin/users" class="action-row">
              <div class="action-icon users-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
                </svg>
              </div>
              <div class="action-meta">
                <span class="action-name">Manage Users</span>
                <span class="action-desc">View, search and filter all users</span>
              </div>
              <svg class="action-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
            <div class="action-row disabled">
              <div class="action-icon products-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="1.8"/>
                </svg>
              </div>
              <div class="action-meta">
                <span class="action-name">Add Products</span>
                <span class="action-desc">Create and manage your catalog</span>
              </div>
              <span class="soon-tag">Soon</span>
            </div>
            <div class="action-row disabled">
              <div class="action-icon orders-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.8"/>
                  <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.8"/>
                </svg>
              </div>
              <div class="action-meta">
                <span class="action-name">View Orders</span>
                <span class="action-desc">Track and manage customer orders</span>
              </div>
              <span class="soon-tag">Soon</span>
            </div>
            <div class="action-row disabled">
              <div class="action-icon analytics-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="action-meta">
                <span class="action-name">Analytics</span>
                <span class="action-desc">Revenue, traffic and insights</span>
              </div>
              <span class="soon-tag">Soon</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    @use '../../../core/design-tokens/mixins' as *;

    .dash { max-width: 1100px; }

    // === Stagger Animation ===
    .animate-in {
      opacity: 0;
      transform: translateY(16px);
      animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      animation-delay: calc(var(--i, 0) * 0.07s);
    }
    @keyframes fadeUp {
      to { opacity: 1; transform: translateY(0); }
    }

    // === Header ===
    .dash-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: $space-xl;
      gap: $space-md;
      flex-wrap: wrap;
    }

    .greeting {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin-bottom: $space-xxs;
    }

    .dash-title {
      font-family: $font-family-display;
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;

      @include respond-to(sm) {
        font-size: $font-size-xl;
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: $space-md;
    }

    .live-dot-container {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: $space-xxs $space-sm;
      background: rgba(87, 136, 108, 0.08);
      border-radius: $radius-full;
    }

    .live-dot {
      width: 7px;
      height: 7px;
      background: $color-success;
      border-radius: 50%;
      animation: livePulse 2s ease-in-out infinite;
    }

    @keyframes livePulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(87, 136, 108, 0.4); }
      50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(87, 136, 108, 0); }
    }

    .live-text {
      font-size: 11px;
      font-weight: $font-weight-semibold;
      color: $color-success;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .date-text {
      font-size: $font-size-sm;
      color: $color-text-tertiary;

      @include respond-to(xs) { display: none; }
    }

    // === KPI Grid ===
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: $space-md;
      margin-bottom: $space-xl;

      @include respond-to(lg) {
        grid-template-columns: repeat(2, 1fr);
      }

      @include respond-to(xs) {
        grid-template-columns: 1fr;
      }
    }

    .kpi-card {
      background: $color-bg-tertiary;
      border: 1px solid $color-border-light;
      border-radius: $radius-xl;
      padding: $space-lg;

      @include respond-to(xs) { padding: $space-md; }
      transition: all $transition-normal;
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        opacity: 0;
        transition: opacity $transition-normal;
      }

      &:hover {
        border-color: $color-border;
        box-shadow: $shadow-md;
        transform: translateY(-2px);

        &::before { opacity: 1; }
      }

      &:nth-child(1)::before { background: $color-primary; }
      &:nth-child(2)::before { background: $color-success; }
      &:nth-child(3)::before { background: $color-accent; }
      &:nth-child(4)::before { background: $color-secondary; }
    }

    .kpi-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: $space-md;
    }

    .kpi-label {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      color: $color-text-tertiary;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .kpi-icon {
      width: 36px;
      height: 36px;
      border-radius: $radius-md;
      display: flex;
      align-items: center;
      justify-content: center;

      &.users { background: $color-primary-light; color: $color-primary; }
      &.active { background: rgba(87, 136, 108, 0.1); color: $color-success; }
      &.customers { background: $color-accent-light; color: $color-accent; }
      &.today { background: rgba(87, 136, 108, 0.1); color: $color-secondary; }
    }

    .kpi-value-row {
      display: flex;
      align-items: baseline;
      gap: $space-sm;
      margin-bottom: $space-sm;
    }

    .kpi-value {
      font-family: $font-family-display;
      font-size: 32px;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
      line-height: 1;

      @include respond-to(xs) { font-size: 26px; }
    }

    .kpi-change {
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      padding: 1px $space-xs;
      border-radius: $radius-sm;

      &.up {
        color: $color-success;
        background: rgba(87, 136, 108, 0.08);
      }
    }

    .kpi-bar {
      height: 4px;
      background: $color-bg-secondary;
      border-radius: $radius-full;
      overflow: hidden;
      margin-bottom: $space-xs;
    }

    .kpi-bar-fill {
      height: 100%;
      border-radius: $radius-full;
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);

      &.users { background: $color-primary; }
      &.active { background: $color-success; }
      &.customers { background: $color-accent; }
      &.today { background: $color-secondary; }
    }

    .kpi-footnote {
      font-size: 11px;
      color: $color-text-disabled;
    }

    // === Bottom Grid ===
    .bottom-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: $space-md;

      @include respond-to(md) {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: $color-bg-tertiary;
      border: 1px solid $color-border-light;
      border-radius: $radius-xl;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: $space-lg $space-lg $space-sm;
    }

    .panel-title {
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
    }

    .panel-link {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      color: $color-primary;
      text-decoration: none;
      transition: color $transition-fast;

      &:hover { color: $color-primary-hover; }
    }

    // === User List ===
    .user-list {
      padding: $space-xs $space-sm $space-sm;
    }

    .user-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $space-sm $space-sm;
      border-radius: $radius-md;
      transition: background $transition-fast;

      &:hover { background: $color-bg-secondary; }
    }

    .user-left {
      display: flex;
      align-items: center;
      gap: $space-sm;
      min-width: 0;
    }

    .avatar {
      width: 34px;
      height: 34px;
      border-radius: $radius-md;
      background: $color-bg-secondary;
      color: $color-text-tertiary;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: $font-weight-bold;
      flex-shrink: 0;

      &.admin {
        background: $color-primary-light;
        color: $color-primary;
      }
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .user-name {
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      @include truncate;
    }

    .user-time {
      font-size: 11px;
      color: $color-text-disabled;
    }

    .role-pill {
      font-size: 10px;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      padding: 2px $space-xs;
      border-radius: $radius-sm;
      background: $color-bg-secondary;
      color: $color-text-tertiary;
      flex-shrink: 0;

      &.admin {
        background: $color-primary-light;
        color: $color-primary;
      }
    }

    .empty-state {
      text-align: center;
      padding: $space-xl;
      color: $color-text-disabled;
      font-size: $font-size-sm;
    }

    // === Actions ===
    .actions-list {
      padding: $space-xs $space-sm $space-sm;
    }

    .action-row {
      display: flex;
      align-items: center;
      gap: $space-sm;
      padding: $space-sm;
      border-radius: $radius-md;
      text-decoration: none;
      transition: all $transition-fast;
      cursor: pointer;

      &:hover:not(.disabled) {
        background: $color-bg-secondary;
        .action-chevron { transform: translateX(3px); color: $color-primary; }
      }

      &.disabled {
        opacity: 0.5;
        cursor: default;
      }
    }

    .action-icon {
      width: 36px;
      height: 36px;
      border-radius: $radius-md;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      &.users-icon { background: $color-primary-light; color: $color-primary; }
      &.products-icon { background: rgba(87, 136, 108, 0.1); color: $color-secondary; }
      &.orders-icon { background: $color-accent-light; color: $color-accent; }
      &.analytics-icon { background: rgba(58, 45, 50, 0.06); color: $color-text-secondary; }
    }

    .action-meta {
      flex: 1;
      min-width: 0;
    }

    .action-name {
      display: block;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    .action-desc {
      font-size: 11px;
      color: $color-text-disabled;
    }

    .action-chevron {
      color: $color-text-disabled;
      transition: all $transition-fast;
      flex-shrink: 0;
    }

    .soon-tag {
      font-size: 9px;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      color: $color-text-disabled;
      background: $color-bg-secondary;
      padding: 2px 6px;
      border-radius: $radius-sm;
      flex-shrink: 0;
    }
  `],
})
export class AdminDashboardComponent implements OnInit {
  stats = signal<DashboardStats | null>(null);
  recentUsers = signal<AdminUser[]>([]);
  loading = signal(true);
  todayFormatted: string;

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
  ) {
    const now = new Date();
    this.todayFormatted = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  ngOnInit(): void {
    this.adminService.getDashboardStats().subscribe({
      next: (res) => {
        this.stats.set(res.data.stats);
        this.recentUsers.set(res.data.recentUsers);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  getActivePercent(): number {
    const s = this.stats();
    if (!s || !s.totalUsers) return 0;
    return Math.round((s.activeUsers / s.totalUsers) * 100);
  }

  getCustomerPercent(): number {
    const s = this.stats();
    if (!s || !s.totalUsers) return 0;
    return Math.round((s.customerUsers / s.totalUsers) * 100);
  }

  getInitials(user: AdminUser): string {
    if (user.firstName) return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    return user.phone.slice(-2);
  }

  getDisplayName(user: AdminUser): string {
    if (user.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    return '+91 ' + user.phone;
  }

  timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
