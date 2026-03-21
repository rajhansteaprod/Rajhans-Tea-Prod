import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Analytics</h1>
        <p class="page-sub">Revenue, orders, customers, and conversion insights</p>
      </div>

      <!-- KPI Cards -->
      @if (kpis()) {
        <div class="kpi-grid">
          <div class="kpi revenue"><span class="kpi-val">₹{{ kpis().totalRevenue | number:'1.0-0' }}</span><span class="kpi-sub">₹{{ kpis().todayRevenue | number:'1.0-0' }} today</span><span class="kpi-label">Total Revenue</span></div>
          <div class="kpi orders"><span class="kpi-val">{{ kpis().totalOrders }}</span><span class="kpi-sub">{{ kpis().todayOrders }} today</span><span class="kpi-label">Total Orders</span></div>
          <div class="kpi aov"><span class="kpi-val">₹{{ kpis().averageOrderValue | number:'1.0-0' }}</span><span class="kpi-label">Avg Order Value</span></div>
          <div class="kpi rating"><span class="kpi-val">{{ kpis().averageRating }} ★</span><span class="kpi-label">Avg Rating</span></div>
        </div>
      }

      <div class="charts-grid">
        <!-- Revenue Chart Data -->
        <div class="chart-card wide">
          <div class="chart-header">
            <h3>Revenue</h3>
            <select [(ngModel)]="revenuePeriod" (ngModelChange)="loadRevenue()">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div class="chart-table">
            @for (r of revenueData(); track r.date) {
              <div class="chart-row">
                <span class="chart-date">{{ r.date }}</span>
                <div class="chart-bar-wrap">
                  <div class="chart-bar revenue-bar" [style.width.%]="getBarWidth(r.revenue, maxRevenue())"></div>
                </div>
                <span class="chart-value">₹{{ r.revenue | number:'1.0-0' }}</span>
              </div>
            }
            @if (revenueData().length === 0) {
              <p class="empty">No revenue data yet.</p>
            }
          </div>
        </div>

        <!-- Orders by Status -->
        <div class="chart-card">
          <h3>Orders by Status</h3>
          <div class="status-list">
            @for (s of ordersByStatus(); track s.status) {
              <div class="status-row">
                <span class="status-badge" [attr.data-status]="s.status">{{ s.status }}</span>
                <span class="status-count">{{ s.count }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Top Products -->
        <div class="chart-card wide">
          <h3>Top Selling Products</h3>
          <div class="chart-table">
            @for (p of topProducts(); track p.productId; let i = $index) {
              <div class="chart-row">
                <span class="rank">#{{ i + 1 }}</span>
                <span class="product-name">{{ p.name }}</span>
                <span class="product-qty">{{ p.totalQty }} sold</span>
                <span class="chart-value">₹{{ p.totalRevenue | number:'1.0-0' }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Conversion Funnel -->
        <div class="chart-card">
          <h3>Conversion Funnel (30d)</h3>
          <div class="funnel">
            @for (f of funnel(); track f.stage) {
              <div class="funnel-step">
                <div class="funnel-bar" [style.width.%]="getFunnelWidth(f.count)"></div>
                <span class="funnel-label">{{ f.stage }}</span>
                <span class="funnel-count">{{ f.count }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .kpi-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: $space-md; margin-bottom: $space-xxl; }
    .kpi { padding: $space-xl; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.revenue { border-left:4px solid $color-success; }
      &.orders { border-left:4px solid $color-primary; }
      &.aov { border-left:4px solid $color-accent; }
      &.rating { border-left:4px solid #F59E0B; }
    }
    .kpi-val { display:block; font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .kpi-sub { display:block; font-size: $font-size-xs; color: $color-text-tertiary; margin-bottom: $space-xxs; }
    .kpi-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; letter-spacing:.06em; }

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
    .chart-row { display:grid; grid-template-columns: 80px 1fr 80px; gap: $space-sm; align-items:center; font-size: $font-size-sm; }
    .chart-date { font-size: $font-size-xs; color: $color-text-tertiary; }
    .chart-bar-wrap { height:20px; background: $color-bg-secondary; border-radius: $radius-sm; overflow:hidden; }
    .chart-bar { height:100%; border-radius: $radius-sm; transition: width $transition-normal; }
    .revenue-bar { background: linear-gradient(90deg, $color-success, rgba(87,136,108,.6)); }
    .chart-value { text-align:right; font-weight: $font-weight-semibold; color: $color-text-primary; font-size: $font-size-xs; }
    .rank { font-weight: $font-weight-bold; color: $color-text-tertiary; }
    .product-name { font-weight: $font-weight-medium; color: $color-text-primary; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .product-qty { font-size: $font-size-xs; color: $color-text-tertiary; }
    .empty { font-size: $font-size-sm; color: $color-text-disabled; text-align:center; padding: $space-lg; }

    .status-list { display:flex; flex-direction:column; gap: $space-sm; }
    .status-row { display:flex; align-items:center; justify-content:space-between; padding: $space-xs 0; }
    .status-badge { padding:2px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="confirmed"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="processing"] { background:rgba(162,126,142,.12); color: $color-accent; }
      &[data-status="shipped"],&[data-status="in_transit"],&[data-status="out_for_delivery"] { background:rgba(70,130,180,.1); color:#4682B4; }
      &[data-status="delivered"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="cancelled"],&[data-status="returned"] { background:rgba(192,57,43,.1); color: $color-error; }
    }
    .status-count { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; }

    .funnel { display:flex; flex-direction:column; gap: $space-sm; }
    .funnel-step { display:grid; grid-template-columns: 1fr auto; gap: $space-sm; align-items:center; position:relative; }
    .funnel-bar { height:28px; background: linear-gradient(90deg, $color-primary, rgba(204,88,3,.4)); border-radius: $radius-sm; position:absolute; top:0; left:0; z-index:0; }
    .funnel-label { position:relative; z-index:1; font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-primary; padding-left: $space-sm; line-height:28px; }
    .funnel-count { position:relative; z-index:1; font-size: $font-size-sm; font-weight: $font-weight-bold; color: $color-text-primary; }
  `],
})
export class AnalyticsDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly kpis = signal<any>(null);
  readonly revenueData = signal<any[]>([]);
  readonly maxRevenue = signal(1);
  readonly ordersByStatus = signal<any[]>([]);
  readonly topProducts = signal<any[]>([]);
  readonly funnel = signal<any[]>([]);
  revenuePeriod = 'daily';

  ngOnInit(): void {
    this.loadDashboard();
    this.loadRevenue();
    this.loadFunnel();
  }

  loadDashboard(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/analytics/dashboard`).subscribe({
      next: (res) => {
        this.kpis.set(res.data.kpis);
        this.ordersByStatus.set(res.data.ordersByStatus);
        this.topProducts.set(res.data.topProducts);
      },
    });
  }

  loadRevenue(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/revenue?period=${this.revenuePeriod}&days=30`).subscribe({
      next: (res) => {
        this.revenueData.set(res.data);
        const max = Math.max(...res.data.map((r: any) => r.revenue), 1);
        this.maxRevenue.set(max);
      },
    });
  }

  loadFunnel(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/analytics/funnel`).subscribe({
      next: (res) => this.funnel.set(res.data),
    });
  }

  getBarWidth(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  getFunnelWidth(count: number): number {
    const max = this.funnel()[0]?.count || 1;
    return Math.max(5, (count / max) * 100);
  }
}
