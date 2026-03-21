import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface WalletInfo {
  _id: string;
  userId: string;
  balance: number;
  currency: string;
  isActive: boolean;
}

interface WalletTxn {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  source: string;
  description: string;
  createdAt: string;
}

interface UserItem {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

@Component({
  selector: 'app-admin-wallet-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wallet-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Wallet Management</h1>
          <p class="page-subtitle">View and manage user wallets</p>
        </div>
      </div>

      <!-- Search User -->
      <div class="search-section">
        <div class="search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input placeholder="Search by phone number..." [(ngModel)]="phoneQuery" (keyup.enter)="searchUser()" />
          <button class="btn-search" (click)="searchUser()">Search</button>
        </div>
      </div>

      @if (searchError()) {
        <div class="error-msg">{{ searchError() }}</div>
      }

      <!-- User Wallet Card -->
      @if (selectedUser() && walletData()) {
        <div class="wallet-card">
          <div class="wallet-header">
            <div class="user-info">
              <div class="user-avatar">{{ getInitials() }}</div>
              <div>
                <p class="user-name">{{ selectedUser()!.firstName || '' }} {{ selectedUser()!.lastName || '' }}</p>
                <p class="user-phone">{{ selectedUser()!.phone }} · {{ selectedUser()!.role }}</p>
              </div>
            </div>
            <div class="balance-block">
              <span class="balance-label">Balance</span>
              <span class="balance-value">₹{{ walletData()!.wallet.balance | number:'1.2-2' }}</span>
            </div>
          </div>

          <!-- Credit Form -->
          <div class="credit-section">
            <h3 class="section-label">Credit Wallet</h3>
            <div class="credit-form">
              <input type="number" [(ngModel)]="creditAmount" placeholder="Amount (₹)" min="1" max="100000" />
              <input type="text" [(ngModel)]="creditDescription" placeholder="Reason (e.g. Welcome bonus)" />
              <button class="btn-credit" [disabled]="!creditAmount || !creditDescription || crediting()" (click)="creditWallet()">
                @if (crediting()) { Processing... } @else { Credit ₹{{ creditAmount || 0 }} }
              </button>
            </div>
          </div>

          <!-- Transaction History -->
          <div class="txn-section">
            <h3 class="section-label">Transaction History</h3>
            @if (walletData()!.transactions.length === 0) {
              <p class="empty-msg">No transactions yet.</p>
            } @else {
              <div class="txn-list">
                @for (txn of walletData()!.transactions; track txn._id) {
                  <div class="txn-row">
                    <div class="txn-badge" [class.credit]="txn.type === 'credit'" [class.debit]="txn.type === 'debit'">
                      {{ txn.type === 'credit' ? '+' : '−' }}
                    </div>
                    <div class="txn-info">
                      <p class="txn-desc">{{ txn.description }}</p>
                      <p class="txn-meta">{{ txn.source }} · {{ txn.createdAt | date:'dd MMM yyyy, h:mm a' }}</p>
                    </div>
                    <div class="txn-amounts">
                      <span class="txn-amount" [class.credit]="txn.type === 'credit'" [class.debit]="txn.type === 'debit'">
                        {{ txn.type === 'credit' ? '+' : '−' }}₹{{ txn.amount | number:'1.2-2' }}
                      </span>
                      <span class="txn-balance">Bal: ₹{{ txn.balanceAfter | number:'1.2-2' }}</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .wallet-page { padding: $space-xl; }
    .page-header { margin-bottom: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0 0 $space-xxs; }
    .page-subtitle { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }

    .search-section { margin-bottom: $space-xl; }
    .search-bar {
      display: flex; align-items: center; gap: $space-sm;
      padding: $space-sm $space-md; background: $color-bg-tertiary; border: 1px solid $color-border;
      border-radius: $radius-lg; max-width: 500px;
      svg { color: $color-text-tertiary; flex-shrink: 0; }
      input {
        flex: 1; border: none; outline: none; font-size: $font-size-sm; background: transparent;
        color: $color-text-primary; font-family: $font-family;
        &::placeholder { color: $color-text-disabled; }
      }
    }
    .btn-search {
      padding: $space-xs $space-md; background: $color-primary; color: $color-text-inverse;
      border: none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold;
      cursor: pointer; white-space: nowrap; transition: all $transition-fast;
      &:hover { background: $color-primary-hover; }
    }

    .error-msg {
      padding: $space-sm $space-md; background: rgba(192, 57, 43, 0.08); color: $color-error;
      border-radius: $radius-md; font-size: $font-size-sm; margin-bottom: $space-lg;
    }

    .wallet-card {
      background: $color-bg-tertiary; border: 1px solid $color-border-light;
      border-radius: $radius-xl; overflow: hidden;
    }
    .wallet-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: $space-xl; background: $color-bg-secondary; border-bottom: 1px solid $color-border-light;
    }
    .user-info { display: flex; align-items: center; gap: $space-md; }
    .user-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: $color-primary-light; color: $color-primary;
      display: flex; align-items: center; justify-content: center;
      font-size: $font-size-md; font-weight: $font-weight-bold;
    }
    .user-name { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin: 0 0 2px; }
    .user-phone { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }

    .balance-block { text-align: right; }
    .balance-label { display: block; font-size: $font-size-xs; color: $color-text-tertiary; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .balance-value { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-success; }

    .section-label {
      font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary;
      text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 $space-md;
    }

    .credit-section { padding: $space-xl; border-bottom: 1px solid $color-border-light; }
    .credit-form {
      display: flex; gap: $space-sm;
      input {
        flex: 1; padding: $space-sm $space-md; border: 1px solid $color-border; border-radius: $radius-md;
        font-size: $font-size-sm; background: $color-bg-secondary; outline: none; font-family: $font-family;
        &:focus { border-color: $color-primary; box-shadow: $shadow-glow; }
      }
    }
    .btn-credit {
      padding: $space-sm $space-lg; background: $color-success; color: $color-text-inverse;
      border: none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold;
      cursor: pointer; white-space: nowrap; transition: all $transition-fast;
      &:hover:not(:disabled) { opacity: 0.9; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .txn-section { padding: $space-xl; }
    .empty-msg { font-size: $font-size-sm; color: $color-text-tertiary; margin: 0; }
    .txn-list { display: flex; flex-direction: column; gap: $space-xs; }
    .txn-row {
      display: grid; grid-template-columns: 32px 1fr auto; gap: $space-md; align-items: center;
      padding: $space-sm $space-md; background: $color-bg-secondary; border-radius: $radius-md;
    }
    .txn-badge {
      width: 32px; height: 32px; border-radius: $radius-md;
      display: flex; align-items: center; justify-content: center;
      font-size: $font-size-md; font-weight: $font-weight-bold;
      &.credit { background: rgba(87, 136, 108, 0.1); color: $color-success; }
      &.debit { background: rgba(192, 57, 43, 0.08); color: $color-error; }
    }
    .txn-info { min-width: 0; }
    .txn-desc { font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-primary; margin: 0 0 2px; }
    .txn-meta { font-size: $font-size-xs; color: $color-text-tertiary; margin: 0; }
    .txn-amounts { text-align: right; }
    .txn-amount {
      display: block; font-size: $font-size-sm; font-weight: $font-weight-bold;
      &.credit { color: $color-success; }
      &.debit { color: $color-error; }
    }
    .txn-balance { font-size: $font-size-xs; color: $color-text-tertiary; }
  `],
})
export class AdminWalletManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly selectedUser = signal<UserItem | null>(null);
  readonly walletData = signal<{ wallet: WalletInfo; transactions: WalletTxn[] } | null>(null);
  readonly searchError = signal<string | null>(null);
  readonly crediting = signal(false);

  phoneQuery = '';
  creditAmount: number | null = null;
  creditDescription = '';

  ngOnInit(): void {}

  searchUser(): void {
    if (!this.phoneQuery.trim()) return;
    this.searchError.set(null);
    this.selectedUser.set(null);
    this.walletData.set(null);

    // First find user by phone
    this.http.get<{ data: UserItem[]; meta: any }>(`${this.api}/admin/users?search=${encodeURIComponent(this.phoneQuery)}&limit=1`).subscribe({
      next: (res) => {
        if (res.data.length === 0) {
          this.searchError.set('No user found with that phone number');
          return;
        }
        const user = res.data[0];
        this.selectedUser.set(user);
        this.loadWallet(user._id);
      },
      error: () => this.searchError.set('Failed to search user'),
    });
  }

  loadWallet(userId: string): void {
    this.http.get<{ data: { wallet: WalletInfo; transactions: WalletTxn[] } }>(`${this.api}/admin/wallets/${userId}`).subscribe({
      next: (res) => this.walletData.set(res.data),
      error: () => this.searchError.set('Failed to load wallet'),
    });
  }

  creditWallet(): void {
    if (!this.selectedUser() || !this.creditAmount || !this.creditDescription) return;
    this.crediting.set(true);

    this.http.post(`${this.api}/wallet/credit`, {
      userId: this.selectedUser()!._id,
      amount: this.creditAmount,
      description: this.creditDescription,
    }).subscribe({
      next: () => {
        this.crediting.set(false);
        this.creditAmount = null;
        this.creditDescription = '';
        this.loadWallet(this.selectedUser()!._id);
      },
      error: () => this.crediting.set(false),
    });
  }

  getInitials(): string {
    const u = this.selectedUser();
    if (u?.firstName) return (u.firstName[0] + (u.lastName?.[0] || '')).toUpperCase();
    return u?.phone?.slice(-2) || '?';
  }
}
