import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-feature-flag-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">Feature Flags</h1><p class="page-sub">Toggle features, percentage rollout, user targeting</p></div>
        <button class="btn-add" (click)="openCreate()">+ Create Flag</button>
      </div>

      @if (flags().length === 0) {
        <div class="empty">No feature flags. Create one to get started.</div>
      } @else {
        <div class="flag-list">
          @for (f of flags(); track f._id) {
            <div class="flag-card" [class.enabled]="f.enabled" [class.disabled]="!f.enabled">
              <div class="flag-main">
                <div class="flag-info">
                  <div class="flag-name-row">
                    <span class="flag-name">{{ f.name }}</span>
                    <span class="flag-slug">{{ f.slug }}</span>
                  </div>
                  <p class="flag-desc">{{ f.description || 'No description' }}</p>
                  <div class="flag-meta">
                    <span class="meta-item">Env: <strong>{{ f.environment }}</strong></span>
                    <span class="meta-item">Rollout: <strong>{{ f.rolloutPercent }}%</strong></span>
                    @if (f.targetRoles.length > 0) {
                      <span class="meta-item">Roles: <strong>{{ f.targetRoles.join(', ') }}</strong></span>
                    }
                    @if (f.targetUserIds.length > 0) {
                      <span class="meta-item">{{ f.targetUserIds.length }} targeted users</span>
                    }
                  </div>
                </div>
                <div class="flag-actions">
                  <button class="toggle-btn" [class.on]="f.enabled" (click)="toggle(f._id)">
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  </button>
                  <button class="btn-sm" (click)="openEdit(f)">Edit</button>
                  <button class="btn-sm danger" (click)="deleteFlag(f._id)">Delete</button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showModal()) {
        <div class="backdrop" (click)="showModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>{{ editId ? 'Edit' : 'Create' }} Feature Flag</h2><button (click)="showModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Name *</label><input [(ngModel)]="form.name" placeholder="Dark Mode" /></div>
            <div class="form-field"><label>Description</label><input [(ngModel)]="form.description" placeholder="Enable dark mode for users" /></div>
            <div class="form-row">
              <div class="form-field"><label>Environment</label>
                <select [(ngModel)]="form.environment"><option value="all">All</option><option value="development">Development</option><option value="production">Production</option></select>
              </div>
              <div class="form-field"><label>Rollout %</label><input type="number" [(ngModel)]="form.rolloutPercent" min="0" max="100" /></div>
            </div>
            <div class="form-field"><label>Target Roles (comma separated)</label><input [(ngModel)]="form.targetRolesStr" placeholder="admin, user" /></div>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.enabled" /> Enabled</label>
            <div class="modal-actions">
              <button (click)="showModal.set(false)">Cancel</button>
              <button class="btn-save" [disabled]="!form.name" (click)="save()">{{ editId ? 'Update' : 'Create' }}</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; &:hover { background: $color-primary-hover; } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; }

    .flag-list { display:flex; flex-direction:column; gap: $space-md; }
    .flag-card { padding: $space-lg $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; transition: all $transition-fast;
      &.enabled { border-left:4px solid $color-success; }
      &.disabled { border-left:4px solid $color-border; opacity:.7; }
    }
    .flag-main { display:flex; justify-content:space-between; align-items:flex-start; gap: $space-lg; }
    .flag-info { flex:1; min-width:0; }
    .flag-name-row { display:flex; align-items:center; gap: $space-sm; margin-bottom: $space-xxs; }
    .flag-name { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; }
    .flag-slug { font-size: $font-size-xs; font-family:monospace; color: $color-text-tertiary; background: $color-bg-secondary; padding:1px $space-xs; border-radius: $radius-sm; }
    .flag-desc { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-sm; }
    .flag-meta { display:flex; gap: $space-lg; flex-wrap:wrap; }
    .meta-item { font-size: $font-size-xs; color: $color-text-tertiary; }

    .flag-actions { display:flex; align-items:center; gap: $space-sm; flex-shrink:0; }
    .toggle-btn { background:none; border:none; cursor:pointer; padding:0; }
    .toggle-track { display:block; width:44px; height:24px; border-radius:12px; background: $color-border; position:relative; transition: background $transition-fast;
      .on & { background: $color-success; }
    }
    .toggle-thumb { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:white; box-shadow: $shadow-sm; transition: transform $transition-fast;
      .on & { transform:translateX(20px); }
    }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.danger:hover { border-color: $color-error; color: $color-error; }
    }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .form-row { display:flex; gap: $space-md; }
    .form-field { flex:1; display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; min-width:0;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }
    .checkbox { display:flex; align-items:center; gap: $space-sm; font-size: $font-size-sm; color: $color-text-secondary; cursor:pointer; margin-bottom: $space-md; }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; &:disabled { opacity:.5; } }
  `],
})
export class FeatureFlagListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly flags = signal<any[]>([]);
  readonly showModal = signal(false);
  editId: string | null = null;
  form: any = this.emptyForm();

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/feature-flags`).subscribe({
      next: (res) => this.flags.set(res.data),
    });
  }

  openCreate(): void { this.editId = null; this.form = this.emptyForm(); this.showModal.set(true); }

  openEdit(f: any): void {
    this.editId = f._id;
    this.form = { name: f.name, description: f.description, environment: f.environment, rolloutPercent: f.rolloutPercent, targetRolesStr: (f.targetRoles || []).join(', '), enabled: f.enabled };
    this.showModal.set(true);
  }

  save(): void {
    const body: any = {
      name: this.form.name,
      description: this.form.description,
      environment: this.form.environment,
      rolloutPercent: this.form.rolloutPercent,
      targetRoles: this.form.targetRolesStr ? this.form.targetRolesStr.split(',').map((r: string) => r.trim()).filter(Boolean) : [],
      enabled: this.form.enabled,
    };
    const req = this.editId
      ? this.http.put(`${this.api}/admin/feature-flags/${this.editId}`, body)
      : this.http.post(`${this.api}/admin/feature-flags`, body);
    req.subscribe({ next: () => { this.showModal.set(false); this.load(); } });
  }

  toggle(id: string): void {
    this.http.patch(`${this.api}/admin/feature-flags/${id}/toggle`, {}).subscribe({ next: () => this.load() });
  }

  deleteFlag(id: string): void {
    if (!confirm('Delete this flag?')) return;
    this.http.delete(`${this.api}/admin/feature-flags/${id}`).subscribe({ next: () => this.load() });
  }

  private emptyForm() {
    return { name: '', description: '', environment: 'all', rolloutPercent: 100, targetRolesStr: '', enabled: false };
  }
}
