import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import {
  AdminReview,
  AdminReviewProduct,
  AdminReviewUser,
  ModerationStatus,
  PaginationMeta,
  ReviewAnalytics,
  ReviewStore,
} from '../../../core/services/review.store';

/** 'reported' is a separate endpoint, the rest map to the moderation status filter. */
type TabKey = ModerationStatus | 'reported';

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'reported', label: 'Reported' },
  { key: 'all', label: 'All' },
];

const PAGE_SIZE = 20;

@Component({
  selector: 'app-review-moderation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './review-moderation.html',
  styleUrls: ['./review-moderation.scss'],
})
export class ReviewModerationComponent implements OnInit {
  private readonly reviews = inject(ReviewStore);
  private readonly apiOrigin = new URL(environment.apiUrl).origin;

  readonly tabs = TABS;
  readonly stars = [1, 2, 3, 4, 5];

  readonly activeTab = signal<TabKey>('pending');
  readonly list = signal<AdminReview[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly analytics = signal<ReviewAnalytics | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');

  /** Rating filter applied client-side to the loaded page (0 = no filter). */
  readonly ratingFilter = signal(0);

  /** Ids currently mid-request — disables that row's action buttons. */
  readonly busyIds = signal<Set<string>>(new Set());

  // Modal state
  readonly rejectTarget = signal<AdminReview | null>(null);
  readonly rejectReason = signal('');
  readonly replyTarget = signal<AdminReview | null>(null);
  readonly replyBody = signal('');
  readonly modalError = signal('');
  readonly modalSaving = signal(false);
  readonly lightboxUrl = signal('');

  readonly visibleList = computed(() => {
    const rating = this.ratingFilter();
    return rating ? this.list().filter((r) => r.rating === rating) : this.list();
  });

  ngOnInit(): void {
    this.loadAnalytics();
    this.load(1);
  }

  // ── Data ────────────────────────────────────────────────────────────────

  private loadAnalytics(): void {
    this.reviews.getAnalytics().subscribe({
      next: (res) => this.analytics.set(res.data),
      error: () => this.analytics.set(null),
    });
  }

  load(page = 1): void {
    this.loading.set(true);
    this.loadError.set('');
    const tab = this.activeTab();
    const request =
      tab === 'reported'
        ? this.reviews.getReported(page, PAGE_SIZE)
        : this.reviews.getReviewModeration(tab, page, PAGE_SIZE);

    request.subscribe({
      next: (res) => {
        const rows = res.data ?? [];
        // Approving/deleting the last row on a trailing page empties it — step back
        // so the admin isn't left staring at a blank page. Converges at page 1.
        if (rows.length === 0 && page > 1) {
          this.load(page - 1);
          return;
        }
        this.list.set(rows);
        this.meta.set(res.meta ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.list.set([]);
        this.meta.set(null);
        this.loadError.set(err?.error?.message || 'Failed to load reviews.');
        this.loading.set(false);
      },
    });
  }

  selectTab(key: TabKey): void {
    if (this.activeTab() === key) return;
    this.activeTab.set(key);
    this.ratingFilter.set(0);
    this.load(1);
  }

  setRatingFilter(value: number): void {
    this.ratingFilter.set(this.ratingFilter() === value ? 0 : value);
  }

  goToPage(page: number): void {
    const m = this.meta();
    if (!m || page < 1 || page > m.totalPages || page === m.page) return;
    this.load(page);
  }

  /** Reload the current page and the stat cards after any state change. */
  private refresh(): void {
    this.loadAnalytics();
    this.load(this.meta()?.page ?? 1);
  }

  // ── Row actions ─────────────────────────────────────────────────────────

  isBusy(id: string): boolean {
    return this.busyIds().has(id);
  }

  private setBusy(id: string, busy: boolean): void {
    this.busyIds.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  approve(review: AdminReview): void {
    if (this.isBusy(review._id)) return;
    this.setBusy(review._id, true);
    this.reviews.approveReview(review._id).subscribe({
      next: () => {
        this.setBusy(review._id, false);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(review._id, false);
        alert(err?.error?.message ?? 'Failed to approve review');
      },
    });
  }

  togglePin(review: AdminReview): void {
    if (this.isBusy(review._id)) return;
    this.setBusy(review._id, true);
    this.reviews.pinReview(review._id).subscribe({
      next: () => {
        this.setBusy(review._id, false);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(review._id, false);
        alert(err?.error?.message ?? 'Failed to update pin');
      },
    });
  }

  remove(review: AdminReview): void {
    if (this.isBusy(review._id)) return;
    if (!confirm('Delete this review permanently? This cannot be undone.')) return;
    this.setBusy(review._id, true);
    this.reviews.adminDeleteReview(review._id).subscribe({
      next: () => {
        this.setBusy(review._id, false);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(review._id, false);
        alert(err?.error?.message ?? 'Failed to delete review');
      },
    });
  }

  // ── Reject modal ────────────────────────────────────────────────────────

  openReject(review: AdminReview): void {
    this.rejectTarget.set(review);
    this.rejectReason.set('');
    this.modalError.set('');
  }

  closeReject(): void {
    this.rejectTarget.set(null);
    this.modalError.set('');
  }

  confirmReject(): void {
    const review = this.rejectTarget();
    if (!review) return;
    const reason = this.rejectReason().trim();
    if (!reason) {
      this.modalError.set('A rejection reason is required.');
      return;
    }
    this.modalSaving.set(true);
    this.modalError.set('');
    this.reviews.rejectReview(review._id, reason).subscribe({
      next: () => {
        this.modalSaving.set(false);
        this.closeReject();
        this.refresh();
      },
      error: (err) => {
        this.modalSaving.set(false);
        this.modalError.set(err?.error?.message ?? 'Failed to reject review');
      },
    });
  }

  // ── Reply modal ─────────────────────────────────────────────────────────

  openReply(review: AdminReview): void {
    this.replyTarget.set(review);
    this.replyBody.set(review.adminReply?.body ?? '');
    this.modalError.set('');
  }

  closeReply(): void {
    this.replyTarget.set(null);
    this.modalError.set('');
  }

  confirmReply(): void {
    const review = this.replyTarget();
    if (!review) return;
    const body = this.replyBody().trim();
    if (!body) {
      this.modalError.set('Reply cannot be empty.');
      return;
    }
    this.modalSaving.set(true);
    this.modalError.set('');
    this.reviews.replyToReview(review._id, body).subscribe({
      next: () => {
        this.modalSaving.set(false);
        this.closeReply();
        this.refresh();
      },
      error: (err) => {
        this.modalSaving.set(false);
        this.modalError.set(err?.error?.message ?? 'Failed to save reply');
      },
    });
  }

  // ── Display helpers ─────────────────────────────────────────────────────

  /** Uploads are served by the API host, not the dev server. */
  imgSrc(url: string): string {
    if (!url) return '';
    return url.startsWith('http') ? url : `${this.apiOrigin}${url}`;
  }

  private asProduct(review: AdminReview): AdminReviewProduct | null {
    const p = review.productId;
    return p && typeof p === 'object' ? p : null;
  }

  private asUser(review: AdminReview): AdminReviewUser | null {
    const u = review.userId;
    return u && typeof u === 'object' ? u : null;
  }

  productName(review: AdminReview): string {
    return this.asProduct(review)?.name ?? 'Product unavailable';
  }

  productThumb(review: AdminReview): string {
    const product = this.asProduct(review);
    const url = product?.primaryImage || product?.images?.[0];
    return url ? this.imgSrc(url) : '';
  }

  productLink(review: AdminReview): string | null {
    const slug = this.asProduct(review)?.slug;
    return slug ? `/product/${slug}` : null;
  }

  /** Anonymous token reviews carry reviewerName; account reviews carry a user. */
  reviewerName(review: AdminReview): string {
    if (review.reviewerName?.trim()) return review.reviewerName.trim();
    const user = this.asUser(review);
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (user?.phone) return user.phone;
    return 'Anonymous';
  }

  reviewerContact(review: AdminReview): string {
    return this.asUser(review)?.phone ?? '';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  tabCount(key: TabKey): number | null {
    const a = this.analytics();
    if (!a) return null;
    if (key === 'pending') return a.pendingCount;
    if (key === 'reported') return a.reportedCount;
    if (key === 'approved') return a.totalApproved;
    return null;
  }

  openLightbox(url: string): void {
    this.lightboxUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxUrl.set('');
  }
}
