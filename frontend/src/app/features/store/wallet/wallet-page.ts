import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentStore } from '../../../core/services/payment.store';

@Component({
  selector: 'app-wallet-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Wallet</h1>
        <a routerLink="/" class="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </a>
      </div>

      <!-- Balance Card -->
      <div class="balance-card">
        <div class="balance-label">Available Balance</div>
        <div class="balance-amount">
          <span class="currency">₹</span>{{ store.walletBalance() | number:'1.2-2' }}
        </div>
      </div>

      <!-- Transaction History -->
      <div class="section">
        <h2 class="section-title">Transaction History</h2>

        @if (store.walletLoading()) {
          <div class="loading"><div class="spinner"></div></div>
        } @else if (store.walletTransactions().length === 0) {
          <div class="empty-state">
            <p>No transactions yet.</p>
          </div>
        } @else {
          <div class="txn-list">
            @for (txn of store.walletTransactions(); track txn._id) {
              <div class="txn-item">
                <div class="txn-icon" [class.credit]="txn.type === 'credit'" [class.debit]="txn.type === 'debit'">
                  @if (txn.type === 'credit') {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  } @else {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  }
                </div>
                <div class="txn-info">
                  <p class="txn-desc">{{ txn.description }}</p>
                  <p class="txn-meta">{{ txn.source | titlecase }} · {{ txn.createdAt | date:'dd MMM yyyy, h:mm a' }}</p>
                </div>
                <div class="txn-amount" [class.credit]="txn.type === 'credit'" [class.debit]="txn.type === 'debit'">
                  {{ txn.type === 'credit' ? '+' : '−' }}₹{{ txn.amount | number:'1.2-2' }}
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .page { max-width: 720px; margin: 0 auto; padding: $space-xxl $space-lg; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: $space-xl;
    }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0; }
    .btn-back {
      display: inline-flex; align-items: center; gap: $space-xs;
      font-size: $font-size-sm; color: $color-text-secondary; text-decoration: none;
      padding: $space-xs $space-md; border: 1px solid $color-border; border-radius: $radius-md;
      transition: all $transition-fast;
      &:hover { color: $color-primary; border-color: $color-primary; }
    }

    .balance-card {
      background: linear-gradient(135deg, $color-primary, $color-primary-hover);
      border-radius: $radius-xl; padding: $space-xxl $space-xl;
      color: $color-text-inverse; margin-bottom: $space-xxl;
    }
    .balance-label { font-size: $font-size-sm; opacity: 0.8; margin-bottom: $space-xs; text-transform: uppercase; letter-spacing: 0.08em; }
    .balance-amount { font-size: 48px; font-weight: $font-weight-bold; letter-spacing: $letter-spacing-tight; }
    .currency { font-size: 28px; font-weight: $font-weight-medium; opacity: 0.7; margin-right: 4px; }

    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin: 0 0 $space-lg; }

    .loading { display: flex; justify-content: center; padding: $space-xxl; }
    .spinner { width: 28px; height: 28px; border: 2px solid $color-border; border-top-color: $color-primary; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state { text-align: center; color: $color-text-tertiary; padding: $space-xxl; font-size: $font-size-sm; p { margin: 0; } }

    .txn-list { display: flex; flex-direction: column; gap: $space-xs; }
    .txn-item {
      display: grid; grid-template-columns: 40px 1fr auto; gap: $space-md; align-items: center;
      padding: $space-md; background: $color-bg-tertiary; border: 1px solid $color-border-light;
      border-radius: $radius-lg; transition: border-color $transition-fast;
      &:hover { border-color: $color-border; }
    }
    .txn-icon {
      width: 40px; height: 40px; border-radius: $radius-md;
      display: flex; align-items: center; justify-content: center;
      &.credit { background: rgba(87, 136, 108, 0.1); color: $color-success; }
      &.debit { background: rgba(192, 57, 43, 0.08); color: $color-error; }
    }
    .txn-info { min-width: 0; }
    .txn-desc { font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-primary; margin: 0 0 $space-xxs; }
    .txn-meta { font-size: $font-size-xs; color: $color-text-tertiary; margin: 0; }
    .txn-amount {
      font-size: $font-size-md; font-weight: $font-weight-bold; white-space: nowrap;
      &.credit { color: $color-success; }
      &.debit { color: $color-error; }
    }
  `],
})
export class WalletPageComponent implements OnInit {
  readonly store = inject(PaymentStore);

  ngOnInit(): void {
    this.store.loadWalletBalance();
    this.store.loadWalletTransactions();
  }
}
