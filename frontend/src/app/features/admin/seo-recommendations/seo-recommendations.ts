import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Recommendation {
  recommendationId: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  impact: 'very-high' | 'high' | 'medium' | 'low';
  score: number;
  title: string;
  why: string;
  suggestedFix: string;
  estimatedEffort: 'small' | 'medium' | 'large';
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  relatedCheckIds: string[];
  state: 'new' | 'persistent' | 'resolved';
  // Phase 4 (GSC) — demand kept distinct from technical priority
  source?: 'audit' | 'gsc';
  confidence?: 'low' | 'medium' | 'high' | null;
  demandImpressions?: number;
  demandBonus?: number;
  effectivePriority?: 'high' | 'medium' | 'low';
}

interface RecoReport {
  summary: {
    runId: string;
    date: string;
    high: number;
    medium: number;
    low: number;
    highImpact: number;
    total: number;
    delta: { new: number; persistent: number; resolved: number };
  };
  recommendations: Recommendation[];
  resolved: Recommendation[];
}

/**
 * Read-only SEO growth recommendations (Phase 3A). Synthesizes the latest audit
 * into prioritized, actionable advice. Recommend-only — it never changes SEO.
 */
@Component({
  selector: 'app-seo-recommendations',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './seo-recommendations.html',
  styleUrls: ['./seo-recommendations.scss'],
})
export class SeoRecommendationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/seo`;

  readonly report = signal<RecoReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly expanded = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<{ data: RecoReport }>(`${this.base}/recommendations`).subscribe({
      next: (res) => {
        this.report.set(res.data);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message || 'Failed to load recommendations');
        this.loading.set(false);
      },
    });
  }

  key(r: Recommendation): string {
    return r.recommendationId + '::' + (r.affectedUrls[0] ?? '');
  }

  toggle(r: Recommendation): void {
    const set = new Set(this.expanded());
    const k = this.key(r);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    this.expanded.set(set);
  }

  isOpen(r: Recommendation): boolean {
    return this.expanded().has(this.key(r));
  }

  json(v: unknown): string {
    return JSON.stringify(v, null, 2);
  }
}
