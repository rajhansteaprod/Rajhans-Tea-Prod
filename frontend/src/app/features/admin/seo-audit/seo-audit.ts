import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface RunSummary {
  id: string;
  date: string;
  trigger: string;
  status: string;
  isBaseline: boolean;
  urlsDiscovered: number;
  urlsFetched: number;
  coverage: number;
  counts: { critical: number; warning: number; info: number };
  delta: { new: number; resolved: number; regressions: number };
}

interface Issue {
  url: string;
  checkId: string;
  severity: 'critical' | 'warning' | 'info';
  status: string;
  why: string;
  actual: unknown;
  expected: unknown;
  firstSeenRunId: string;
  lastSeenRunId: string;
  previousState: string;
  currentState: string;
}

interface Report {
  summary: RunSummary & { siteReachable: boolean; error: string | null };
  critical: Issue[];
  warning: Issue[];
  info: Issue[];
  regressions: Issue[];
  resolved: Issue[];
}

/**
 * Read-only SEO audit report (Phase 2a). Triggers a manual audit and displays the
 * run summary + drill-down issues. Observes only — it never changes production SEO.
 */
@Component({
  selector: 'app-seo-audit',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './seo-audit.html',
  styleUrls: ['./seo-audit.scss'],
})
export class SeoAuditComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/seo`;

  readonly runs = signal<RunSummary[]>([]);
  readonly report = signal<Report | null>(null);
  readonly loading = signal(false);
  readonly triggering = signal(false);
  readonly error = signal('');

  private poll: ReturnType<typeof setInterval> | null = null;

  readonly hasRunning = computed(() => this.runs().some((r) => r.status === 'running'));

  ngOnInit(): void {
    this.loadRuns();
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  loadRuns(): void {
    this.loading.set(true);
    this.http.get<{ data: RunSummary[] }>(`${this.base}/runs`).subscribe({
      next: (res) => {
        this.runs.set(res.data);
        this.loading.set(false);
        // Keep polling while an audit is in progress, then stop.
        if (this.hasRunning() && !this.poll) {
          this.poll = setInterval(() => this.loadRuns(), 5000);
        } else if (!this.hasRunning() && this.poll) {
          clearInterval(this.poll);
          this.poll = null;
        }
      },
      error: () => {
        this.error.set('Failed to load runs');
        this.loading.set(false);
      },
    });
  }

  triggerAudit(): void {
    this.triggering.set(true);
    this.error.set('');
    this.http.post<{ data: unknown }>(`${this.base}/audit`, { scope: 'daily' }).subscribe({
      next: () => {
        this.triggering.set(false);
        setTimeout(() => this.loadRuns(), 1000);
      },
      error: (e) => {
        this.triggering.set(false);
        this.error.set(e?.error?.message || 'Failed to trigger audit');
      },
    });
  }

  viewReport(id: string): void {
    this.report.set(null);
    this.http.get<{ data: Report }>(`${this.base}/runs/${id}`).subscribe({
      next: (res) => this.report.set(res.data),
      error: () => this.error.set('Failed to load report'),
    });
  }

  closeReport(): void {
    this.report.set(null);
  }

  fmt(v: unknown): string {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
