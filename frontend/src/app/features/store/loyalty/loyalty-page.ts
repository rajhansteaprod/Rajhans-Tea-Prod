import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PromotionHttpService, LoyaltyAccount } from '../../../core/services/promotion.service';

@Component({
  selector: 'app-loyalty-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <h1 class="title">Loyalty Points</h1>

      @if (account()) {
        <div class="balance-card">
          <div class="balance-main">
            <span class="points">{{ account()!.balance }}</span>
            <span class="label">Points Available</span>
          </div>
          <div class="balance-stats">
            <div><span class="stat-val">{{ account()!.totalEarned }}</span><span class="stat-lbl">Earned</span></div>
            <div><span class="stat-val">{{ account()!.totalRedeemed }}</span><span class="stat-lbl">Redeemed</span></div>
          </div>
        </div>

        <div class="info-card">
          <p>Earn <strong>{{ account()!.earnRate }} point</strong> per ₹100 spent</p>
          <p>Redeem <strong>100 points = ₹{{ account()!.redeemRate }}</strong> discount</p>
        </div>

        <h2 class="section-title">History</h2>
        @if (account()!.transactions.length === 0) {
          <p class="empty">No transactions yet. Make a purchase to earn points!</p>
        } @else {
          <div class="txn-list">
            @for (t of account()!.transactions; track t._id) {
              <div class="txn-row">
                <div class="txn-type" [class.earn]="t.type === 'earn'" [class.redeem]="t.type === 'redeem'" [class.expire]="t.type === 'expire'">
                  {{ t.type === 'earn' ? '+' : t.type === 'redeem' ? '−' : '⏰' }}
                </div>
                <div class="txn-info">
                  <span class="txn-desc">{{ t.description }}</span>
                  <span class="txn-date">{{ t.createdAt | date:'dd MMM yyyy, h:mm a' }}</span>
                </div>
                <span class="txn-points" [class.earn]="t.points > 0" [class.redeem]="t.points < 0">
                  {{ t.points > 0 ? '+' : '' }}{{ t.points }}
                </span>
              </div>
            }
          </div>
        }
      } @else {
        <div class="loading"><div class="spinner"></div></div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:600px; margin:0 auto; padding: $space-xxl $space-lg; }
    .title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xl; }
    .balance-card { background:linear-gradient(135deg, $color-primary, $color-primary-hover); border-radius: $radius-xl; padding: $space-xxl; color: $color-text-inverse; margin-bottom: $space-lg; display:flex; justify-content:space-between; align-items:center; }
    .balance-main { display:flex; flex-direction:column; }
    .points { font-size:48px; font-weight: $font-weight-bold; }
    .label { font-size: $font-size-sm; opacity:.8; }
    .balance-stats { display:flex; gap: $space-xl; text-align:center; }
    .stat-val { display:block; font-size: $font-size-lg; font-weight: $font-weight-bold; }
    .stat-lbl { font-size: $font-size-xs; opacity:.7; }
    .info-card { padding: $space-md $space-lg; background: $color-bg-secondary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-xl;
      p { font-size: $font-size-sm; color: $color-text-secondary; margin: $space-xxs 0; }
    }
    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-md; }
    .empty { font-size: $font-size-sm; color: $color-text-tertiary; }
    .txn-list { display:flex; flex-direction:column; gap: $space-xs; }
    .txn-row { display:grid; grid-template-columns:36px 1fr auto; gap: $space-sm; align-items:center; padding: $space-sm $space-md; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-md; }
    .txn-type { width:36px; height:36px; border-radius: $radius-md; display:flex; align-items:center; justify-content:center; font-weight: $font-weight-bold; font-size: $font-size-md;
      &.earn { background:rgba(87,136,108,.1); color: $color-success; }
      &.redeem { background:rgba(204,88,3,.1); color: $color-primary; }
      &.expire { background:rgba(192,57,43,.08); color: $color-error; }
    }
    .txn-info { display:flex; flex-direction:column; gap:1px; }
    .txn-desc { font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-primary; }
    .txn-date { font-size: $font-size-xs; color: $color-text-tertiary; }
    .txn-points { font-size: $font-size-md; font-weight: $font-weight-bold;
      &.earn { color: $color-success; }
      &.redeem { color: $color-primary; }
    }
    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class LoyaltyPageComponent implements OnInit {
  private readonly promoService = inject(PromotionHttpService);
  readonly account = signal<LoyaltyAccount | null>(null);

  ngOnInit(): void {
    this.promoService.getLoyaltyAccount().subscribe({
      next: (res) => this.account.set(res.data),
    });
  }
}
