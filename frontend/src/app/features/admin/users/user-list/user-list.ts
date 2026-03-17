import { Component, OnInit, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  AdminUser,
  PaginationMeta,
  UserListParams,
} from '../../../../core/services/admin.service';
import { UserSessionsComponent } from '../user-sessions/user-sessions';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, UserSessionsComponent],
  template: `
    <div class="page">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Users</h1>
          <p class="page-subtitle">
            @if (meta()) {
              {{ meta()!.total }} total users in your store
            }
          </p>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder="Search by name, phone, or email..."
            [ngModel]="searchTerm()"
            (ngModelChange)="onSearchChange($event)"
          />
          @if (searchTerm()) {
            <button class="search-clear" (click)="onSearchChange('')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          }
        </div>

        <div class="filter-group">
          <select
            class="filter-select"
            [ngModel]="roleFilter()"
            (ngModelChange)="roleFilter.set($event); currentPage.set(1)"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
          </select>

          <select
            class="filter-select"
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event); currentPage.set(1)"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="table-card">
        @if (loading() && !users().length) {
          <div class="table-loading">
            <div class="spinner"></div>
            <span>Loading users...</span>
          </div>
        } @else if (!users().length) {
          <div class="table-empty">
            <p>No users found</p>
          </div>
        } @else {
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Joined</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                @for (user of users(); track user._id) {
                  <tr
                    class="table-row"
                    [class.expanded]="selectedUserId() === user._id"
                  >
                    <td>
                      <div class="user-cell">
                        <div class="user-avatar" [class.admin]="user.role === 'admin'">
                          {{ getInitials(user) }}
                        </div>
                        <div class="user-info">
                          <span class="user-name">{{ getDisplayName(user) }}</span>
                          @if (user.email) {
                            <span class="user-email">{{ user.email }}</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="phone-text">+91 {{ user.phone }}</span>
                    </td>
                    <td>
                      <span class="role-badge" [class.admin]="user.role === 'admin'">
                        {{ user.role }}
                      </span>
                    </td>
                    <td>
                      <div class="status-cell">
                        <span class="status-dot" [class.active]="user.isActive"></span>
                        <span>{{ user.isActive ? 'Active' : 'Inactive' }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="muted-text">{{ formatDate(user.lastLogin) }}</span>
                    </td>
                    <td>
                      <span class="muted-text">{{ formatDate(user.createdAt) }}</span>
                    </td>
                    <td>
                      <!-- Sessions toggle button -->
                      <button
                        class="sessions-btn"
                        [class.active]="selectedUserId() === user._id"
                        (click)="toggleSessions(user)"
                        title="View active sessions"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
                          <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                        Sessions
                      </button>
                    </td>
                  </tr>

                  <!-- Inline sessions panel — spans all columns -->
                  @if (selectedUserId() === user._id) {
                    <tr class="sessions-row">
                      <td colspan="7" class="sessions-cell">
                        <app-user-sessions
                          [userId]="user._id"
                          [userName]="getDisplayName(user)"
                          (closed)="closeSessionsPanel()"
                          (sessionRevoked)="onSessionRevoked()"
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (meta() && meta()!.totalPages > 1) {
            <div class="pagination">
              <span class="pagination-info">
                Showing {{ (meta()!.page - 1) * meta()!.limit + 1 }}–{{ Math.min(meta()!.page * meta()!.limit, meta()!.total) }}
                of {{ meta()!.total }}
              </span>
              <div class="pagination-controls">
                <button
                  class="page-btn"
                  [disabled]="meta()!.page <= 1"
                  (click)="currentPage.set(meta()!.page - 1)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                @for (p of getPageNumbers(); track p) {
                  <button
                    class="page-btn"
                    [class.active]="p === meta()!.page"
                    (click)="currentPage.set(p)"
                  >
                    {{ p }}
                  </button>
                }
                <button
                  class="page-btn"
                  [disabled]="meta()!.page >= meta()!.totalPages"
                  (click)="currentPage.set(meta()!.page + 1)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../core/design-tokens/tokens' as *;
    @use '../../../../core/design-tokens/mixins' as *;

    .page { max-width: 1200px; }

    .page-header { margin-bottom: $space-lg; }

    .page-title {
      font-family: $font-family-display;
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
    }

    .page-subtitle {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      margin-top: $space-xxs;
    }

    // === Filters ===
    .filters-bar {
      display: flex;
      gap: $space-md;
      margin-bottom: $space-lg;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 240px;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: $space-sm;
      color: $color-text-disabled;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: $space-sm $space-xl $space-sm 38px;
      border: 1.5px solid $color-border;
      border-radius: $radius-lg;
      font-size: $font-size-sm;
      font-family: $font-family;
      color: $color-text-primary;
      background: $color-bg-tertiary;
      outline: none;
      transition: all $transition-fast;

      &::placeholder { color: $color-text-disabled; }
      &:focus { border-color: $color-primary; box-shadow: $shadow-glow; }
    }

    .search-clear {
      position: absolute;
      right: $space-sm;
      background: none;
      border: none;
      color: $color-text-tertiary;
      cursor: pointer;
      padding: 2px;
      display: flex;
      &:hover { color: $color-text-primary; }
    }

    .filter-group { display: flex; gap: $space-sm; }

    .filter-select {
      padding: $space-sm $space-xl $space-sm $space-sm;
      border: 1.5px solid $color-border;
      border-radius: $radius-lg;
      font-size: $font-size-sm;
      font-family: $font-family;
      color: $color-text-primary;
      background: $color-bg-tertiary;
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%238A7D81' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      min-width: 120px;

      &:focus { border-color: $color-primary; box-shadow: $shadow-glow; }
    }

    // === Table ===
    .table-card { @include card; overflow: hidden; }

    .table-loading, .table-empty {
      padding: $space-xxxl;
      text-align: center;
      color: $color-text-tertiary;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: $space-sm;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2.5px solid $color-border;
      border-top-color: $color-primary;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .table-wrapper { overflow-x: auto; }

    .table {
      width: 100%;
      border-collapse: collapse;

      th {
        text-align: left;
        padding: $space-sm $space-md;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        text-transform: uppercase;
        letter-spacing: $letter-spacing-wide;
        color: $color-text-tertiary;
        background: $color-bg-secondary;
        border-bottom: 1px solid $color-border-light;
        white-space: nowrap;
      }

      td {
        padding: $space-md;
        font-size: $font-size-sm;
        color: $color-text-primary;
        border-bottom: 1px solid $color-border-light;
        vertical-align: middle;
      }
    }

    .table-row {
      transition: background $transition-fast;
      &:hover { background: rgba(204, 88, 3, 0.02); }
      &:last-child td { border-bottom: none; }

      &.expanded {
        background: rgba(204, 88, 3, 0.03);
        td { border-bottom: none; }
      }
    }

    // === Sessions inline row ===
    .sessions-row {
      td { padding: 0 $space-md $space-md; border-bottom: 1px solid $color-border-light; }
    }

    .sessions-cell {
      padding: 0 $space-md $space-md !important;
    }

    // === Sessions toggle button ===
    .sessions-btn {
      display: inline-flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-xs $space-sm;
      border: 1px solid $color-border-light;
      border-radius: $radius-md;
      background: $color-bg-tertiary;
      color: $color-text-secondary;
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;
      white-space: nowrap;

      &:hover {
        border-color: $color-primary;
        color: $color-primary;
        background: $color-primary-light;
      }

      &.active {
        border-color: $color-primary;
        color: $color-primary;
        background: $color-primary-light;
      }
    }

    // === User Cell ===
    .user-cell { display: flex; align-items: center; gap: $space-sm; }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: $radius-md;
      background: $color-bg-secondary;
      color: $color-text-secondary;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
      flex-shrink: 0;

      &.admin { background: $color-primary-light; color: $color-primary; }
    }

    .user-info { display: flex; flex-direction: column; min-width: 0; }

    .user-name { font-weight: $font-weight-medium; color: $color-text-primary; }

    .user-email {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      @include truncate;
    }

    .phone-text {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    // === Badges ===
    .role-badge {
      display: inline-block;
      padding: 2px $space-sm;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      text-transform: capitalize;
      background: $color-bg-secondary;
      color: $color-text-secondary;

      &.admin { background: $color-primary-light; color: $color-primary; }
    }

    .status-cell {
      display: flex;
      align-items: center;
      gap: $space-xs;
      font-size: $font-size-sm;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: $color-error;
      flex-shrink: 0;

      &.active { background: $color-success; }
    }

    .muted-text {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      white-space: nowrap;
    }

    // === Pagination ===
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $space-sm $space-md;
      border-top: 1px solid $color-border-light;

      @include respond-to(sm) { flex-direction: column; gap: $space-sm; }
    }

    .pagination-info { font-size: $font-size-xs; color: $color-text-tertiary; }

    .pagination-controls { display: flex; gap: $space-xxs; }

    .page-btn {
      min-width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid $color-border-light;
      border-radius: $radius-md;
      background: $color-bg-tertiary;
      color: $color-text-secondary;
      font-size: $font-size-sm;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;
      padding: 0 $space-xs;

      &:hover:not(:disabled):not(.active) { border-color: $color-primary; color: $color-primary; }
      &.active { background: $color-primary; border-color: $color-primary; color: $color-text-inverse; }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }
  `],
})
export class UserListComponent implements OnInit, OnDestroy {
  users          = signal<AdminUser[]>([]);
  meta           = signal<PaginationMeta | null>(null);
  loading        = signal(false);
  searchTerm     = signal('');
  currentPage    = signal(1);
  roleFilter     = signal('');
  statusFilter   = signal('');
  selectedUserId = signal<string | null>(null);  // which user's sessions are open

  Math = Math;

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadEffect = effect(() => {
    const page   = this.currentPage();
    const search = this.searchTerm();
    const role   = this.roleFilter();
    const status = this.statusFilter();
    this.loadUsers({ page, search, role, isActive: status ? status === 'true' : undefined });
  });

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  onSearchChange(value: string): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchTerm.set(value);
      this.currentPage.set(1);
    }, 300);
  }

  // Open the sessions panel for a user (or close if already open)
  toggleSessions(user: AdminUser): void {
    this.selectedUserId.update((current) =>
      current === user._id ? null : user._id,
    );
  }

  closeSessionsPanel(): void {
    this.selectedUserId.set(null);
  }

  onSessionRevoked(): void {
    // Optionally refresh the user list to update lastLogin etc.
    // For now, just a no-op — the panel handles its own state.
  }

  getInitials(user: AdminUser): string {
    if (user.firstName) return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    return user.phone.slice(-2);
  }

  getDisplayName(user: AdminUser): string {
    if (user.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    return '+91 ' + user.phone;
  }

  formatDate(date?: string): string {
    if (!date) return '—';
    const d    = new Date(date);
    const now  = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getPageNumbers(): number[] {
    const m = this.meta();
    if (!m) return [];
    const pages: number[] = [];
    const start = Math.max(1, m.page - 2);
    const end   = Math.min(m.totalPages, m.page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  private loadUsers(params: { page: number; search: string; role: string; isActive?: boolean }): void {
    this.loading.set(true);

    const queryParams: UserListParams = {
      page:      params.page,
      limit:     20,
      sortBy:    'createdAt',
      sortOrder: 'desc',
    };

    if (params.search)   queryParams.search   = params.search;
    if (params.role)     queryParams.role     = params.role;
    if (params.isActive !== undefined) queryParams.isActive = params.isActive;

    this.adminService.getUsers(queryParams).subscribe({
      next: (res) => {
        this.users.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
