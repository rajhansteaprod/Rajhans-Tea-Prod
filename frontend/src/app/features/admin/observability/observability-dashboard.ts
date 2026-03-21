import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-observability-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Observability</h1>
        <p class="page-sub">API performance, error rates, and endpoint metrics</p>
      </div>

      @if (data()) {
        <!-- Error Summary -->
        <div class="error-summary">
          <div class="es-card"><span class="es-val">{{ data().errorSummary.totalRequests }}</span><span class="es-lbl">Total Requests (1h)</span></div>
          <div class="es-card"><span class="es-val">{{ data().errorSummary.totalErrors }}</span><span class="es-lbl">Errors</span></div>
          <div class="es-card" [class.danger]="data().errorSummary.errorRate > 5"><span class="es-val">{{ data().errorSummary.errorRate }}%</span><span class="es-lbl">Error Rate</span></div>
        </div>

        <!-- Top Errors -->
        @if (data().errorSummary.topErrors.length > 0) {
          <div class="section">
            <h3>Top Error Endpoints</h3>
            <div class="error-list">
              @for (e of data().errorSummary.topErrors; track e.endpoint) {
                <div class="error-row">
                  <span class="err-endpoint">{{ e.endpoint }}</span>
                  <span class="err-count">{{ e.errors }} errors</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Slowest Endpoints -->
        <div class="section">
          <h3>Slowest Endpoints (by p95)</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Endpoint</th><th>p95</th><th>p99</th><th>Avg</th></tr></thead>
              <tbody>
                @for (s of data().slowest; track s.endpoint) {
                  <tr>
                    <td class="ep-name">{{ s.endpoint }}</td>
                    <td [class.slow]="s.p95 > 500">{{ s.p95 }}ms</td>
                    <td [class.slow]="s.p99 > 1000">{{ s.p99 }}ms</td>
                    <td>{{ s.avg }}ms</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- All Endpoints -->
        <div class="section">
          <h3>Endpoint Overview (last 1 hour)</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Endpoint</th><th>Requests</th><th>Errors</th><th>Avg Latency</th></tr></thead>
              <tbody>
                @for (ep of data().endpoints; track ep.endpoint) {
                  <tr>
                    <td class="ep-name">{{ ep.endpoint }}</td>
                    <td>{{ ep.requests }}</td>
                    <td [class.err-highlight]="ep.errors > 0">{{ ep.errors }}</td>
                    <td [class.slow]="ep.avgLatencyMs > 500">{{ ep.avgLatencyMs }}ms</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
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

    .error-summary { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-md; margin-bottom: $space-xxl; }
    .es-card { padding: $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.danger { border-color: rgba(192,57,43,.4); background: rgba(192,57,43,.03); }
    }
    .es-val { display:block; font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; .danger & { color: $color-error; } }
    .es-lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }

    .section { margin-bottom: $space-xxl;
      h3 { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-md; }
    }

    .error-list { display:flex; flex-direction:column; gap: $space-xs; }
    .error-row { display:flex; justify-content:space-between; padding: $space-sm $space-md; background: rgba(192,57,43,.04); border:1px solid rgba(192,57,43,.12); border-radius: $radius-md; }
    .err-endpoint { font-family:monospace; font-size: $font-size-sm; color: $color-text-primary; }
    .err-count { font-size: $font-size-sm; font-weight: $font-weight-bold; color: $color-error; }

    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
    }
    .ep-name { font-family:monospace; font-size: $font-size-xs; }
    .slow { color: $color-error; font-weight: $font-weight-bold; }
    .err-highlight { color: $color-error; font-weight: $font-weight-bold; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class ObservabilityDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly data = signal<any>(null);

  ngOnInit(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/observability/dashboard`).subscribe({
      next: (res) => this.data.set(res.data),
    });
  }
}
