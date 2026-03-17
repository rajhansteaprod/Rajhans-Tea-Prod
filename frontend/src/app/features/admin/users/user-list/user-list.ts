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
        <button class="btn-primary-create" (click)="openCreate()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Add User
        </button>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (user of users(); track user._id) {
                  <tr
                    class="table-row"
                    [class.expanded]="selectedUserId() === user._id || editingUserId() === user._id"
                  >
                    <!-- User cell -->
                    <td>
                      <div class="user-cell">
                        <div
                          class="user-avatar"
                          [class.admin]="user.role === 'admin'"
                          [class.banned]="user.isBanned"
                        >
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

                    <!-- Phone -->
                    <td>
                      <span class="phone-text">+91 {{ user.phone }}</span>
                    </td>

                    <!-- Role -->
                    <td>
                      <span class="role-badge" [class.admin]="user.role === 'admin'">
                        {{ user.role }}
                      </span>
                    </td>

                    <!-- Status — shows Banned badge when applicable -->
                    <td>
                      @if (user.isBanned) {
                        <span class="banned-badge">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          </svg>
                          Banned
                        </span>
                      } @else {
                        <div class="status-cell">
                          <span class="status-dot" [class.active]="user.isActive"></span>
                          <span>{{ user.isActive ? 'Active' : 'Inactive' }}</span>
                        </div>
                      }
                    </td>

                    <!-- Last Login -->
                    <td>
                      <span class="muted-text">{{ formatDate(user.lastLogin) }}</span>
                    </td>

                    <!-- Joined -->
                    <td>
                      <span class="muted-text">{{ formatDate(user.createdAt) }}</span>
                    </td>

                    <!-- Actions column -->
                    <td>
                      <div class="action-btns">
                        <!-- Sessions toggle — icon only -->
                        <button
                          class="sessions-btn"
                          [class.active]="selectedUserId() === user._id"
                          (click)="toggleSessions(user)"
                          title="View sessions"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
                            <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                          </svg>
                        </button>

                        <!-- Edit -->
                        <button
                          class="btn-icon edit-btn"
                          (click)="openEdit(user)"
                          [disabled]="actionUserId() === user._id"
                          title="Edit user"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                          </svg>
                        </button>

                        <!-- Ban / Unban -->
                        <button
                          class="btn-icon ban-btn"
                          [class.banned]="user.isBanned"
                          (click)="toggleBan(user)"
                          [disabled]="actionUserId() === user._id"
                          [title]="user.isBanned ? 'Unban user' : 'Ban user'"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
                            <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                          </svg>
                        </button>

                        <!-- Delete -->
                        <button
                          class="btn-icon delete-btn"
                          (click)="deleteUser(user)"
                          [disabled]="actionUserId() === user._id"
                          title="Delete user"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  <!-- Inline sessions panel -->
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

                  <!-- Inline edit panel -->
                  @if (editingUserId() === user._id) {
                    <tr class="edit-row">
                      <td colspan="7" class="edit-cell">
                        <div class="edit-panel">
                          <p class="edit-panel-title">Edit — {{ getDisplayName(user) }}</p>
                          <div class="edit-form-grid">
                            <div class="form-field">
                              <label class="form-label">First Name</label>
                              <input
                                class="form-input"
                                type="text"
                                [ngModel]="editForm().firstName"
                                (ngModelChange)="editForm.update(f => ({...f, firstName: $event}))"
                                placeholder="First name"
                              />
                            </div>
                            <div class="form-field">
                              <label class="form-label">Last Name</label>
                              <input
                                class="form-input"
                                type="text"
                                [ngModel]="editForm().lastName"
                                (ngModelChange)="editForm.update(f => ({...f, lastName: $event}))"
                                placeholder="Last name"
                              />
                            </div>
                            <div class="form-field">
                              <label class="form-label">Email</label>
                              <input
                                class="form-input"
                                type="email"
                                [ngModel]="editForm().email"
                                (ngModelChange)="editForm.update(f => ({...f, email: $event}))"
                                placeholder="email@example.com"
                              />
                            </div>
                            <div class="form-field">
                              <label class="form-label">Role</label>
                              <select
                                class="form-select"
                                [ngModel]="editForm().role"
                                (ngModelChange)="editForm.update(f => ({...f, role: $event}))"
                              >
                                <option value="customer">Customer</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Status</label>
                              <div class="form-toggle-row">
                                <label class="toggle-switch">
                                  <input
                                    type="checkbox"
                                    [ngModel]="editForm().isActive"
                                    (ngModelChange)="editForm.update(f => ({...f, isActive: $event}))"
                                  />
                                  <span class="slider"></span>
                                </label>
                                <span class="form-toggle-label">{{ editForm().isActive ? 'Active' : 'Inactive' }}</span>
                              </div>
                            </div>
                          </div>
                          <div class="edit-actions">
                            <button class="btn-save" (click)="saveEdit()" [disabled]="savingEdit()">
                              {{ savingEdit() ? 'Saving…' : 'Save Changes' }}
                            </button>
                            <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                          </div>
                        </div>
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

    <!-- Create User Modal -->
    @if (showCreate()) {
      <div class="modal-overlay" (click)="showCreate.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Add New User</h2>
            <button class="modal-close" (click)="showCreate.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-field">
              <label class="form-label">Phone Number *</label>
              <input
                class="form-input"
                type="tel"
                [ngModel]="createForm().phone"
                (ngModelChange)="createForm.update(f => ({...f, phone: $event}))"
                placeholder="9876543210"
                maxlength="10"
              />
            </div>
            <div class="modal-form-grid">
              <div class="form-field">
                <label class="form-label">First Name</label>
                <input
                  class="form-input"
                  type="text"
                  [ngModel]="createForm().firstName"
                  (ngModelChange)="createForm.update(f => ({...f, firstName: $event}))"
                  placeholder="First name"
                />
              </div>
              <div class="form-field">
                <label class="form-label">Last Name</label>
                <input
                  class="form-input"
                  type="text"
                  [ngModel]="createForm().lastName"
                  (ngModelChange)="createForm.update(f => ({...f, lastName: $event}))"
                  placeholder="Last name"
                />
              </div>
            </div>
            <div class="form-field">
              <label class="form-label">Email</label>
              <input
                class="form-input"
                type="email"
                [ngModel]="createForm().email"
                (ngModelChange)="createForm.update(f => ({...f, email: $event}))"
                placeholder="email@example.com"
              />
            </div>
            <div class="form-field">
              <label class="form-label">Role</label>
              <select
                class="form-select"
                [ngModel]="createForm().role"
                (ngModelChange)="createForm.update(f => ({...f, role: $event}))"
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          @if (createError()) {
            <div class="modal-error">{{ createError() }}</div>
          }
          <div class="modal-footer">
            <button class="btn-cancel" (click)="showCreate.set(false)">Cancel</button>
            <button
              class="btn-save"
              (click)="saveCreate()"
              [disabled]="savingCreate() || !createForm().phone"
            >
              {{ savingCreate() ? 'Creating…' : 'Create User' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../core/design-tokens/tokens' as *;
    @use '../../../../core/design-tokens/mixins' as *;

    .page { max-width: 1200px; }

    // === Page Header ===
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: $space-md;
      margin-bottom: $space-lg;
    }

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

    .btn-primary-create {
      display: inline-flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-sm $space-md;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;
      white-space: nowrap;
      flex-shrink: 0;

      &:hover { background: $color-primary-hover; }
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

    // === Action buttons in table ===
    .action-btns {
      display: flex;
      align-items: center;
      gap: $space-xs;
      flex-wrap: nowrap;
    }

    // === Sessions toggle button (icon-only) ===
    .sessions-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid $color-border-light;
      border-radius: $radius-md;
      background: $color-bg-tertiary;
      color: $color-text-secondary;
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;
      flex-shrink: 0;

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

    .btn-icon {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      border-radius: $radius-sm;
      background: none;
      cursor: pointer;
      transition: all $transition-fast;
      flex-shrink: 0;
      color: $color-text-disabled;

      &:hover:not(:disabled) {
        border-color: $color-border;
        background: $color-bg-secondary;
        color: $color-text-secondary;
      }

      &:disabled { opacity: 0.3; cursor: not-allowed; }

      &.ban-btn:hover:not(:disabled) {
        border-color: rgba(203, 65, 65, 0.3);
        background: rgba(203, 65, 65, 0.06);
        color: $color-error;
      }

      &.ban-btn.banned {
        color: $color-error;
        border-color: rgba(203, 65, 65, 0.3);
        background: rgba(203, 65, 65, 0.06);

        &:hover:not(:disabled) {
          background: rgba(87, 136, 108, 0.1);
          border-color: rgba(87, 136, 108, 0.3);
          color: $color-success;
        }
      }

      &.delete-btn:hover:not(:disabled) {
        border-color: rgba(203, 65, 65, 0.3);
        background: rgba(203, 65, 65, 0.06);
        color: $color-error;
      }

      &.edit-btn:hover:not(:disabled) {
        border-color: $color-primary;
        background: $color-primary-light;
        color: $color-primary;
      }
    }

    // === Banned badge in status column ===
    .banned-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      color: $color-error;
      background: rgba(203, 65, 65, 0.08);
      border-radius: $radius-sm;
      padding: 2px $space-xs;
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

      &.banned {
        outline: 2px solid $color-error;
        outline-offset: 1px;
      }
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

    // === Edit panel row ===
    .edit-row td { padding: 0 $space-md $space-md; border-bottom: 1px solid $color-border-light; }
    .edit-cell { padding: 0 $space-md $space-md !important; }

    .edit-panel {
      background: $color-bg-secondary;
      border: 1px solid $color-border;
      border-radius: $radius-xl;
      padding: $space-lg;
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .edit-panel-title {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
      margin-bottom: $space-md;
    }

    .edit-form-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: $space-md;
      margin-bottom: $space-md;

      @include respond-to(md) { grid-template-columns: repeat(2, 1fr); }
      @include respond-to(xs) { grid-template-columns: 1fr; }
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: $space-xxs;
    }

    .form-label {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      color: $color-text-secondary;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .form-input, .form-select {
      padding: $space-sm $space-sm;
      border: 1.5px solid $color-border;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-family: $font-family;
      color: $color-text-primary;
      background: $color-bg-tertiary;
      outline: none;
      transition: all $transition-fast;

      &:focus { border-color: $color-primary; box-shadow: $shadow-glow; }
    }

    .form-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%238A7D81' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: $space-xl;
      cursor: pointer;
    }

    .form-toggle-row {
      display: flex;
      align-items: center;
      gap: $space-sm;
      padding-top: $space-sm;
    }

    .form-toggle-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    .toggle-switch {
      position: relative;
      width: 40px;
      height: 22px;

      input { opacity: 0; width: 0; height: 0; }

      .slider {
        position: absolute;
        inset: 0;
        background: $color-border;
        border-radius: $radius-full;
        cursor: pointer;
        transition: background $transition-fast;

        &::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          left: 3px;
          top: 3px;
          background: white;
          border-radius: 50%;
          transition: transform $transition-fast;
        }
      }

      input:checked + .slider { background: $color-success; }
      input:checked + .slider::before { transform: translateX(18px); }
    }

    .edit-actions {
      display: flex;
      gap: $space-sm;
    }

    .btn-save {
      padding: $space-xs $space-md;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      font-family: $font-family;
      cursor: pointer;
      transition: background $transition-fast;

      &:hover:not(:disabled) { background: $color-primary-hover; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .btn-cancel {
      padding: $space-xs $space-md;
      background: none;
      color: $color-text-secondary;
      border: 1px solid $color-border;
      border-radius: $radius-md;
      font-size: $font-size-sm;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover { background: $color-bg-secondary; }
    }

    // === Create modal ===
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: $space-md;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .modal-box {
      background: $color-bg-primary;
      border-radius: $radius-xl;
      border: 1px solid $color-border;
      box-shadow: $shadow-xl;
      width: 100%;
      max-width: 540px;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to   { opacity: 1; transform: scale(1); }
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $space-lg;
      border-bottom: 1px solid $color-border-light;
    }

    .modal-title {
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
    }

    .modal-close {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      color: $color-text-tertiary;
      cursor: pointer;
      border-radius: $radius-sm;

      &:hover { background: $color-bg-secondary; color: $color-text-primary; }
    }

    .modal-body {
      padding: $space-lg;
      display: flex;
      flex-direction: column;
      gap: $space-md;
    }

    .modal-form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: $space-md;

      @include respond-to(xs) { grid-template-columns: 1fr; }
    }

    .modal-error {
      margin: 0 $space-lg $space-sm;
      padding: $space-xs $space-sm;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 6px;
      color: #ef4444;
      font-size: 13px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: $space-sm;
      padding: $space-md $space-lg;
      border-top: 1px solid $color-border-light;
    }
  `],
})
export class UserListComponent implements OnInit, OnDestroy {
  // --- Existing signals ---
  users          = signal<AdminUser[]>([]);
  meta           = signal<PaginationMeta | null>(null);
  loading        = signal(false);
  searchTerm     = signal('');
  currentPage    = signal(1);
  roleFilter     = signal('');
  statusFilter   = signal('');
  selectedUserId = signal<string | null>(null);

  // --- New signals ---
  editingUserId = signal<string | null>(null);
  editForm      = signal<{ firstName: string; lastName: string; email: string; role: string; isActive: boolean }>({
    firstName: '', lastName: '', email: '', role: 'customer', isActive: true,
  });
  showCreate    = signal(false);
  createForm    = signal<{ phone: string; firstName: string; lastName: string; email: string; role: string }>({
    phone: '', firstName: '', lastName: '', email: '', role: 'customer',
  });
  createError   = signal<string | null>(null);
  savingEdit    = signal(false);
  savingCreate  = signal(false);
  actionUserId  = signal<string | null>(null);

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
    this.editingUserId.set(null);
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

  // --- Edit ---

  openEdit(user: AdminUser): void {
    this.selectedUserId.set(null);
    this.editingUserId.set(user._id);
    this.editForm.set({
      firstName: user.firstName ?? '',
      lastName:  user.lastName  ?? '',
      email:     user.email     ?? '',
      role:      user.role,
      isActive:  user.isActive,
    });
  }

  cancelEdit(): void {
    this.editingUserId.set(null);
  }

  saveEdit(): void {
    const userId = this.editingUserId();
    if (!userId) return;
    this.savingEdit.set(true);
    const f = this.editForm();
    this.adminService.updateUser(userId, {
      firstName: f.firstName || undefined,
      lastName:  f.lastName  || undefined,
      email:     f.email     || undefined,
      role:      f.role as 'customer' | 'admin',
      isActive:  f.isActive,
    }).subscribe({
      next: (res) => {
        this.users.update((list) => list.map((u) => u._id === userId ? res.data : u));
        this.savingEdit.set(false);
        this.editingUserId.set(null);
      },
      error: () => this.savingEdit.set(false),
    });
  }

  // --- Create ---

  openCreate(): void {
    this.createForm.set({ phone: '', firstName: '', lastName: '', email: '', role: 'customer' });
    this.createError.set(null);
    this.showCreate.set(true);
  }

  saveCreate(): void {
    const f = this.createForm();
    if (!f.phone) return;

    // Basic phone validation before hitting the API
    if (!/^[6-9]\d{9}$/.test(f.phone)) {
      this.createError.set('Enter a valid 10-digit Indian mobile number (starts with 6–9).');
      return;
    }

    this.createError.set(null);
    this.savingCreate.set(true);
    this.adminService.createUser({
      phone:     f.phone,
      firstName: f.firstName || undefined,
      lastName:  f.lastName  || undefined,
      email:     f.email     || undefined,
      role:      f.role as 'customer' | 'admin',
    }).subscribe({
      next: (res) => {
        this.users.update((list) => [res.data, ...list]);
        this.meta.update((m) => m ? { ...m, total: m.total + 1 } : m);
        this.savingCreate.set(false);
        this.showCreate.set(false);
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Failed to create user. Please try again.';
        this.createError.set(msg);
        this.savingCreate.set(false);
      },
    });
  }

  // --- Ban / Unban ---

  toggleBan(user: AdminUser): void {
    if (user.isBanned) {
      if (!confirm(`Unban ${this.getDisplayName(user)}?`)) return;
      this.actionUserId.set(user._id);
      this.adminService.unbanUser(user._id).subscribe({
        next: (res) => {
          this.users.update((list) => list.map((u) => u._id === user._id ? res.data : u));
          this.actionUserId.set(null);
        },
        error: () => this.actionUserId.set(null),
      });
    } else {
      const reason = prompt(`Ban reason for ${this.getDisplayName(user)} (optional):`);
      if (reason === null) return; // user clicked Cancel
      this.actionUserId.set(user._id);
      this.adminService.banUser(user._id, reason || undefined).subscribe({
        next: (res) => {
          this.users.update((list) => list.map((u) => u._id === user._id ? res.data : u));
          this.actionUserId.set(null);
        },
        error: () => this.actionUserId.set(null),
      });
    }
  }

  // --- Delete ---

  deleteUser(user: AdminUser): void {
    if (!confirm(`Delete ${this.getDisplayName(user)}? This cannot be undone.`)) return;
    this.actionUserId.set(user._id);
    this.adminService.deleteUser(user._id).subscribe({
      next: () => {
        this.users.update((list) => list.filter((u) => u._id !== user._id));
        this.actionUserId.set(null);
      },
      error: () => this.actionUserId.set(null),
    });
  }

  // --- Helpers ---

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

    if (params.search)               queryParams.search   = params.search;
    if (params.role)                 queryParams.role     = params.role;
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
