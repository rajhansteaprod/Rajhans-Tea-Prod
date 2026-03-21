import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-system-health',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">System Health</h1>
        <p class="page-sub">Queue monitoring, dead letter queue, and system stats</p>
      </div>

      <!-- System Info -->
      @if (system()) {
        <div class="sys-grid">
          <div class="sys-card ok"><span class="sys-val">{{ system().status }}</span><span class="sys-lbl">Status</span></div>
          <div class="sys-card"><span class="sys-val">{{ system().uptimeHuman }}</span><span class="sys-lbl">Uptime</span></div>
          <div class="sys-card"><span class="sys-val">{{ system().memory.heapUsed }}MB</span><span class="sys-lbl">Heap Used</span></div>
          <div class="sys-card"><span class="sys-val">{{ system().os.freeMemMB }}MB</span><span class="sys-lbl">Free RAM</span></div>
          <div class="sys-card"><span class="sys-val">{{ system().nodeVersion }}</span><span class="sys-lbl">Node.js</span></div>
        </div>
      }

      <!-- Queue Health -->
      <h2 class="section-title">Queue Health</h2>
      @if (queueHealth()) {
        <div class="queue-summary">
          <span class="qs-item">Pending: <strong>{{ queueHealth().totalPending }}</strong></span>
          <span class="qs-item warn">Failed: <strong>{{ queueHealth().totalFailed }}</strong></span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Queue</th><th>Waiting</th><th>Active</th><th>Completed</th><th>Failed</th><th>Delayed</th></tr></thead>
            <tbody>
              @for (q of queueHealth().queues; track q.name) {
                <tr>
                  <td class="q-name">{{ q.name }}</td>
                  <td>{{ q.waiting }}</td>
                  <td [class.active-count]="q.active > 0">{{ q.active }}</td>
                  <td class="ok-count">{{ q.completed }}</td>
                  <td [class.fail-count]="q.failed > 0">{{ q.failed }}</td>
                  <td>{{ q.delayed }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Dead Letter Queue -->
      <h2 class="section-title">Dead Letter Queue</h2>
      @if (dlqStats()) {
        <p class="dlq-info">{{ dlqStats().unresolved }} unresolved / {{ dlqStats().total }} total</p>
      }
      @if (deadLetters().length > 0) {
        <div class="dlq-list">
          @for (dl of deadLetters(); track dl._id) {
            <div class="dlq-card">
              <div class="dlq-header">
                <span class="dlq-queue">{{ dl.queueName }}</span>
                <span class="dlq-job">{{ dl.jobName }}</span>
                <span class="dlq-time">{{ dl.createdAt | date:'dd MMM, h:mm a' }}</span>
              </div>
              <p class="dlq-reason">{{ dl.failedReason }}</p>
              <div class="dlq-actions">
                <button class="btn-retry" (click)="retry(dl._id)">Retry</button>
                <button class="btn-resolve" (click)="resolve(dl._id)">Dismiss</button>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="empty">No failed jobs. All clear!</p>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .sys-grid { display:grid; grid-template-columns: repeat(5,1fr); gap: $space-md; margin-bottom: $space-xxl; }
    .sys-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.ok { border-color: rgba(87,136,108,.4); }
    }
    .sys-val { display:block; font-size: $font-size-lg; font-weight: $font-weight-bold; color: $color-text-primary; .ok & { color: $color-success; } }
    .sys-lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }

    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin: $space-xl 0 $space-md; }
    .queue-summary { display:flex; gap: $space-lg; margin-bottom: $space-md; font-size: $font-size-sm; color: $color-text-secondary; }
    .qs-item { &.warn strong { color: $color-error; } }

    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; margin-bottom: $space-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
    }
    .q-name { font-weight: $font-weight-semibold; font-family:monospace; color: $color-primary; }
    .active-count { color: #4682B4; font-weight: $font-weight-bold; }
    .ok-count { color: $color-success; }
    .fail-count { color: $color-error; font-weight: $font-weight-bold; }

    .dlq-info { font-size: $font-size-sm; color: $color-text-tertiary; margin-bottom: $space-md; }
    .dlq-list { display:flex; flex-direction:column; gap: $space-sm; }
    .dlq-card { padding: $space-md $space-lg; background: rgba(192,57,43,.03); border:1px solid rgba(192,57,43,.15); border-radius: $radius-lg; }
    .dlq-header { display:flex; gap: $space-md; align-items:center; margin-bottom: $space-xs; }
    .dlq-queue { font-weight: $font-weight-bold; color: $color-primary; font-family:monospace; font-size: $font-size-sm; }
    .dlq-job { font-size: $font-size-xs; color: $color-text-secondary; font-family:monospace; }
    .dlq-time { font-size: $font-size-xs; color: $color-text-disabled; margin-left:auto; }
    .dlq-reason { font-size: $font-size-sm; color: $color-error; margin:0 0 $space-sm; }
    .dlq-actions { display:flex; gap: $space-sm; }
    .btn-retry { padding: $space-xxs $space-md; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-xs; font-weight: $font-weight-semibold; cursor:pointer; }
    .btn-resolve { padding: $space-xxs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &:hover { border-color: $color-text-secondary; } }
    .empty { font-size: $font-size-sm; color: $color-success; }
  `],
})
export class SystemHealthComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly system = signal<any>(null);
  readonly queueHealth = signal<any>(null);
  readonly deadLetters = signal<any[]>([]);
  readonly dlqStats = signal<any>(null);

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/system/health`).subscribe({ next: (res) => this.system.set(res.data) });
    this.http.get<{ data: any }>(`${this.api}/admin/system/queues`).subscribe({ next: (res) => this.queueHealth.set(res.data) });
    this.http.get<{ data: any[] }>(`${this.api}/admin/system/dead-letters?limit=20`).subscribe({ next: (res) => this.deadLetters.set(res.data) });
    this.http.get<{ data: any }>(`${this.api}/admin/system/dead-letters/stats`).subscribe({ next: (res) => this.dlqStats.set(res.data) });
  }

  retry(id: string): void {
    this.http.post(`${this.api}/admin/system/dead-letters/${id}/retry`, {}).subscribe({ next: () => this.loadAll() });
  }

  resolve(id: string): void {
    this.http.post(`${this.api}/admin/system/dead-letters/${id}/resolve`, {}).subscribe({ next: () => this.loadAll() });
  }
}
