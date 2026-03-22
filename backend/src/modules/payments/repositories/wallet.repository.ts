import mongoose, { Types } from 'mongoose';
import { Wallet, IWalletDoc } from '../models/wallet.model';
import { WalletTransaction, IWalletTransactionDoc, WalletTxnSource } from '../models/wallet-transaction.model';
import { BadRequestError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class WalletRepository {
  async findOrCreateByUserId(userId: string): Promise<IWalletDoc> {
    let wallet = await Wallet.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!wallet) {
      wallet = await Wallet.create({ userId: new Types.ObjectId(userId) });
    }
    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.findOrCreateByUserId(userId);
    return wallet.balance;
  }

  /**
   * Atomic credit with MongoDB transaction.
   * Creates WalletTransaction with idempotencyKey (unique index prevents duplicates).
   */
  async creditWithTransaction(
    userId: string,
    amount: number,
    source: WalletTxnSource,
    referenceId: string | null,
    description: string,
    idempotencyKey: string,
  ): Promise<IWalletTransactionDoc> {
    // Check idempotency first (fast path — no transaction needed)
    const existing = await WalletTransaction.findOne({ idempotencyKey }).exec();
    if (existing) return existing;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const wallet = await Wallet.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $inc: { balance: amount } },
        { session, new: true, upsert: true },
      ).exec();

      const [txn] = await WalletTransaction.create(
        [
          {
            walletId: wallet!._id,
            userId: new Types.ObjectId(userId),
            type: 'credit',
            amount,
            balanceAfter: wallet!.balance,
            source,
            referenceId,
            description,
            idempotencyKey,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return txn;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /**
   * Atomic debit with balance check.
   * Uses { balance: { $gte: amount } } in the query to prevent overdraft atomically.
   */
  async debitWithTransaction(
    userId: string,
    amount: number,
    source: WalletTxnSource,
    referenceId: string | null,
    description: string,
    idempotencyKey: string,
  ): Promise<IWalletTransactionDoc> {
    const existing = await WalletTransaction.findOne({ idempotencyKey }).exec();
    if (existing) return existing;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const wallet = await Wallet.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { session, new: true },
      ).exec();

      if (!wallet) {
        throw new BadRequestError('Insufficient wallet balance');
      }

      const [txn] = await WalletTransaction.create(
        [
          {
            walletId: wallet._id,
            userId: new Types.ObjectId(userId),
            type: 'debit',
            amount,
            balanceAfter: wallet.balance,
            source,
            referenceId,
            description,
            idempotencyKey,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      return txn;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async getTransactionHistory(
    userId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{
    transactions: IWalletTransactionDoc[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [transactions, total] = await Promise.all([
      WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      WalletTransaction.countDocuments(filter).exec(),
    ]);
    return { transactions, meta: buildPaginationMeta(page, limit, total) };
  }
}
