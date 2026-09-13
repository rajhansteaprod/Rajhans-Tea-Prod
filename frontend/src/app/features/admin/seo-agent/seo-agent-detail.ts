import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import {
  Recommendation,
  RecoReport,
  ChangeDraft,
  ChangeDraftPreflight,
  ChangeExecution,
  ChangeVerification,
  ChangeCompletion,
  BlogCreateProposedChange,
  MetadataProposedChange,
  StructuredDataProposedChange,
  InternalLinkProposedChange,
  ContentProposedChange,
  FaqProposedChange,
  GenericProposedChange,
} from '../seo-recommendations/seo-recommendations';

/** Mirrors backend change-publication.service.ts's toPublicationView() — there is no existing frontend type for it yet (the publication lifecycle had no admin UI surface before this page). */
interface PublicationView {
  id: string;
  executionId: string;
  recommendationId: string;
  draftId: string;
  requestedByUserId: string;
  requestedAt: string;
  status: 'pending' | 'building' | 'published' | 'failed';
  startedAt: string | null;
  publishedAt: string | null;
  failedAt: string | null;
  frontendImage: string | null;
  frontendSourceRef: string | null;
  attemptCount: number;
  errorMessage: string | null;
  publicationVersion: string;
  verificationId: string | null;
  verificationStatus: string | null;
  redeployAttemptCount: number;
  redeployEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The autonomous-drafting audit trail persisted on a topical-authority draft's inputSnapshot.generationEvidence — shown read-only for review, never trusted as authorization for anything. */
interface GenerationEvidence {
  mode?: string;
  status?: string;
  provider?: string;
  model?: string;
  openaiCallCount?: number;
  error?: string | null;
  unsupportedClaims?: string[];
  notes?: string[];
  editorialFeedback?: string | null;
  readyForHumanReview?: boolean;
  plan?: { cannibalizationNotes?: string[] };
  diagnostics?: {
    originalFailures: string[];
    repairNotes: string[];
    postRepairFailures: string[];
    newFailures: string[];
    persistedFailures: string[];
    resolvedFailures: string[];
    cleanupAttempted: boolean;
    cleanupFailures?: string[];
  } | null;
}

@Component({
  selector: 'app-seo-agent-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seo-agent-detail.html',
  styleUrls: ['./seo-agent-detail.scss'],
})
export class SeoAgentDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/seo`;

  recId = '';

  readonly loading = signal(false);
  readonly error = signal('');
  readonly recommendation = signal<Recommendation | null>(null);
  readonly drafts = signal<ChangeDraft[]>([]);

  // ── Generate / regenerate preview ──
  editorialFeedback = '';
  readonly generating = signal(false);
  readonly generateError = signal('');

  // ── Exact-draft approval ──
  approveNote = '';
  readonly approving = signal(false);
  readonly approveError = signal('');

  // ── Draft-agnostic review (reject / needs changes / keep pending) ──
  reviewNote = '';
  readonly reviewSubmitting = signal(false);
  readonly reviewError = signal('');

  // ── Preflight ──
  readonly preflight = signal<ChangeDraftPreflight | null>(null);
  readonly preflighting = signal(false);
  readonly preflightError = signal('');

  // ── Execute ──
  readonly executing = signal(false);
  readonly executeError = signal('');
  readonly executions = signal<ChangeExecution[]>([]);

  // ── Publication / verification / completion ──
  readonly publication = signal<PublicationView | null>(null);
  readonly verifications = signal<ChangeVerification[]>([]);
  readonly verifying = signal(false);
  readonly verifyError = signal('');
  readonly completions = signal<ChangeCompletion[]>([]);
  readonly completing = signal(false);
  readonly completeError = signal('');

  readonly showRawEvidence = signal(false);
  readonly showRawDraft = signal(false);

  ngOnInit(): void {
    this.recId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');
    // There is no single-recommendation GET endpoint — the existing report
    // endpoint is the only read surface, so the detail page reuses it and
    // finds its own row. This adds no new read endpoint for something the
    // list endpoint already returns in full.
    this.http.get<{ data: RecoReport }>(`${this.base}/recommendations`).subscribe({
      next: (res) => {
        const rec = res.data.recommendations.find((r) => r.id === this.recId) ?? res.data.resolved.find((r) => r.id === this.recId) ?? null;
        this.recommendation.set(rec);
        this.loading.set(false);
        if (!rec) {
          this.error.set('Recommendation not found (it may have been resolved by a later audit).');
          return;
        }
        this.loadDrafts();
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error?.message || 'Failed to load recommendation');
      },
    });
  }

  private loadDrafts(): void {
    this.http.get<{ data: ChangeDraft[] }>(`${this.base}/recommendations/${this.recId}/drafts`).subscribe({
      next: (res) => {
        this.drafts.set(res.data);
        const active = res.data.find((d) => d.status === 'draft');
        if (active) this.loadExecutions(active.id);
      },
      error: (e) => this.error.set(e?.error?.message || 'Failed to load draft history'),
    });
  }

  private loadExecutions(draftId: string): void {
    this.http.get<{ data: ChangeExecution[] }>(`${this.base}/change-drafts/${draftId}/executions`).subscribe({
      next: (res) => {
        this.executions.set(res.data);
        const execution = res.data[0];
        if (execution) {
          this.loadPublication(execution.id);
          this.loadVerifications(execution.id);
          this.loadCompletions(execution.id);
        }
      },
      error: () => undefined,
    });
  }

  private loadPublication(executionId: string): void {
    this.http.get<{ data: PublicationView | null }>(`${this.base}/change-executions/${executionId}/publication`).subscribe({
      next: (res) => this.publication.set(res.data),
      error: () => undefined,
    });
  }

  private loadVerifications(executionId: string): void {
    this.http.get<{ data: ChangeVerification[] }>(`${this.base}/change-executions/${executionId}/verifications`).subscribe({
      next: (res) => this.verifications.set(res.data),
      error: () => undefined,
    });
  }

  private loadCompletions(executionId: string): void {
    this.http.get<{ data: ChangeCompletion[] }>(`${this.base}/change-executions/${executionId}/completions`).subscribe({
      next: (res) => this.completions.set(res.data),
      error: () => undefined,
    });
  }

  // ── Derived state ──
  get activeDraft(): ChangeDraft | null {
    return this.drafts().find((d) => d.status === 'draft') ?? null;
  }

  get supersededDrafts(): ChangeDraft[] {
    return this.drafts().filter((d) => d.status === 'superseded');
  }

  get latestExecution(): ChangeExecution | null {
    return this.executions()[0] ?? null;
  }

  get latestVerification(): ChangeVerification | null {
    return this.verifications()[0] ?? null;
  }

  get latestCompletion(): ChangeCompletion | null {
    return this.completions()[0] ?? null;
  }

  /** Only topical-authority recommendations go through the autonomous AI writer — editorial feedback is meaningless (silently ignored server-side) for every other category, so the UI never offers it there. */
  get supportsEditorialFeedback(): boolean {
    return this.recommendation()?.category === 'topical-authority';
  }

  get proposedChange():
    | MetadataProposedChange
    | StructuredDataProposedChange
    | InternalLinkProposedChange
    | ContentProposedChange
    | FaqProposedChange
    | GenericProposedChange
    | BlogCreateProposedChange
    | null {
    return this.activeDraft?.proposedChanges[0] ?? null;
  }

  get isBlogCreate(): boolean {
    return this.proposedChange?.kind === 'blog_create';
  }

  get blogCreateChange(): BlogCreateProposedChange | null {
    return this.isBlogCreate ? (this.proposedChange as BlogCreateProposedChange) : null;
  }

  get generationEvidence(): GenerationEvidence | null {
    const draft = this.activeDraft;
    if (!draft) return null;
    return (draft.inputSnapshot?.['generationEvidence'] as GenerationEvidence | undefined) ?? null;
  }

  /** A draft with no executable article/change at all — a failure/diagnostic record, never approvable. */
  get isFailedGeneration(): boolean {
    const draft = this.activeDraft;
    if (!draft) return false;
    const ge = this.generationEvidence;
    if (ge && ge.readyForHumanReview === false) return true;
    if (this.isBlogCreate) return !this.blogCreateChange?.execution;
    return false;
  }

  /** Extracted purely for display — never trusted for anything executable (the backend independently re-parses the real content). */
  extractLinks(html: string): { href: string; anchor: string }[] {
    const links: { href: string; anchor: string }[] = [];
    const re = /<a\s+[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      links.push({ href: m[1], anchor: m[2] });
    }
    return links;
  }

  /** Approved for THIS exact active draft — never just "approved" in general. */
  get isApprovedForActiveDraft(): boolean {
    const rec = this.recommendation();
    const draft = this.activeDraft;
    if (!rec || !draft) return false;
    return rec.reviewStatus === 'approved' && rec.reviewedDraftId === draft.id && rec.reviewedDraftContentHash === draft.contentHash;
  }

  get approvalIsStale(): boolean {
    const rec = this.recommendation();
    const draft = this.activeDraft;
    if (!rec || !draft || !rec.reviewedDraftId) return false;
    return rec.reviewStatus === 'approved' && (rec.reviewedDraftId !== draft.id || rec.reviewedDraftContentHash !== draft.contentHash);
  }

  // ── Generate / regenerate ──
  generatePreview(): void {
    this.generateError.set('');
    this.generating.set(true);
    const body: { allowPreview: boolean; editorialFeedback?: string } = { allowPreview: true };
    const feedback = this.editorialFeedback.trim();
    if (feedback) body.editorialFeedback = feedback;
    this.http.post<{ data: ChangeDraft }>(`${this.base}/recommendations/${this.recId}/draft`, body).subscribe({
      next: () => {
        this.generating.set(false);
        this.preflight.set(null);
        this.loadDrafts(); // Never claim success before the API confirms — refresh from the server.
      },
      error: (e) => {
        this.generating.set(false);
        this.generateError.set(e?.error?.message || 'Failed to generate a preview');
      },
    });
  }

  // ── Exact-draft approval (Part E — never the draft-agnostic path when a specific preview is being reviewed) ──
  approveExactDraft(): void {
    const draft = this.activeDraft;
    if (!draft) return;
    const confirmed = confirm(
      'Approve THIS EXACT draft?\n\n' +
        `Draft ID: ${draft.id}\n` +
        `Content hash: ${draft.contentHash}\n\n` +
        'You are approving this exact version. Regenerating or changing the draft will require review again.',
    );
    if (!confirmed) return;

    this.approveError.set('');
    this.approving.set(true);
    this.http.post(`${this.base}/recommendations/${this.recId}/approve-draft`, { draftId: draft.id, reviewNote: this.approveNote.trim() || null }).subscribe({
      next: () => {
        this.approving.set(false);
        this.approveNote = '';
        this.loadAll(); // Never claim success before the API confirms — refresh from the server.
      },
      error: (e) => {
        this.approving.set(false);
        this.approveError.set(e?.error?.message || 'Failed to approve this draft');
      },
    });
  }

  private patchReview(reviewStatus: 'pending' | 'rejected' | 'needs_changes', reviewNote: string | null): void {
    this.reviewError.set('');
    this.reviewSubmitting.set(true);
    this.http.patch(`${this.base}/recommendations/${this.recId}/review`, { reviewStatus, reviewNote }).subscribe({
      next: () => {
        this.reviewSubmitting.set(false);
        this.reviewNote = '';
        this.loadAll();
      },
      error: (e) => {
        this.reviewSubmitting.set(false);
        this.reviewError.set(e?.error?.message || 'Failed to update review status');
      },
    });
  }

  reject(): void {
    const note = this.reviewNote.trim();
    if (!note) {
      this.reviewError.set('A note is required to reject.');
      return;
    }
    this.patchReview('rejected', note);
  }

  needsChanges(): void {
    const note = this.reviewNote.trim();
    if (!note) {
      this.reviewError.set('A note is required for "needs changes".');
      return;
    }
    this.patchReview('needs_changes', note);
  }

  keepPending(): void {
    if (!confirm('Reset this recommendation to Pending? This clears its review note and any exact-draft approval binding.')) return;
    this.patchReview('pending', null);
  }

  // ── Preflight (Part F) ──
  runPreflight(): void {
    const draft = this.activeDraft;
    if (!draft) return;
    this.preflightError.set('');
    this.preflighting.set(true);
    this.http.post<{ data: ChangeDraftPreflight }>(`${this.base}/change-drafts/${draft.id}/preflight`, {}).subscribe({
      next: (res) => {
        this.preflighting.set(false);
        this.preflight.set(res.data);
      },
      error: (e) => {
        this.preflighting.set(false);
        this.preflight.set(null);
        this.preflightError.set(e?.error?.message || 'Failed to run preflight');
      },
    });
  }

  riskLabel(level: 'low' | 'medium' | 'high'): string {
    return level === 'low' ? 'Low risk' : level === 'medium' ? 'Medium risk' : 'High risk';
  }

  checkStatusLabel(status: 'pass' | 'warn' | 'fail'): string {
    return status === 'pass' ? 'Pass' : status === 'warn' ? 'Warning' : 'Blocked';
  }

  // ── Execute (Part G) — the UI only ever triggers the existing backend
  // action; it never builds, deploys, or touches Docker/the filesystem
  // itself. For blog_create, execution creates a `pending` SeoChangePublication
  // record; the actual frontend build/deploy is a separate, host-level,
  // operator-run pipeline (ops/seo-publication-publisher.sh) with Docker
  // socket access this admin backend deliberately does not have — "Execute"
  // below reflects exactly that boundary rather than implying a button here
  // can also perform the deploy. ──
  get canExecute(): boolean {
    const draft = this.activeDraft;
    return !!draft && this.isApprovedForActiveDraft && !this.isFailedGeneration && this.preflight()?.executable === true && this.executions().length === 0;
  }

  executeDraft(): void {
    const draft = this.activeDraft;
    if (!draft) return;
    const preflight = this.preflight();
    const warnings = preflight?.warnings.length
      ? `\n\n${preflight.warnings.length} quality warning(s):\n` + preflight.warnings.map((w) => `  – ${w.message}`).join('\n')
      : '';
    const confirmed = confirm(
      'Execute this approved change now?\n\n' +
        `Draft: ${draft.id}\n` +
        `Last preflight: ${preflight?.executable ? 'executable' : 'not run / blocked'}${preflight ? `, ${this.riskLabel(preflight.riskLevel)}` : ''}` +
        warnings +
        '\n\nThe server re-checks every eligibility rule before writing, and this preflight result is advisory only.' +
        (this.isBlogCreate
          ? '\n\nFor a new article this creates the CMS Blog record and a pending publication request — the actual build/deploy to the live site is a separate, operator-run step, not performed by this button.'
          : ''),
    );
    if (!confirmed) return;

    this.executeError.set('');
    this.executing.set(true);
    this.http.post<{ data: ChangeExecution }>(`${this.base}/change-drafts/${draft.id}/execute`, {}).subscribe({
      next: () => {
        this.executing.set(false);
        this.preflight.set(null);
        this.loadExecutions(draft.id); // Never claim success before the API confirms — refresh from the server.
      },
      error: (e) => {
        this.executing.set(false);
        this.executeError.set(e?.error?.message || 'Failed to execute this change');
        this.preflight.set(null);
      },
    });
  }

  publicationStatusLabel(p: PublicationView): string {
    switch (p.status) {
      case 'pending':
        return 'Pending — waiting for the publication worker to claim and deploy it';
      case 'building':
        return 'Building — the deploy pipeline is currently running';
      case 'published':
        return 'Published — live (see verification below for content confirmation)';
      case 'failed':
        return `Failed${p.errorMessage ? `: ${p.errorMessage}` : ''}`;
      default:
        return p.status;
    }
  }

  // ── Verification (Part H) ──
  get canVerify(): boolean {
    const exec = this.latestExecution;
    return !!exec && exec.status === 'succeeded';
  }

  verifyLive(): void {
    const exec = this.latestExecution;
    if (!exec) return;
    this.verifyError.set('');
    this.verifying.set(true);
    this.http.post<{ data: ChangeVerification }>(`${this.base}/change-executions/${exec.id}/verify`, {}).subscribe({
      next: () => {
        this.verifying.set(false);
        this.loadVerifications(exec.id);
      },
      error: (e) => {
        this.verifying.set(false);
        this.verifyError.set(e?.error?.message || 'Failed to verify the live result');
      },
    });
  }

  verificationStatusLabel(status: 'verified' | 'mismatch' | 'fetch_failed'): string {
    return status === 'verified' ? 'Verified' : status === 'mismatch' ? 'Mismatch' : 'Fetch failed';
  }

  // ── Completion (Part H) ──
  get canComplete(): boolean {
    const exec = this.latestExecution;
    return !!exec && exec.status === 'succeeded' && this.latestVerification?.status === 'verified' && !this.latestCompletion;
  }

  completeExecution(): void {
    const exec = this.latestExecution;
    if (!exec) return;
    if (!confirm('Mark this verified change as completed? This records an immutable implementation record and cannot be undone.')) return;
    this.completeError.set('');
    this.completing.set(true);
    this.http.post<{ data: ChangeCompletion }>(`${this.base}/change-executions/${exec.id}/complete`, {}).subscribe({
      next: () => {
        this.completing.set(false);
        this.loadCompletions(exec.id);
      },
      error: (e) => {
        this.completing.set(false);
        this.completeError.set(e?.error?.message || 'Failed to mark this execution completed');
      },
    });
  }

  json(v: unknown): string {
    return JSON.stringify(v, null, 2);
  }
}
