import mongoose, { Types } from 'mongoose';
import { LoyaltyAccount, ILoyaltyAccountDoc } from '../models/loyalty-account.model';
import { LoyaltyTransaction, ILoyaltyTransactionDoc } from '../models/loyalty-transaction.model';
import { LoyaltySettings, ILoyaltySettingsDoc } from '../models/loyalty-settings.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class LoyaltyRepository {
  // ─── Settings (singleton) ─────────────────────────────────────────────────

  async getSettings(): Promise<ILoyaltySettingsDoc> {
    let settings = await LoyaltySettings.findOne().exec();
    if (!settings) {
      settings = await LoyaltySettings.create({});
    }
    return settings;
  }

  async updateSettings(data: Partial<ILoyaltySettingsDoc>): Promise<ILoyaltySettingsDoc> {
    return LoyaltySettings.findOneAndUpdate(
      {},
      { $set: data },
      { new: true, upsert: true },
    ).exec() as Promise<ILoyaltySettingsDoc>;
  }

  // ─── Account ──────────────────────────────────────────────────────────────

  async findOrCreateAccount(userId: string): Promise<ILoyaltyAccountDoc> {
    let account = await LoyaltyAccount.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!account) {
      account = await LoyaltyAccount.create({ userId: new Types.ObjectId(userId) });
    }
    return account;
  }

  async getBalance(userId: string): Promise<number> {
    const account = await this.findOrCreateAccount(userId);
    return account.balance;
  }

  // ─── Atomic earn/redeem with transaction ──────────────────────────────────

  async earnPoints(
    userId: string,
    points: number,
    source: string,
    referenceId: string | null,
    description: string,
    expiresAt: Date | null,
    idempotencyKey: string,
  ): Promise<ILoyaltyTransactionDoc> {
    const existing = await LoyaltyTransaction.findOne({ idempotencyKey }).exec();
    if (existing) return existing;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const account = await LoyaltyAccount.findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $inc: { balance: points, totalEarned: points } },
        { session, new: true, upsert: true },
      ).exec();

      const [txn] = await LoyaltyTransaction.create(
        [
          {
            userId: new Types.ObjectId(userId),
            type: 'earn',
            points,
            balanceAfter: account!.balance,
            source,
            referenceId,
            description,
            expiresAt,
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

  async redeemPoints(
    userId: string,
    points: number,
    referenceId: string | null,
    description: string,
    idempotencyKey: string,
  ): Promise<ILoyaltyTransactionDoc> {
    const existing = await LoyaltyTransaction.findOne({ idempotencyKey }).exec();
    if (existing) return existing;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const account = await LoyaltyAccount.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), balance: { $gte: points } },
        { $inc: { balance: -points, totalRedeemed: points } },
        { session, new: true },
      ).exec();

      if (!account) throw new Error('Insufficient loyalty points');

      const [txn] = await LoyaltyTransaction.create(
        [
          {
            userId: new Types.ObjectId(userId),
            type: 'redeem',
            points: -points,
            balanceAfter: account.balance,
            source: 'redemption',
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

  async revertRedeem(userId: string, points: number, idempotencyKey: string): Promise<void> {
    const existing = await LoyaltyTransaction.findOne({ idempotencyKey }).exec();
    if (existing) return;

    await LoyaltyAccount.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $inc: { balance: points, totalRedeemed: -points } },
    ).exec();

    await LoyaltyTransaction.create({
      userId: new Types.ObjectId(userId),
      type: 'admin_adjust',
      points,
      balanceAfter: await this.getBalance(userId),
      source: 'admin',
      referenceId: null,
      description: 'Reverted redemption (payment failed)',
      idempotencyKey,
    });
  }

  // ─── History ──────────────────────────────────────────────────────────────

  async getHistory(userId: string, query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [transactions, total] = await Promise.all([
      LoyaltyTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      LoyaltyTransaction.countDocuments(filter).exec(),
    ]);
    return { transactions, meta: buildPaginationMeta(page, limit, total) };
  }

  // ─── Expiry ───────────────────────────────────────────────────────────────

  async findExpiredEarnTransactions(): Promise<ILoyaltyTransactionDoc[]> {
    return LoyaltyTransaction.find({
      type: 'earn',
      expiresAt: { $lte: new Date(), $ne: null },
      points: { $gt: 0 },
    }).exec();
  }

  async markExpired(txnId: string): Promise<void> {
    await LoyaltyTransaction.findByIdAndUpdate(txnId, { $set: { points: 0 } }).exec();
  }
}
