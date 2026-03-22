import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { environment } from '../../../../environments/environment';

interface WalletTransaction {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  source: string;
  description: string;
  referenceId: string | null;
  balanceAfter: number;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-wallet-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wallet-page.html',
  styleUrls: ['./wallet-page.scss'],
})
export class WalletPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly titleService = inject(Title);

  readonly balance = signal(0);
  readonly transactions = signal<WalletTransaction[]>([]);
  readonly meta = signal<PaginationMeta | null>(null);
  readonly loading = signal(true);
  readonly currentPage = signal(1);

  constructor() {
    this.titleService.setTitle('Wallet — Rajhans Tea');
  }

  ngOnInit(): void {
    this.loadBalance();
    this.loadTransactions();
  }

  private loadBalance(): void {
    this.http
      .get<{ success: boolean; data: { balance: number } }>(`${this.api}/wallet`)
      .subscribe({
        next: (res) => this.balance.set(res.data.balance),
      });
  }

  loadTransactions(): void {
    this.loading.set(true);
    this.http
      .get<{ success: boolean; data: WalletTransaction[]; meta: PaginationMeta }>(
        `${this.api}/wallet/transactions?page=${this.currentPage()}&limit=15`,
      )
      .subscribe({
        next: (res) => {
          this.transactions.set(res.data);
          this.meta.set(res.meta);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.loadTransactions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
