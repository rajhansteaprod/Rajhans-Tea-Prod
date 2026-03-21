import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type Tab = 'overview' | 'segmentation' | 'products' | 'forecast' | 'exports';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Analytics & Intelligence</h1>
        <div class="realtime">
          @if (realtime()) {
            <span class="rt-dot"></span>
            <span>{{ realtime().connectedUsers }} online · {{ realtime().activeCarts }} active carts</span>
          }
        </div>
      </div>

      <!-- KPI Comparison Cards -->
      @if (kpiComparison()) {
        <div class="kpi-grid">
          @for (kpi of kpiCards; track kpi.key) {
            <div class="kpi-card">
              <span class="kpi-label">{{ kpi.label }}</span>
              <span class="kpi-value">{{ kpi.prefix }}{{ kpiComparison()[kpi.key].current | number:'1.0-0' }}</span>
              <span class="kpi-change" [class.up]="kpiComparison()[kpi.key].change > 0" [class.down]="kpiComparison()[kpi.key].change < 0">
                {{ kpiComparison()[kpi.key].change > 0 ? '↑' : kpiComparison()[kpi.key].change < 0 ? '↓' : '→' }}
                {{ kpiComparison()[kpi.key].change | number:'1.1-1' }}% vs last week
              </span>
            </div>
          }
        </div>
      }

      <!-- Tabs -->
      <div class="tabs">
        @for (t of tabs; track t.key) {
          <button class="tab" [class.active]="activeTab() === t.key" (click)="switchTab(t.key)">{{ t.label }}</button>
        }
      </div>

      <!-- TAB: Overview -->
      @if (activeTab() === 'overview') {
        <div class="charts-grid">
          <div class="chart-card wide">
            <div class="chart-header"><h3>Revenue</h3>
              <select [(ngModel)]="revenuePeriod" (ngModelChange)="loadRevenue()">
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
            </div>
            <div class="chart-table">
              @for (r of revenueData(); track r.date) {
                <div class="bar-row"><span class="bar-label">{{ r.date }}</span><div class="bar-wrap"><div class="bar revenue-bar" [style.width.%]="pct(r.revenue, maxRevenue())"></div></div><span class="bar-val">₹{{ r.revenue | number:'1.0-0' }}</span></div>
              }
            </div>
          </div>
          <div class="chart-card">
            <h3>Orders by Status</h3>
            @for (s of ordersByStatus(); track s.status) {
              <div class="status-row"><span class="badge" [attr.data-status]="s.status">{{ s.status }}</span><span class="status-count">{{ s.count }}</span></div>
            }
          </div>
          <div class="chart-card">
            <h3>Conversion Funnel (30d)</h3>
            @for (f of funnel(); track f.stage) {
              <div class="funnel-row">
                <div class="funnel-bar" [style.width.%]="funnelPct(f.count)"></div>
                <span class="funnel-label">{{ f.stage }}</span>
                <span class="funnel-count">{{ f.count }}</span>
              </div>
            }
          </div>
          <div class="chart-card">
            <h3>Cohort Retention (6 months)</h3>
            @for (c of cohorts(); track c.cohort) {
              <div class="cohort-row">
                <span class="cohort-month">{{ c.cohort }}</span>
                <span class="cohort-users">{{ c.totalUsers }} users</span>
                <span class="cohort-rate" [class.good]="c.retentionRate >= 30" [class.bad]="c.retentionRate < 15">{{ c.retentionRate }}%</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- TAB: User Segmentation -->
      @if (activeTab() === 'segmentation') {
        <div class="segment-grid">
          @for (s of segments(); track s.segment) {
            <div class="segment-card" [attr.data-segment]="s.segment">
              <span class="seg-count">{{ s.count }}</span>
              <span class="seg-label">{{ s.segment | titlecase }}</span>
              <span class="seg-revenue">₹{{ s.totalRevenue | number:'1.0-0' }}</span>
            </div>
          }
        </div>
        <h3 class="section-title">Churn Risk Users</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>User</th><th>Segment</th><th>Orders</th><th>Spent</th><th>Last Order</th><th>Days Ago</th></tr></thead>
            <tbody>
              @for (u of churnUsers(); track u._id) {
                <tr>
                  <td>{{ u.firstName || u.phone }}</td>
                  <td><span class="badge" [attr.data-segment]="u.segment">{{ u.segment }}</span></td>
                  <td>{{ u.totalOrders }}</td>
                  <td>₹{{ u.totalSpent | number:'1.0-0' }}</td>
                  <td>{{ u.lastOrderDate ? (u.lastOrderDate | date:'dd MMM') : '—' }}</td>
                  <td class="days-ago">{{ u.daysSinceLastOrder ?? '—' }}d</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- TAB: Product Performance -->
      @if (activeTab() === 'products') {
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Product</th><th>Score</th><th>Sales</th><th>Views</th><th>Rating</th><th>Stock</th></tr></thead>
            <tbody>
              @for (p of productPerf(); track p._id; let i = $index) {
                <tr>
                  <td class="rank">{{ i + 1 }}</td>
                  <td class="pname">{{ p.name }}</td>
                  <td class="score">{{ p.score }}</td>
                  <td>{{ p.salesQty }}</td>
                  <td>{{ p.viewCount }}</td>
                  <td>{{ p.avgRating || '—' }} ★</td>
                  <td [class.low-stock]="p.stock <= 5">{{ p.stock }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- TAB: Revenue Forecast -->
      @if (activeTab() === 'forecast') {
        @if (forecast()) {
          <div class="forecast-header">
            <div class="trend-card" [class.up]="forecast().trend === 'up'" [class.down]="forecast().trend === 'down'">
              <span class="trend-icon">{{ forecast().trend === 'up' ? '📈' : forecast().trend === 'down' ? '📉' : '➡️' }}</span>
              <span class="trend-text">{{ forecast().trend | titlecase }} trend · {{ forecast().growthRate > 0 ? '+' : '' }}{{ forecast().growthRate }}% growth</span>
            </div>
          </div>
          <div class="chart-card wide">
            <h3>Revenue Forecast (next 7 days)</h3>
            <div class="chart-table">
              @for (f of forecast().forecast; track f.date) {
                <div class="bar-row forecast"><span class="bar-label">{{ f.date }}</span><div class="bar-wrap"><div class="bar forecast-bar" [style.width.%]="pct(f.predicted, forecastMax())"></div></div><span class="bar-val">₹{{ f.predicted | number:'1.0-0' }}</span></div>
              }
            </div>
          </div>
        }
      }

      <!-- TAB: Exports -->
      @if (activeTab() === 'exports') {
        <div class="export-grid">
          <div class="export-card">
            <h3>Orders</h3>
            <p>Download all orders as CSV</p>
            <a class="btn-export" [href]="api + '/admin/export/orders'" target="_blank">Download CSV</a>
          </div>
          <div class="export-card">
            <h3>Users</h3>
            <p>Download all users as CSV</p>
            <a class="btn-export" [href]="api + '/admin/export/users'" target="_blank">Download CSV</a>
          </div>
          <div class="export-card">
            <h3>Products</h3>
            <p>Download all products as CSV</p>
            <a class="btn-export" [href]="api + '/admin/export/products'" target="_blank">Download CSV</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0; }
    .realtime { display:flex; align-items:center; gap: $space-xs; font-size: $font-size-sm; color: $color-text-tertiary; }
    .rt-dot { width:8px; height:8px; border-radius:50%; background: $color-success; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }

    .kpi-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .kpi-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center; }
    .kpi-label { display:block; font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; letter-spacing:.06em; margin-bottom: $space-xxs; }
    .kpi-value { display:block; font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .kpi-change { display:block; font-size: $font-size-xs; font-weight: $font-weight-semibold; margin-top: $space-xxs;
      &.up { color: $color-success; }
      &.down { color: $color-error; }
    }

    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px;
      &.active { color: $color-primary; border-bottom-color: $color-primary; font-weight: $font-weight-semibold; }
    }

    .charts-grid { display:grid; grid-template-columns: repeat(2,1fr); gap: $space-lg; }
    .chart-card { background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; padding: $space-xl;
      h3 { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-lg; }
      &.wide { grid-column: span 2; }
    }
    .chart-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: $space-lg;
      h3 { margin:0; }
      select { padding: $space-xs $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-xs; background: $color-bg-secondary; font-family: $font-family; }
    }
    .chart-table { display:flex; flex-direction:column; gap: $space-xs; }
    .bar-row { display:grid; grid-template-columns: 80px 1fr 80px; gap: $space-sm; align-items:center; font-size: $font-size-sm;
      &.forecast { opacity:.8; }
    }
    .bar-label { font-size: $font-size-xs; color: $color-text-tertiary; }
    .bar-wrap { height:20px; background: $color-bg-secondary; border-radius: $radius-sm; overflow:hidden; }
    .bar { height:100%; border-radius: $radius-sm; }
    .revenue-bar { background: linear-gradient(90deg, $color-success, rgba(87,136,108,.5)); }
    .forecast-bar { background: linear-gradient(90deg, $color-primary, rgba(204,88,3,.4)); }
    .bar-val { text-align:right; font-weight: $font-weight-semibold; color: $color-text-primary; font-size: $font-size-xs; }

    .status-row { display:flex; align-items:center; justify-content:space-between; padding: $space-xs 0; }
    .badge { padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="confirmed"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="processing"] { background:rgba(162,126,142,.12); color: $color-accent; }
      &[data-status="shipped"],&[data-status="in_transit"],&[data-status="out_for_delivery"] { background:rgba(70,130,180,.1); color:#4682B4; }
      &[data-status="delivered"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="cancelled"],&[data-status="returned"] { background:rgba(192,57,43,.1); color: $color-error; }
      &[data-segment="vip"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-segment="active"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-segment="at_risk"] { background:rgba(204,88,3,.15); color: $color-warning; }
      &[data-segment="churned"] { background:rgba(192,57,43,.1); color: $color-error; }
      &[data-segment="new"] { background:rgba(162,126,142,.12); color: $color-accent; }
    }
    .status-count { font-size: $font-size-md; font-weight: $font-weight-bold; }

    .funnel-row { display:grid; grid-template-columns: 1fr auto; gap: $space-sm; align-items:center; position:relative; margin-bottom: $space-xs; }
    .funnel-bar { height:28px; background: linear-gradient(90deg, $color-primary, rgba(204,88,3,.3)); border-radius: $radius-sm; position:absolute; top:0; left:0; }
    .funnel-label { position:relative; z-index:1; font-size: $font-size-sm; padding-left: $space-sm; line-height:28px; }
    .funnel-count { position:relative; z-index:1; font-size: $font-size-sm; font-weight: $font-weight-bold; }

    .cohort-row { display:grid; grid-template-columns: 1fr 1fr auto; gap: $space-sm; padding: $space-xs 0; font-size: $font-size-sm; border-bottom:1px solid $color-border-light; }
    .cohort-month { font-weight: $font-weight-semibold; color: $color-text-primary; }
    .cohort-users { color: $color-text-tertiary; }
    .cohort-rate { font-weight: $font-weight-bold; &.good { color: $color-success; } &.bad { color: $color-error; } }

    .segment-grid { display:grid; grid-template-columns: repeat(5,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .segment-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &[data-segment="vip"] { border-color: $color-primary; }
      &[data-segment="churned"] { border-color: $color-error; }
    }
    .seg-count { display:block; font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .seg-label { display:block; font-size: $font-size-sm; color: $color-text-secondary; text-transform:capitalize; margin-bottom: $space-xxs; }
    .seg-revenue { font-size: $font-size-xs; color: $color-text-tertiary; }

    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-md; }
    .table-wrap { overflow-x:auto; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .data-table { width:100%; border-collapse:collapse;
      th { padding: $space-sm $space-md; text-align:left; font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; background: $color-bg-secondary; border-bottom:1px solid $color-border-light; }
      td { padding: $space-sm $space-md; font-size: $font-size-sm; color: $color-text-primary; border-bottom:1px solid $color-border-light; }
      tr:last-child td { border-bottom:none; }
      tr:hover td { background: $color-bg-secondary; }
    }
    .rank { font-weight: $font-weight-bold; color: $color-text-tertiary; }
    .pname { font-weight: $font-weight-medium; }
    .score { font-weight: $font-weight-bold; color: $color-primary; }
    .days-ago { font-weight: $font-weight-bold; }
    .low-stock { color: $color-error; font-weight: $font-weight-bold; }

    .forecast-header { margin-bottom: $space-lg; }
    .trend-card { display:inline-flex; align-items:center; gap: $space-sm; padding: $space-md $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl;
      &.up { border-color: rgba(87,136,108,.3); }
      &.down { border-color: rgba(192,57,43,.3); }
    }
    .trend-icon { font-size: $font-size-xl; }
    .trend-text { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }

    .export-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-lg; }
    .export-card { padding: $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      h3 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0 0 $space-sm; }
      p { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-lg; }
    }
    .btn-export { display:inline-block; padding: $space-sm $space-xl; background: $color-primary; color: $color-text-inverse; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; text-decoration:none; transition: all $transition-fast;
      &:hover { background: $color-primary-hover; transform:translateY(-1px); }
    }
  `],
})
export class AnalyticsDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly api = environment.apiUrl;

  readonly activeTab = signal<Tab>('overview');
  readonly kpiComparison = signal<any>(null);
  readonly revenueData = signal<any[]>([]);
  readonly maxRevenue = signal(1);
  readonly ordersByStatus = signal<any[]>([]);
  readonly funnel = signal<any[]>([]);
  readonly cohorts = signal<any[]>([]);
  readonly segments = signal<any[]>([]);
  readonly churnUsers = signal<any[]>([]);
  readonly productPerf = signal<any[]>([]);
  readonly forecast = signal<any>(null);
  readonly forecastMax = signal(1);
  readonly realtime = signal<any>(null);

  revenuePeriod = 'daily';

  tabs = [
    { key: 'overview' as Tab, label: 'Overview' },
    { key: 'segmentation' as Tab, label: 'Users & Segments' },
    { key: 'products' as Tab, label: 'Product Performance' },
    { key: 'forecast' as Tab, label: 'Forecast' },
    { key: 'exports' as Tab, label: 'Export Data' },
  ];

  kpiCards = [
    { key: 'revenue', label: 'Revenue', prefix: '₹' },
    { key: 'orders', label: 'Orders', prefix: '' },
    { key: 'newUsers', label: 'New Users', prefix: '' },
    { key: 'avgOrderValue', label: 'Avg Order Value', prefix: '₹' },
  ];

  ngOnInit(): void {
    this.loadKPIComparison();
    this.loadOverview();
    this.loadRealtime();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'segmentation') this.loadSegmentation();
    if (tab === 'products') this.loadProductPerformance();
    if (tab === 'forecast') this.loadForecast();
  }

  loadKPIComparison(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/kpi-comparison`).subscribe({
      next: (res) => this.kpiComparison.set(res.data),
    });
  }

  loadOverview(): void {
    this.loadRevenue();
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/dashboard`).subscribe({
      next: (res) => { this.ordersByStatus.set(res.data.ordersByStatus); },
    });
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/funnel`).subscribe({
      next: (res) => this.funnel.set(res.data),
    });
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/cohorts`).subscribe({
      next: (res) => this.cohorts.set(res.data),
    });
  }

  loadRevenue(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/revenue?period=${this.revenuePeriod}&days=30`).subscribe({
      next: (res) => { this.revenueData.set(res.data); this.maxRevenue.set(Math.max(...res.data.map((r: any) => r.revenue), 1)); },
    });
  }

  loadSegmentation(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/segmentation`).subscribe({
      next: (res) => this.segments.set(res.data.segments),
    });
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/churn-risk`).subscribe({
      next: (res) => this.churnUsers.set(res.data),
    });
  }

  loadProductPerformance(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/product-performance?limit=20`).subscribe({
      next: (res) => this.productPerf.set(res.data),
    });
  }

  loadForecast(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/forecast?days=7`).subscribe({
      next: (res) => {
        this.forecast.set(res.data);
        this.forecastMax.set(Math.max(...(res.data.forecast || []).map((f: any) => f.predicted), 1));
      },
    });
  }

  loadRealtime(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/realtime`).subscribe({
      next: (res) => this.realtime.set(res.data),
    });
    // Refresh every 30s
    setInterval(() => {
      this.http.get<{ data: any }>(`${this.api}/admin/analytics/realtime`).subscribe({
        next: (res) => this.realtime.set(res.data),
      });
    }, 30000);
  }

  pct(value: number, max: number): number { return max > 0 ? (value / max) * 100 : 0; }
  funnelPct(count: number): number { return Math.max(5, this.pct(count, this.funnel()[0]?.count || 1)); }
}
