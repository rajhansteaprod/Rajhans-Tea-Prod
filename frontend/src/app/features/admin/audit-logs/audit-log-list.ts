import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-audit-log-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Audit Logs</h1>
        <p class="page-sub">Track all admin actions and system events</p>
      </div>

      <div class="filters">
        <input class="filter-input" placeholder="Filter by action..." [(ngModel)]="actionFilter" (ngModelChange)="onFilterChange()" />
        <select class="filter-select" [(ngModel)]="resourceFilter" (ngModelChange)="loadLogs()">
          <option value="">All Resources</option>
          <option value="user">User</option>
          <option value="product">Product</option>
          <option value="order">Order</option>
          <option value="payment">Payment</option>
          <option value="settings">Settings</option>
        </select>
      </div>

      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (logs().length === 0) {
        <div class="empty">No audit logs found.</div>
      } @else {
        <div class="log-list">
          @for (log of logs(); track log._id) {
            <div class="log-item">
              <div class="log-dot" [attr.data-action]="getActionType(log.action)"></div>
              <div class="log-content">
                <div class="log-header">
                  <span class="log-action">{{ log.action }}</span>
                  <span class="log-time">{{ log.createdAt | date:'dd MMM yyyy, h:mm:ss a' }}</span>
                </div>
                <div class="log-meta">
                  <span class="log-user">{{ log.userId?.firstName || log.userId?.phone || 'System' }}</span>
                  @if (log.resourceId) {
                    <span class="log-resource">{{ log.resource }}:{{ log.resourceId }}</span>
                  }
                  @if (log.ip) {
                    <span class="log-ip">{{ log.ip }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        @if (meta()) {
          <div class="pagination">
            <button [disabled]="meta()!.page <= 1" (click)="loadLogs(meta()!.page - 1)">← Prev</button>
            <span>Page {{ meta()!.page }} of {{ meta()!.totalPages }}</span>
            <button [disabled]="meta()!.page >= meta()!.totalPages" (click)="loadLogs(meta()!.page + 1)">Next →</button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .filters { display:flex; gap: $space-md; margin-bottom: $space-lg; }
    .filter-input { flex:1; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; &:focus { border-color: $color-primary; } }
    .filter-select { padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }

    .log-list { display:flex; flex-direction:column; }
    .log-item { display:flex; gap: $space-md; padding: $space-md 0; border-bottom:1px solid $color-border-light; }
    .log-dot { width:10px; height:10px; border-radius:50%; margin-top:6px; flex-shrink:0;
      &[data-action="create"] { background: $color-success; }
      &[data-action="update"] { background: #4682B4; }
      &[data-action="delete"] { background: $color-error; }
      &[data-action="login"] { background: $color-accent; }
      &[data-action="other"] { background: $color-border; }
    }
    .log-content { flex:1; min-width:0; }
    .log-header { display:flex; justify-content:space-between; align-items:center; margin-bottom: $space-xxs; }
    .log-action { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; font-family:monospace; }
    .log-time { font-size: $font-size-xs; color: $color-text-disabled; }
    .log-meta { display:flex; gap: $space-md; font-size: $font-size-xs; color: $color-text-tertiary; }
    .log-user { font-weight: $font-weight-medium; }
    .log-resource { font-family:monospace; }
    .log-ip { opacity:.6; }

    .pagination { display:flex; align-items:center; justify-content:center; gap: $space-md; padding: $space-xl 0;
      button { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; &:disabled { opacity:.4; } }
      span { font-size: $font-size-sm; color: $color-text-tertiary; }
    }
  `],
})
export class AuditLogListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly logs = signal<any[]>([]);
  readonly loading = signal(false);
  readonly meta = signal<{ page: number; totalPages: number } | null>(null);
  actionFilter = '';
  resourceFilter = '';
  private filterTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void { this.loadLogs(); }

  loadLogs(page = 1): void {
    this.loading.set(true);
    let url = `${this.api}/admin/audit-logs?page=${page}&limit=30`;
    if (this.actionFilter) url += `&action=${encodeURIComponent(this.actionFilter)}`;
    if (this.resourceFilter) url += `&resource=${this.resourceFilter}`;
    this.http.get<{ data: any[]; meta: any }>(url).subscribe({
      next: (res) => { this.logs.set(res.data); this.meta.set(res.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onFilterChange(): void {
    if (this.filterTimeout) clearTimeout(this.filterTimeout);
    this.filterTimeout = setTimeout(() => this.loadLogs(), 400);
  }

  getActionType(action: string): string {
    if (action.includes('create') || action.includes('add')) return 'create';
    if (action.includes('update') || action.includes('change') || action.includes('approve')) return 'update';
    if (action.includes('delete') || action.includes('remove') || action.includes('reject')) return 'delete';
    if (action.includes('login')) return 'login';
    return 'other';
  }
}
