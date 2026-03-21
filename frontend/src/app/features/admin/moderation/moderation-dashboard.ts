import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewStore } from '../../../core/services/review.store';

type Tab = 'reviews' | 'questions' | 'reported';

@Component({
  selector: 'app-moderation-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Content Moderation</h1>
        <p class="page-sub">Reviews, Q&A, and reported content</p>
      </div>

      <!-- Analytics -->
      @if (analytics()) {
        <div class="stats-grid">
          <div class="stat"><span class="val">{{ analytics().totalApproved }}</span><span class="lbl">Approved</span></div>
          <div class="stat warn"><span class="val">{{ analytics().pendingCount }}</span><span class="lbl">Pending</span></div>
          <div class="stat danger"><span class="val">{{ analytics().reportedCount }}</span><span class="lbl">Reported</span></div>
          <div class="stat"><span class="val">{{ analytics().overallAvgRating | number:'1.1-1' }} ★</span><span class="lbl">Avg Rating</span></div>
        </div>
      }

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'reviews'" (click)="switchTab('reviews')">Pending Reviews</button>
        <button class="tab" [class.active]="activeTab() === 'questions'" (click)="switchTab('questions')">Pending Questions</button>
        <button class="tab" [class.active]="activeTab() === 'reported'" (click)="switchTab('reported')">Reported</button>
      </div>

      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (items().length === 0) {
        <div class="empty">No items to moderate.</div>
      } @else {
        <div class="mod-list">
          @for (item of items(); track item._id) {
            <div class="mod-card">
              <div class="mod-header">
                <div>
                  <span class="mod-user">{{ item.userId?.firstName || item.userId?.phone || 'User' }}</span>
                  <span class="mod-product">on {{ item.productId?.name || 'Product' }}</span>
                </div>
                <span class="mod-date">{{ item.createdAt | date:'dd MMM yyyy' }}</span>
              </div>

              @if (activeTab() !== 'questions') {
                <div class="mod-rating">
                  @for (s of [1,2,3,4,5]; track s) {
                    <span class="star" [class.filled]="s <= item.rating">★</span>
                  }
                  @if (item.isVerifiedPurchase) {
                    <span class="verified-badge">Verified Purchase</span>
                  }
                </div>
                <p class="mod-title">{{ item.title }}</p>
              }

              <p class="mod-body">{{ item.body || item.questionText }}</p>

              @if (item.reportCount > 0) {
                <p class="report-count">⚠ {{ item.reportCount }} reports</p>
              }

              <div class="mod-actions">
                @if (activeTab() === 'reported' || activeTab() === 'reviews') {
                  <button class="btn-approve" (click)="approve(item._id)">Approve</button>
                  <button class="btn-reject" (click)="openReject(item._id)">Reject</button>
                  <button class="btn-sm" (click)="openReply(item._id)">Reply</button>
                  <button class="btn-sm" (click)="pin(item._id)">{{ item.isPinned ? 'Unpin' : 'Pin' }}</button>
                } @else {
                  <button class="btn-approve" (click)="approveQuestion(item._id)">Approve</button>
                  <button class="btn-reject" (click)="rejectQuestion(item._id)">Reject</button>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Reject Modal -->
      @if (rejectId()) {
        <div class="backdrop" (click)="rejectId.set(null)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Reject Review</h2><button (click)="rejectId.set(null)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Reason</label><input [(ngModel)]="rejectReason" placeholder="Reason for rejection" /></div>
            <div class="modal-actions">
              <button (click)="rejectId.set(null)">Cancel</button>
              <button class="btn-danger" [disabled]="!rejectReason" (click)="confirmReject()">Reject</button>
            </div>
          </div>
        </div>
      }

      <!-- Reply Modal -->
      @if (replyId()) {
        <div class="backdrop" (click)="replyId.set(null)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Admin Reply</h2><button (click)="replyId.set(null)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Reply</label><textarea [(ngModel)]="replyBody" rows="3" placeholder="Your reply..."></textarea></div>
            <div class="modal-actions">
              <button (click)="replyId.set(null)">Cancel</button>
              <button class="btn-save" [disabled]="!replyBody" (click)="confirmReply()">Send Reply</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .stats-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center;
      &.warn { border-color: rgba(204,88,3,.3); }
      &.danger { border-color: rgba(192,57,43,.3); }
    }
    .val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; .warn & { color: $color-warning; } .danger & { color: $color-error; } }
    .lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }

    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px;
      &.active { color: $color-primary; border-bottom-color: $color-primary; }
    }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }

    .mod-list { display:flex; flex-direction:column; gap: $space-md; }
    .mod-card { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; }
    .mod-header { display:flex; justify-content:space-between; margin-bottom: $space-sm; }
    .mod-user { font-weight: $font-weight-semibold; color: $color-text-primary; }
    .mod-product { font-size: $font-size-sm; color: $color-text-tertiary; margin-left: $space-xs; }
    .mod-date { font-size: $font-size-xs; color: $color-text-tertiary; }
    .mod-rating { margin-bottom: $space-xs; display:flex; align-items:center; gap: $space-xs; }
    .star { color: $color-border; font-size: $font-size-md; &.filled { color: #F59E0B; } }
    .verified-badge { font-size:10px; font-weight: $font-weight-bold; color: $color-success; background:rgba(87,136,108,.1); padding:1px $space-xs; border-radius: $radius-full; }
    .mod-title { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .mod-body { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-sm; line-height: $line-height-relaxed; }
    .report-count { font-size: $font-size-xs; color: $color-error; margin:0 0 $space-sm; }
    .mod-actions { display:flex; gap: $space-sm; }
    .btn-approve { padding: $space-xs $space-md; background: $color-success; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-xs; font-weight: $font-weight-semibold; cursor:pointer; }
    .btn-reject { padding: $space-xs $space-md; background: $color-error; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-xs; font-weight: $font-weight-semibold; cursor:pointer; }
    .btn-sm { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &:hover { border-color: $color-primary; color: $color-primary; } }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:450px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, textarea { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; resize:vertical; &:focus { border-color: $color-primary; } }
    }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-danger { background: $color-error !important; color: $color-text-inverse !important; border:none !important; &:disabled { opacity:.5; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; &:disabled { opacity:.5; } }
  `],
})
export class ModerationDashboardComponent implements OnInit {
  private readonly reviewStore = inject(ReviewStore);

  readonly activeTab = signal<Tab>('reviews');
  readonly items = signal<any[]>([]);
  readonly loading = signal(false);
  readonly analytics = signal<any>(null);
  readonly rejectId = signal<string | null>(null);
  readonly replyId = signal<string | null>(null);
  rejectReason = '';
  replyBody = '';

  ngOnInit(): void {
    this.loadAnalytics();
    this.loadItems();
  }

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.loadItems();
  }

  loadAnalytics(): void {
    this.reviewStore.getAnalytics().subscribe({ next: (res) => this.analytics.set(res.data) });
  }

  loadItems(): void {
    this.loading.set(true);
    const tab = this.activeTab();
    if (tab === 'reported') {
      this.reviewStore.getReported().subscribe({ next: (res) => { this.items.set(res.data); this.loading.set(false); }, error: () => this.loading.set(false) });
    } else {
      this.reviewStore.getModeration(tab === 'questions' ? 'questions' : 'reviews').subscribe({ next: (res) => { this.items.set(res.data); this.loading.set(false); }, error: () => this.loading.set(false) });
    }
  }

  approve(id: string): void { this.reviewStore.approveReview(id).subscribe({ next: () => { this.loadItems(); this.loadAnalytics(); } }); }
  approveQuestion(id: string): void { this.reviewStore.approveReview(id).subscribe({ next: () => this.loadItems() }); }
  rejectQuestion(id: string): void { this.reviewStore.rejectReview(id, 'Rejected by admin').subscribe({ next: () => this.loadItems() }); }
  pin(id: string): void { this.reviewStore.pinReview(id).subscribe({ next: () => this.loadItems() }); }

  openReject(id: string): void { this.rejectId.set(id); this.rejectReason = ''; }
  confirmReject(): void {
    if (!this.rejectId() || !this.rejectReason) return;
    this.reviewStore.rejectReview(this.rejectId()!, this.rejectReason).subscribe({ next: () => { this.rejectId.set(null); this.loadItems(); this.loadAnalytics(); } });
  }

  openReply(id: string): void { this.replyId.set(id); this.replyBody = ''; }
  confirmReply(): void {
    if (!this.replyId() || !this.replyBody) return;
    this.reviewStore.replyToReview(this.replyId()!, this.replyBody).subscribe({ next: () => { this.replyId.set(null); this.loadItems(); } });
  }
}
