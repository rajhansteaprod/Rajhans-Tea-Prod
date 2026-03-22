import { WalletRepository } from '../repositories/wallet.repository';
import { WalletTxnSource } from '../models/wallet-transaction.model';

export class WalletService {
  private repo = new WalletRepository();

  async getOrCreateWallet(userId: string) {
    return this.repo.findOrCreateByUserId(userId);
  }

  async getBalance(userId: string): Promise<number> {
    return this.repo.getBalance(userId);
  }

  async credit(
    userId: string,
    amount: number,
    source: WalletTxnSource,
    referenceId: string | null,
    description: string,
    idempotencyKey: string,
  ) {
    return this.repo.creditWithTransaction(
      userId,
      amount,
      source,
      referenceId,
      description,
      idempotencyKey,
    );
  }

  async debit(
    userId: string,
    amount: number,
    source: WalletTxnSource,
    referenceId: string | null,
    description: string,
    idempotencyKey: string,
  ) {
    return this.repo.debitWithTransaction(
      userId,
      amount,
      source,
      referenceId,
      description,
      idempotencyKey,
    );
  }

  async getHistory(userId: string, query: { page?: number; limit?: number } = {}) {
    return this.repo.getTransactionHistory(userId, query);
  }
}
