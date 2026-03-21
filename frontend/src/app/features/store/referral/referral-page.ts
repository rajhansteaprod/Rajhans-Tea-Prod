import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PromotionHttpService, ReferralInfo } from '../../../core/services/promotion.service';

@Component({
  selector: 'app-referral-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1 class="title">Refer & Earn</h1>

      @if (info()) {
        <div class="code-card">
          <p class="code-label">Your Referral Code</p>
          <div class="code-display">
            <span class="code">{{ info()!.code }}</span>
            <button class="btn-copy" (click)="copyCode()">{{ copied() ? '✓ Copied' : 'Copy' }}</button>
          </div>
          <p class="code-sub">Share this code with friends. Both of you get rewarded!</p>
        </div>

        <div class="stats-grid">
          <div class="stat"><span class="stat-val">{{ info()!.total }}</span><span class="stat-lbl">Total Referrals</span></div>
          <div class="stat"><span class="stat-val">{{ info()!.completed }}</span><span class="stat-lbl">Completed</span></div>
          <div class="stat"><span class="stat-val">{{ info()!.pending }}</span><span class="stat-lbl">Pending</span></div>
        </div>

        <div class="how-it-works">
          <h2>How it works</h2>
          <div class="steps">
            <div class="step"><span class="step-num">1</span><span>Share your referral code</span></div>
            <div class="step"><span class="step-num">2</span><span>Friend signs up & gets a welcome coupon</span></div>
            <div class="step"><span class="step-num">3</span><span>Friend makes first purchase</span></div>
            <div class="step"><span class="step-num">4</span><span>You earn loyalty points or wallet credit!</span></div>
          </div>
        </div>
      } @else {
        <div class="loading"><div class="spinner"></div></div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:600px; margin:0 auto; padding: $space-xxl $space-lg; }
    .title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xl; }
    .code-card { background: $color-bg-tertiary; border:2px solid $color-primary; border-radius: $radius-xl; padding: $space-xxl; text-align:center; margin-bottom: $space-xl; }
    .code-label { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; letter-spacing:.08em; margin:0 0 $space-sm; }
    .code-display { display:flex; align-items:center; justify-content:center; gap: $space-md; margin-bottom: $space-sm; }
    .code { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-primary; font-family:monospace; letter-spacing:.1em; }
    .btn-copy { padding: $space-xs $space-md; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; &:hover { background: $color-primary-hover; } }
    .code-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    .stats-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-md; margin-bottom: $space-xxl; }
    .stat { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; text-align:center; }
    .stat-val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .stat-lbl { font-size: $font-size-xs; color: $color-text-tertiary; }
    .how-it-works { h2 { font-size: $font-size-lg; font-weight: $font-weight-semibold; margin:0 0 $space-lg; } }
    .steps { display:flex; flex-direction:column; gap: $space-sm; }
    .step { display:flex; align-items:center; gap: $space-md; padding: $space-md; background: $color-bg-secondary; border-radius: $radius-md; font-size: $font-size-sm; color: $color-text-primary; }
    .step-num { width:28px; height:28px; border-radius:50%; background: $color-primary; color: $color-text-inverse; display:flex; align-items:center; justify-content:center; font-size: $font-size-sm; font-weight: $font-weight-bold; flex-shrink:0; }
    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class ReferralPageComponent implements OnInit {
  private readonly promoService = inject(PromotionHttpService);
  readonly info = signal<ReferralInfo | null>(null);
  readonly copied = signal(false);

  ngOnInit(): void {
    this.promoService.getReferralInfo().subscribe({
      next: (res) => this.info.set(res.data),
    });
  }

  copyCode(): void {
    if (this.info()?.code) {
      navigator.clipboard.writeText(this.info()!.code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }
}
