import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
  collapsed: boolean;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin-shell">
      <!-- Mobile header -->
      <div class="mobile-header">
        <button class="menu-toggle" (click)="sidebarOpen.set(!sidebarOpen())">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12h18M3 6h18M3 18h18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <span class="mobile-title">Rajhans Admin</span>
      </div>

      <!-- Sidebar overlay -->
      @if (sidebarOpen()) {
        <div class="sidebar-overlay" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- Sidebar -->
      <aside class="sidebar" [class.open]="sidebarOpen()">
        <div class="sidebar-header">
          <a routerLink="/admin" class="sidebar-logo">
            <span class="logo-mark">R</span>
            <span class="logo-text">Rajhans</span>
          </a>
          <span class="env-badge">Admin</span>
        </div>

        <nav class="sidebar-nav">
          @for (section of navSections; track section.label) {
            <div class="nav-group">
              <button class="nav-group-header" (click)="toggleSection(section)">
                <span class="nav-group-label">{{ section.label }}</span>
                <svg class="nav-chevron" [class.collapsed]="section.collapsed" width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              @if (!section.collapsed) {
                <div class="nav-group-items">
                  @for (item of section.items; track item.route) {
                    <a
                      class="nav-item"
                      [routerLink]="item.route"
                      routerLinkActive="active"
                      [routerLinkActiveOptions]="{ exact: item.route === '/admin' }"
                      (click)="sidebarOpen.set(false)"
                    >
                      <span class="nav-icon" [innerHTML]="item.icon"></span>
                      <span class="nav-label">{{ item.label }}</span>
                    </a>
                  }
                </div>
              }
            </div>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">{{ getInitials() }}</div>
            <div class="user-details">
              <span class="user-name">{{ authService.user()?.phone }}</span>
              <span class="user-role">Administrator</span>
            </div>
          </div>
          <a routerLink="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 12H5M5 12L12 19M5 12L12 5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Back to Store
          </a>
        </div>
      </aside>

      <!-- Main content -->
      <main class="admin-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      @use '../../core/design-tokens/tokens' as *;
      @use '../../core/design-tokens/mixins' as *;

      .admin-shell {
        display: flex;
        min-height: 100vh;
        background: $color-bg-secondary;
      }

      // === Mobile Header ===
      .mobile-header {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 56px;
        background: $color-bg-dark;
        color: $color-text-inverse;
        padding: 0 $space-md;
        align-items: center;
        gap: $space-sm;
        z-index: $z-fixed;

        @include respond-to(md) {
          display: flex;
        }
      }

      .menu-toggle {
        background: none;
        border: none;
        color: $color-text-inverse;
        cursor: pointer;
        padding: $space-xs;
      }

      .mobile-title {
        font-weight: $font-weight-semibold;
        font-size: $font-size-md;
      }

      // === Sidebar ===
      .sidebar {
        width: 260px;
        background: $color-bg-dark;
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: $z-fixed;
        transition: transform $transition-normal;

        @include respond-to(md) {
          transform: translateX(-100%);
          &.open {
            transform: translateX(0);
          }
        }
      }

      .sidebar-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: #{$z-fixed - 1};

        @include respond-to(md) {
          display: block;
        }
      }

      .sidebar-header {
        padding: $space-lg $space-lg $space-md;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .sidebar-logo {
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
        font-size: $font-size-sm;
        font-weight: $font-weight-bold;
      }

      .logo-text {
        font-size: $font-size-lg;
        font-weight: $font-weight-bold;
        color: $color-text-inverse;
        letter-spacing: $letter-spacing-tight;
      }

      .env-badge {
        font-size: 10px;
        font-weight: $font-weight-semibold;
        text-transform: uppercase;
        letter-spacing: $letter-spacing-wide;
        color: $color-primary;
        background: rgba(204, 88, 3, 0.15);
        padding: 2px $space-xs;
        border-radius: $radius-sm;
      }

      // === Navigation ===
      .sidebar-nav {
        flex: 1;
        padding: $space-md $space-sm;
        overflow-y: auto;
      }

      .nav-group {
        margin-bottom: $space-xs;
      }

      .nav-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: $space-xs $space-md;
        border: none;
        background: transparent;
        cursor: pointer;
        margin-bottom: $space-xxs;
      }

      .nav-group-label {
        font-size: 10px;
        font-weight: $font-weight-bold;
        text-transform: uppercase;
        letter-spacing: $letter-spacing-wide;
        color: rgba(252, 255, 247, 0.35);
      }

      .nav-chevron {
        color: rgba(252, 255, 247, 0.2);
        transition: transform $transition-fast;

        &.collapsed {
          transform: rotate(-90deg);
        }
      }

      .nav-group-items {
        animation: slideDown $transition-fast;
      }

      @keyframes slideDown {
        from { opacity: 0; max-height: 0; }
        to { opacity: 1; max-height: 500px; }
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: $space-sm;
        padding: $space-sm $space-md;
        border-radius: $radius-md;
        color: rgba(252, 255, 247, 0.6);
        text-decoration: none;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        transition: all $transition-fast;
        cursor: pointer;
        margin-bottom: 2px;

        &:hover:not(.disabled) {
          background: rgba(252, 255, 247, 0.06);
          color: $color-text-inverse;
        }

        &.active {
          background: rgba(204, 88, 3, 0.15);
          color: $color-primary;

          .nav-icon {
            color: $color-primary;
          }
        }

        &.disabled {
          opacity: 0.4;
          cursor: default;
        }
      }

      .nav-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        ::ng-deep svg {
          width: 18px;
          height: 18px;
        }

        ::ng-deep path,
        ::ng-deep circle,
        ::ng-deep rect,
        ::ng-deep polyline,
        ::ng-deep line {
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }
      }

      .nav-label {
        flex: 1;
      }

      .coming-soon {
        font-size: 9px;
        font-weight: $font-weight-semibold;
        text-transform: uppercase;
        letter-spacing: $letter-spacing-wide;
        color: rgba(252, 255, 247, 0.25);
        background: rgba(252, 255, 247, 0.06);
        padding: 1px 6px;
        border-radius: $radius-sm;
      }

      // === Footer ===
      .sidebar-footer {
        padding: $space-md $space-lg;
        border-top: 1px solid rgba(252, 255, 247, 0.06);
      }

      .user-info {
        display: flex;
        align-items: center;
        gap: $space-sm;
        margin-bottom: $space-sm;
      }

      .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: $radius-md;
        background: rgba(204, 88, 3, 0.2);
        color: $color-primary;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: $font-size-xs;
        font-weight: $font-weight-bold;
        flex-shrink: 0;
      }

      .user-details {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .user-name {
        font-size: $font-size-sm;
        color: $color-text-inverse;
        font-weight: $font-weight-medium;
      }

      .user-role {
        font-size: $font-size-xs;
        color: rgba(252, 255, 247, 0.4);
      }

      .back-link {
        display: flex;
        align-items: center;
        gap: $space-xs;
        font-size: $font-size-xs;
        color: rgba(252, 255, 247, 0.4);
        text-decoration: none;
        transition: color $transition-fast;

        &:hover {
          color: $color-text-inverse;
        }
      }

      // === Main Content ===
      .admin-content {
        flex: 1;
        margin-left: 260px;
        padding: $space-xl $space-xl;
        min-height: 100vh;

        @include respond-to(md) {
          margin-left: 0;
          padding: 72px $space-md $space-lg;
        }

        @include respond-to(xs) {
          padding: 60px $space-sm $space-md;
        }
      }
    `,
  ],
})
export class AdminLayoutComponent {
  sidebarOpen = signal(false);

  navSections: NavSection[] = [
    {
      label: 'MAIN',
      collapsed: false,
      items: [
        { label: 'Dashboard', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>', route: '/admin' },
      ],
    },
    {
      label: 'CATALOG',
      collapsed: false,
      items: [
        { label: 'Products', icon: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', route: '/admin/products' },
        { label: 'Categories', icon: '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>', route: '/admin/categories' },
        { label: 'Collections', icon: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', route: '/admin/collections' },
        { label: 'Pricing', icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>', route: '/admin/pricing' },
      ],
    },
    {
      label: 'ORDERS & FULFILLMENT',
      collapsed: false,
      items: [
        { label: 'Orders', icon: '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/orders' },
        { label: 'Inventory', icon: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/inventory' },
        { label: 'Warehouses', icon: '<svg viewBox="0 0 24 24"><path d="M3 21h18M3 7v14M21 7v14M3 7l9-4 9 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>', route: '/admin/warehouses' },
      ],
    },
    {
      label: 'FINANCE',
      collapsed: false,
      items: [
        { label: 'Payments', icon: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', route: '/admin/payments' },
        { label: 'Wallets', icon: '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/wallets' },
      ],
    },
    {
      label: 'MARKETING',
      collapsed: false,
      items: [
        { label: 'Coupons', icon: '<svg viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/coupons' },
        { label: 'Merchandising', icon: '<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" stroke-width="2" fill="none"/><line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/merchandising' },
        { label: 'Notifications', icon: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>', route: '/admin/notifications' },
      ],
    },
    {
      label: 'CONTENT',
      collapsed: false,
      items: [
        { label: 'Moderation', icon: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/moderation' },
      ],
    },
    {
      label: 'PEOPLE',
      collapsed: false,
      items: [
        { label: 'Users', icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', route: '/admin/users' },
      ],
    },
    {
      label: 'SYSTEM',
      collapsed: false,
      items: [
        { label: 'Analytics', icon: '<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" stroke-width="2"/><line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/analytics' },
        { label: 'Audit Logs', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/audit-logs' },
        { label: 'Workflows', icon: '<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>', route: '/admin/workflows' },
        { label: 'System Health', icon: '<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/system-health' },
        { label: 'Observability', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>', route: '/admin/observability' },
        { label: 'Feature Flags', icon: '<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" stroke-width="2" fill="none"/><line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/feature-flags' },
        { label: 'Data Platform', icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/data-platform' },
        { label: 'Settings', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/settings' },
      ],
    },
  ];

  constructor(public authService: AuthService) {
    this.loadCollapsedState();
  }

  toggleSection(section: NavSection): void {
    section.collapsed = !section.collapsed;
    this.saveCollapsedState();
  }

  private loadCollapsedState(): void {
    try {
      const saved = localStorage.getItem('admin-sidebar-collapsed');
      if (saved) {
        const state = JSON.parse(saved) as Record<string, boolean>;
        for (const section of this.navSections) {
          if (state[section.label] !== undefined) section.collapsed = state[section.label];
        }
      }
    } catch { /* ignore */ }
  }

  private saveCollapsedState(): void {
    const state: Record<string, boolean> = {};
    for (const section of this.navSections) state[section.label] = section.collapsed;
    localStorage.setItem('admin-sidebar-collapsed', JSON.stringify(state));
  }

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }
}
