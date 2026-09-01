import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

interface MarketEvidence {
  clusterLabel?: string;
  memberKeywords?: string[];
  eligibleGrowthMemberKeywords?: string[];
  primaryIntent?: string | null;
  businessRelevanceScore?: number | null;
  demand?: { maxKnownVolume: number | null; metricsKnown: boolean; descriptiveTotalVolume: number | null };
  clusterGsc?: { impressions: number | null; evidenceKnown: boolean };
  matchedPageGsc?: { impressions: number | null; avgPosition: number | null; evidenceKnown: boolean } | null;
  mapping?: { bucket: string; matchedUrl: string | null; matchScore: number };
  cannibalizationRisk?: boolean;
  confidence?: 'low' | 'medium' | 'high';
  relatedRecommendationIds?: string[];
}

interface Recommendation {
  id: string;
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
  // Phase 4 (GSC/market) — demand kept distinct from technical priority
  source?: 'audit' | 'gsc' | 'market';
  confidence?: 'low' | 'medium' | 'high' | null;
  demandImpressions?: number;
  demandBonus?: number;
  effectivePriority?: 'high' | 'medium' | 'low';
  // Phase 5.1 — human review lifecycle, independent from open/resolved
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
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
    reviewSummary: { pending: number; approved: number; rejected: number; needsChanges: number };
  };
  recommendations: Recommendation[];
  resolved: Recommendation[];
}

// ── Phase 5.2 — change-draft types (mirrors backend SeoChangeDraft view) ──
interface MetadataFieldChange {
  current: string | null;
  proposed: string;
}
interface MetadataProposedChange {
  kind: 'metadata';
  targetUrl: string;
  fields: { title?: MetadataFieldChange; metaDescription?: MetadataFieldChange; h1?: MetadataFieldChange };
}
interface StructuredDataProposedChange {
  kind: 'structured_data';
  targetUrl: string;
  schemaType: string;
  jsonLd: Record<string, unknown>;
}
interface InternalLinkProposedChange {
  kind: 'internal_link';
  sourceUrl: string | null;
  targetUrl: string;
  anchorText: string | null;
}
interface ContentProposedChange {
  kind: 'content';
  targetUrl: string;
  blocks: { heading: string; body: string }[];
}
interface FaqProposedChange {
  kind: 'faq';
  targetUrl: string;
  items: { question: string; answer: string }[];
}
interface GenericProposedChange {
  kind: 'generic';
  targetUrl: string;
  summary: string;
  instructions: string;
  details?: Record<string, unknown>;
}
type ProposedChange =
  | MetadataProposedChange
  | StructuredDataProposedChange
  | InternalLinkProposedChange
  | ContentProposedChange
  | FaqProposedChange
  | GenericProposedChange;

interface ChangeDraft {
  id: string;
  recommendationId: string;
  recommendationFingerprint: string;
  targetUrl: string;
  source: string;
  type: string;
  status: 'draft' | 'superseded';
  generatorVersion: string;
  generatedAt: string;
  generatedBy: string;
  inputSnapshot: Record<string, unknown>;
  proposedChanges: ProposedChange[];
  validation: { isValid: boolean; warnings: string[]; errors: string[] };
  createdAt: string;
  updatedAt: string;
}

/**
 * SEO growth recommendations (Phase 3A) plus a human review layer (Phase 5.1).
 * Synthesizes the latest audit into prioritized, actionable advice. Review is
 * strictly recommend-only — approving/rejecting a recommendation here never
 * publishes anything or changes the live site.
 */
@Component({
  selector: 'app-seo-recommendations',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // ── Client-side filters (Phase 5.1) — operate on the currently loaded list ──
  reviewStatusFilter: ReviewStatus | 'all' = 'all';
  sourceFilter: 'audit' | 'gsc' | 'market' | 'all' = 'all';
  priorityFilter: 'high' | 'medium' | 'low' | 'all' = 'all';

  // ── Review-in-progress state, keyed by recommendation id ──
  readonly reviewNoteDrafts = signal<Record<string, string>>({});
  readonly reviewSubmitting = signal<Record<string, boolean>>({});
  readonly reviewErrors = signal<Record<string, string>>({});

  // ── Phase 5.2 — change-draft state, keyed by recommendation id. Draft
  // generation is GENERATION ONLY: it never publishes, mutates, or executes
  // any SEO change — it only creates a reviewable proposal document. ──
  readonly drafts = signal<Record<string, ChangeDraft[]>>({});
  readonly draftPanelOpen = signal<Set<string>>(new Set());
  readonly draftHistoryOpen = signal<Set<string>>(new Set());
  readonly draftGenerating = signal<Record<string, boolean>>({});
  readonly draftErrors = signal<Record<string, string>>({});

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

  // ── Filters — client-side only, over the currently loaded recommendation list ──
  filteredRecommendations(rep: RecoReport): Recommendation[] {
    return rep.recommendations.filter(
      (r) =>
        (this.reviewStatusFilter === 'all' || r.reviewStatus === this.reviewStatusFilter) &&
        (this.sourceFilter === 'all' || (r.source ?? 'audit') === this.sourceFilter) &&
        (this.priorityFilter === 'all' || r.priority === this.priorityFilter),
    );
  }

  // ── Market evidence (readable view) ──
  marketEvidence(r: Recommendation): MarketEvidence | null {
    return r.source === 'market' ? (r.evidence as MarketEvidence) : null;
  }

  displayText(v: string | null | undefined): string {
    return v ? v : 'Unknown';
  }

  displayNumber(v: number | null | undefined, known: boolean): string {
    return known && v != null ? v.toLocaleString() : 'Not available';
  }

  displayPercent(v: number | null | undefined): string {
    return v != null ? `${Math.round(v * 100)}%` : 'Unknown';
  }

  // ── Review actions (Phase 5.1) — review-only, never touches production SEO ──
  noteDraft(r: Recommendation): string {
    const drafts = this.reviewNoteDrafts();
    return r.id in drafts ? drafts[r.id] : (r.reviewNote ?? '');
  }

  setNoteDraft(r: Recommendation, value: string): void {
    this.reviewNoteDrafts.set({ ...this.reviewNoteDrafts(), [r.id]: value });
  }

  isSubmitting(r: Recommendation): boolean {
    return !!this.reviewSubmitting()[r.id];
  }

  reviewError(r: Recommendation): string {
    return this.reviewErrors()[r.id] ?? '';
  }

  reviewLabel(status: ReviewStatus): string {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'needs_changes':
        return 'Needs Changes';
    }
  }

  approve(r: Recommendation): void {
    this.submitReview(r, 'approved', false);
  }

  reject(r: Recommendation): void {
    this.submitReview(r, 'rejected', true);
  }

  needsChanges(r: Recommendation): void {
    this.submitReview(r, 'needs_changes', true);
  }

  resetToPending(r: Recommendation): void {
    if (!confirm('Reset this recommendation to Pending? This clears its review note and history.')) return;
    this.patchReview(r, 'pending', null);
  }

  private submitReview(
    r: Recommendation,
    status: 'approved' | 'rejected' | 'needs_changes',
    noteRequired: boolean,
  ): void {
    const note = this.noteDraft(r).trim();
    if (noteRequired && !note) {
      this.reviewErrors.set({ ...this.reviewErrors(), [r.id]: 'A note is required for this action.' });
      return;
    }
    this.patchReview(r, status, note || null);
  }

  private patchReview(r: Recommendation, reviewStatus: ReviewStatus, reviewNote: string | null): void {
    this.reviewErrors.set({ ...this.reviewErrors(), [r.id]: '' });
    this.reviewSubmitting.set({ ...this.reviewSubmitting(), [r.id]: true });
    this.http.patch(`${this.base}/recommendations/${r.id}/review`, { reviewStatus, reviewNote }).subscribe({
      next: () => {
        const drafts = { ...this.reviewNoteDrafts() };
        delete drafts[r.id];
        this.reviewNoteDrafts.set(drafts);
        this.reviewSubmitting.set({ ...this.reviewSubmitting(), [r.id]: false });
        this.load(); // Never claim success before the API confirms — refresh from the server.
      },
      error: (e) => {
        this.reviewSubmitting.set({ ...this.reviewSubmitting(), [r.id]: false });
        this.reviewErrors.set({ ...this.reviewErrors(), [r.id]: e?.error?.message || 'Failed to update review' });
      },
    });
  }

  // ── Phase 5.2 — change-draft panel (generation-only; never publishes) ──
  isDraftPanelOpen(r: Recommendation): boolean {
    return this.draftPanelOpen().has(r.id);
  }

  toggleDraftPanel(r: Recommendation): void {
    const set = new Set(this.draftPanelOpen());
    if (set.has(r.id)) {
      set.delete(r.id);
    } else {
      set.add(r.id);
      if (!this.drafts()[r.id]) this.loadDraftHistory(r);
    }
    this.draftPanelOpen.set(set);
  }

  isDraftHistoryOpen(r: Recommendation): boolean {
    return this.draftHistoryOpen().has(r.id);
  }

  toggleDraftHistory(r: Recommendation): void {
    const set = new Set(this.draftHistoryOpen());
    if (set.has(r.id)) set.delete(r.id);
    else set.add(r.id);
    this.draftHistoryOpen.set(set);
  }

  draftsFor(r: Recommendation): ChangeDraft[] {
    return this.drafts()[r.id] ?? [];
  }

  activeDraft(r: Recommendation): ChangeDraft | null {
    return this.draftsFor(r).find((d) => d.status === 'draft') ?? null;
  }

  supersededDrafts(r: Recommendation): ChangeDraft[] {
    return this.draftsFor(r).filter((d) => d.status === 'superseded');
  }

  isGeneratingDraft(r: Recommendation): boolean {
    return !!this.draftGenerating()[r.id];
  }

  draftError(r: Recommendation): string {
    return this.draftErrors()[r.id] ?? '';
  }

  fieldChars(field: MetadataFieldChange | undefined): number {
    return field?.proposed.length ?? 0;
  }

  generateDraft(r: Recommendation): void {
    this.draftErrors.set({ ...this.draftErrors(), [r.id]: '' });
    this.draftGenerating.set({ ...this.draftGenerating(), [r.id]: true });
    this.http.post<{ data: ChangeDraft }>(`${this.base}/recommendations/${r.id}/draft`, {}).subscribe({
      next: () => {
        this.draftGenerating.set({ ...this.draftGenerating(), [r.id]: false });
        const set = new Set(this.draftPanelOpen());
        set.add(r.id);
        this.draftPanelOpen.set(set);
        this.loadDraftHistory(r); // Never claim success before the API confirms — refresh from the server.
      },
      error: (e) => {
        this.draftGenerating.set({ ...this.draftGenerating(), [r.id]: false });
        this.draftErrors.set({ ...this.draftErrors(), [r.id]: e?.error?.message || 'Failed to generate draft' });
      },
    });
  }

  private loadDraftHistory(r: Recommendation): void {
    this.http.get<{ data: ChangeDraft[] }>(`${this.base}/recommendations/${r.id}/drafts`).subscribe({
      next: (res) => this.drafts.set({ ...this.drafts(), [r.id]: res.data }),
      error: (e) => this.draftErrors.set({ ...this.draftErrors(), [r.id]: e?.error?.message || 'Failed to load draft history' }),
    });
  }
}
