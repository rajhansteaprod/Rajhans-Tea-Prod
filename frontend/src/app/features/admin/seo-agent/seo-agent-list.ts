import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import {
  Recommendation,
  RecoReport,
  ChangeDraft,
  ChangeExecution,
} from '../seo-recommendations/seo-recommendations';

type AttentionFilter = 'pending' | 'approved' | 'needs-attention' | 'completed' | 'all';

interface RowSummary {
  draft: ChangeDraft | null;
  execution: ChangeExecution | null;
  completed: boolean;
}

/**
 * SEO Agent — a single control surface for the existing recommendation →
 * preview → editorial feedback → exact-draft approval → preflight →
 * execute/publish → verify → complete lifecycle. This is a CONTROL SURFACE
 * ONLY: every action here calls an existing, already-tested backend service
 * through the admin API — nothing here mutates MongoDB directly, and
 * nothing here reimplements a second workflow alongside
 * seo-recommendations.ts (which remains the metadata-focused review tool).
 */
@Component({
  selector: 'app-seo-agent-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './seo-agent-list.html',
  styleUrls: ['./seo-agent-list.scss'],
})
export class SeoAgentListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiUrl}/admin/seo`;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly report = signal<RecoReport | null>(null);
  readonly summaries = signal<Record<string, RowSummary>>({});
  readonly summariesLoading = signal(false);

  filter: AttentionFilter = 'all';

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
        this.loadSummaries(res.data.recommendations);
      },
      error: (e) => {
        this.error.set(e?.error?.message || 'Failed to load recommendations');
        this.loading.set(false);
      },
    });
  }

  /** Best-effort per-row enrichment (latest draft + its execution, if any). A failure to enrich one row never blocks the list — it just shows less detail for that row. */
  private loadSummaries(recs: Recommendation[]): void {
    this.summariesLoading.set(true);
    let remaining = recs.length;
    if (remaining === 0) {
      this.summariesLoading.set(false);
      return;
    }
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) this.summariesLoading.set(false);
    };
    for (const r of recs) {
      this.http.get<{ data: ChangeDraft[] }>(`${this.base}/recommendations/${r.id}/drafts`).subscribe({
        next: (res) => {
          const draft = res.data[0] ?? null; // newest first
          this.summaries.set({ ...this.summaries(), [r.id]: { draft, execution: null, completed: false } });
          if (draft) this.loadExecutionSummary(r.id, draft.id);
          else done();
        },
        error: () => done(),
      });
    }
  }

  private loadExecutionSummary(recId: string, draftId: string): void {
    this.http.get<{ data: ChangeExecution[] }>(`${this.base}/change-drafts/${draftId}/executions`).subscribe({
      next: (res) => {
        const execution = res.data[0] ?? null;
        const prev = this.summaries()[recId];
        this.summaries.set({ ...this.summaries(), [recId]: { ...prev, execution } });
        if (execution) this.loadCompletionSummary(recId, execution.id);
      },
      error: () => undefined,
    });
  }

  private loadCompletionSummary(recId: string, executionId: string): void {
    this.http.get<{ data: { id: string }[] }>(`${this.base}/change-executions/${executionId}/completions`).subscribe({
      next: (res) => {
        const prev = this.summaries()[recId];
        this.summaries.set({ ...this.summaries(), [recId]: { ...prev, completed: res.data.length > 0 } });
      },
      error: () => undefined,
    });
  }

  summaryFor(r: Recommendation): RowSummary | null {
    return this.summaries()[r.id] ?? null;
  }

  /** The row's execution has a successful completion record — purely derived for display, never written back to recommendation.status. */
  isCompleted(r: Recommendation): boolean {
    return this.summaryFor(r)?.completed === true;
  }

  previewStatusLabel(r: Recommendation): string {
    const s = this.summaryFor(r);
    if (!s) return this.summariesLoading() ? 'Loading…' : 'Unknown';
    if (!s.draft) return 'No preview yet';
    const ge = (s.draft.inputSnapshot?.['generationEvidence'] as { readyForHumanReview?: boolean; status?: string } | undefined) ?? undefined;
    if (ge?.readyForHumanReview === false) return 'Generation failed';
    if (s.draft.previewOnly) return ge?.readyForHumanReview ? 'Preview ready' : 'Preview (pending review gate)';
    return s.draft.status === 'draft' ? 'Draft ready' : 'Superseded';
  }

  executionStatusLabel(r: Recommendation): string {
    const s = this.summaryFor(r);
    if (!s?.execution) return '—';
    if (s.completed) return 'Completed';
    return s.execution.status === 'succeeded' ? 'Executed' : s.execution.status;
  }

  /** Readable mapping of the EXISTING persisted lifecycle — no invented statuses. */
  attentionBucket(r: Recommendation): AttentionFilter {
    const s = this.summaryFor(r);
    if (s?.completed) return 'completed';
    if (r.reviewStatus === 'approved') return 'approved';
    if (r.reviewStatus === 'needs_changes') return 'needs-attention';
    const ge = (s?.draft?.inputSnapshot?.['generationEvidence'] as { readyForHumanReview?: boolean } | undefined) ?? undefined;
    if (ge?.readyForHumanReview === false) return 'needs-attention';
    return 'pending';
  }

  filtered(): Recommendation[] {
    const rep = this.report();
    if (!rep) return [];
    if (this.filter === 'all') return rep.recommendations;
    return rep.recommendations.filter((r) => this.attentionBucket(r) === this.filter);
  }

  countFor(bucket: AttentionFilter): number {
    const rep = this.report();
    if (!rep) return 0;
    if (bucket === 'all') return rep.recommendations.length;
    return rep.recommendations.filter((r) => this.attentionBucket(r) === bucket).length;
  }

  open(r: Recommendation): void {
    this.router.navigate(['/admin/seo/agent', r.id]);
  }

  reviewStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'needs_changes':
        return 'Needs Changes';
      default:
        return status;
    }
  }
}
