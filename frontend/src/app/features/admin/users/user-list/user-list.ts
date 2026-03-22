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
  templateUrl: './user-list.html',
  styleUrls: ['./user-list.scss'],
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
