import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-data-platform',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Data Platform</h1>
        <p class="page-sub">Backups, archival, and data management</p>
      </div>

      @if (data()) {
        <!-- Backup Stats -->
        <div class="stats-grid">
          <div class="stat ok">
            <span class="stat-val">{{ data().backupStats.completed }}</span>
            <span class="stat-lbl">Backups Completed</span>
          </div>
          <div class="stat" [class.danger]="data().backupStats.failed > 0">
            <span class="stat-val">{{ data().backupStats.failed }}</span>
            <span class="stat-lbl">Failed</span>
          </div>
          <div class="stat">
            <span class="stat-val">{{ data().backupStats.lastBackup?.sizeMB || 0 }}MB</span>
            <span class="stat-lbl">Last Backup Size</span>
          </div>
          <div class="stat">
            <span class="stat-val">{{ data().backupStats.lastBackup?.date ? (data().backupStats.lastBackup.date | date:'dd MMM') : 'Never' }}</span>
            <span class="stat-lbl">Last Backup</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions-bar">
          <button class="btn-action primary" [disabled]="backupRunning()" (click)="triggerBackup()">
            {{ backupRunning() ? 'Running...' : 'Run Backup Now' }}
          </button>
          <button class="btn-action" (click)="triggerArchive()">Archive Old Data</button>
          <button class="btn-action" (click)="scheduleBackup()">Schedule Daily Backup</button>
        </div>

        @if (actionResult()) {
          <div class="result-msg">{{ actionResult() }}</div>
        }

        <!-- Archive Stats -->
        <h2 class="section-title">Archive Collections</h2>
        <div class="archive-grid">
          @for (a of data().archiveStats; track a.collection) {
            <div class="archive-card">
              <span class="arc-name">{{ a.collection }}</span>
              <span class="arc-count">{{ a.count }} documents</span>
            </div>
          }
        </div>

        <!-- Backup History -->
        <h2 class="section-title">Backup History</h2>
        <div class="history-list">
          @for (b of data().backupHistory; track b._id) {
            <div class="history-item" [class.ok]="b.status === 'completed'" [class.fail]="b.status === 'failed'" [class.running]="b.status === 'running'">
              <div class="h-info">
                <span class="h-type">{{ b.type }}</span>
                <span class="h-status">{{ b.status }}</span>
                <span class="h-date">{{ b.startedAt | date:'dd MMM yyyy, h:mm a' }}</span>
              </div>
              <div class="h-meta">
                @if (b.sizeBytes > 0) {
                  <span>{{ (b.sizeBytes / 1024 / 1024) | number:'1.1-1' }}MB</span>
                }
                @if (b.error) {
                  <span class="h-error">{{ b.error }}</span>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="loading"><div class="spinner"></div></div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .stats-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.ok { border-color: rgba(87,136,108,.3); }
      &.danger { border-color: rgba(192,57,43,.3); }
    }
    .stat-val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; .ok & { color: $color-success; } .danger & { color: $color-error; } }
    .stat-lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }

    .actions-bar { display:flex; gap: $space-md; margin-bottom: $space-lg; }
    .btn-action { padding: $space-sm $space-xl; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast;
      &.primary { background: $color-primary; color: $color-text-inverse; border:none; &:hover { background: $color-primary-hover; } }
      &:disabled { opacity:.5; cursor:not-allowed; }
      &:hover:not(:disabled):not(.primary) { border-color: $color-primary; color: $color-primary; }
    }
    .result-msg { padding: $space-sm $space-md; background: rgba(87,136,108,.08); color: $color-success; border-radius: $radius-md; font-size: $font-size-sm; margin-bottom: $space-lg; }

    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin: $space-xl 0 $space-md; }

    .archive-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .archive-card { padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; display:flex; justify-content:space-between; align-items:center; }
    .arc-name { font-family:monospace; font-size: $font-size-sm; color: $color-text-primary; }
    .arc-count { font-size: $font-size-sm; font-weight: $font-weight-bold; color: $color-text-tertiary; }

    .history-list { display:flex; flex-direction:column; gap: $space-xs; }
    .history-item { display:flex; justify-content:space-between; align-items:center; padding: $space-sm $space-md; border-left:3px solid $color-border; border-radius: $radius-md; background: $color-bg-tertiary;
      &.ok { border-left-color: $color-success; }
      &.fail { border-left-color: $color-error; }
      &.running { border-left-color: $color-primary; }
    }
    .h-info { display:flex; gap: $space-md; align-items:center; }
    .h-type { font-size: $font-size-xs; font-weight: $font-weight-bold; color: $color-text-secondary; text-transform:uppercase; }
    .h-status { font-size: $font-size-xs; font-weight: $font-weight-bold; .ok & { color: $color-success; } .fail & { color: $color-error; } .running & { color: $color-primary; } }
    .h-date { font-size: $font-size-xs; color: $color-text-tertiary; }
    .h-meta { display:flex; gap: $space-md; font-size: $font-size-xs; color: $color-text-tertiary; }
    .h-error { color: $color-error; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class DataPlatformComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly data = signal<any>(null);
  readonly backupRunning = signal(false);
  readonly actionResult = signal<string | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/data-platform`).subscribe({
      next: (res) => this.data.set(res.data),
    });
  }

  triggerBackup(): void {
    this.backupRunning.set(true);
    this.actionResult.set(null);
    this.http.post<{ message: string }>(`${this.api}/admin/data-platform/backup`, {}).subscribe({
      next: (res) => { this.backupRunning.set(false); this.actionResult.set(res.message || 'Backup started'); this.load(); },
      error: () => { this.backupRunning.set(false); this.actionResult.set('Backup failed'); },
    });
  }

  triggerArchive(): void {
    this.actionResult.set(null);
    this.http.post<{ message: string }>(`${this.api}/admin/data-platform/archive`, {}).subscribe({
      next: (res) => { this.actionResult.set(res.message || 'Archival complete'); this.load(); },
    });
  }

  scheduleBackup(): void {
    this.http.post<{ message: string }>(`${this.api}/admin/data-platform/schedule-backup`, {}).subscribe({
      next: (res) => this.actionResult.set(res.message || 'Scheduled'),
    });
  }
}
