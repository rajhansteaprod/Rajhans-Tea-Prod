import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface WalletInfo {
  balance: number;
  totalCredited: number;
  totalDebited: number;
  transactions: { _id: string; type: string; amount: number; source: string; description: string; createdAt: string }[];
}

@Component({
  selector: 'app-wallet-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wallet-management.html',
  styleUrls: ['./wallet-management.scss'],
})
export class WalletManagementComponent {
  private api = `${environment.apiUrl}`;

  // Lookup
  lookupUserId = '';
  wallet = signal<WalletInfo | null>(null);
  lookupLoading = signal(false);
  lookupError = signal('');

  // Credit
  creditUserId = '';
  creditAmount = 0;
  creditDescription = '';
  crediting = signal(false);
  creditMessage = signal('');

  constructor(private http: HttpClient) {}

  lookupWallet(): void {
    if (!this.lookupUserId.trim()) return;
    this.lookupLoading.set(true);
    this.lookupError.set('');
    this.wallet.set(null);

    this.http.get<{ data: WalletInfo }>(`${this.api}/admin/wallets/${this.lookupUserId.trim()}`).subscribe({
      next: (res) => {
        this.wallet.set(res.data);
        this.lookupLoading.set(false);
      },
      error: (err) => {
        this.lookupError.set(err?.error?.message || 'User or wallet not found');
        this.lookupLoading.set(false);
      },
    });
  }

  creditWallet(): void {
    if (!this.creditUserId.trim() || this.creditAmount <= 0) return;
    this.crediting.set(true);
    this.creditMessage.set('');

    this.http.post<{ data: any }>(`${this.api}/wallet/credit`, {
      userId: this.creditUserId.trim(),
      amount: this.creditAmount,
      description: this.creditDescription || 'Admin credit',
    }).subscribe({
      next: () => {
        this.creditMessage.set(`₹${this.creditAmount} credited successfully`);
        this.crediting.set(false);
        this.creditAmount = 0;
        this.creditDescription = '';
      },
      error: (err) => {
        this.creditMessage.set(err?.error?.message || 'Failed to credit wallet');
        this.crediting.set(false);
      },
    });
  }
}
