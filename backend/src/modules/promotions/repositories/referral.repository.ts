import { Types } from 'mongoose';
import { Referral, IReferralDoc } from '../models/referral.model';
import { ReferralSettings, IReferralSettingsDoc } from '../models/referral-settings.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class ReferralRepository {
  // ─── Settings (singleton) ─────────────────────────────────────────────────

  async getSettings(): Promise<IReferralSettingsDoc> {
    let settings = await ReferralSettings.findOne().exec();
    if (!settings) {
      settings = await ReferralSettings.create({});
    }
    return settings;
  }

  async updateSettings(data: Partial<IReferralSettingsDoc>): Promise<IReferralSettingsDoc> {
    return ReferralSettings.findOneAndUpdate({}, { $set: data }, { new: true, upsert: true }).exec() as Promise<IReferralSettingsDoc>;
  }

  // ─── Referral CRUD ────────────────────────────────────────────────────────

  async findByCode(code: string): Promise<IReferralDoc[]> {
    return Referral.find({ referralCode: code }).populate('refereeUserId', 'phone firstName').exec();
  }

  async findByReferrer(userId: string): Promise<IReferralDoc[]> {
    return Referral.find({ referrerUserId: new Types.ObjectId(userId) })
      .populate('refereeUserId', 'phone firstName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByReferee(userId: string): Promise<IReferralDoc | null> {
    return Referral.findOne({ refereeUserId: new Types.ObjectId(userId) }).exec();
  }

  async findPendingByReferee(userId: string): Promise<IReferralDoc | null> {
    return Referral.findOne({
      refereeUserId: new Types.ObjectId(userId),
      status: 'pending',
    }).exec();
  }

  async create(data: Partial<IReferralDoc>): Promise<IReferralDoc> {
    return Referral.create(data) as Promise<IReferralDoc>;
  }

  async markCompleted(id: string): Promise<void> {
    await Referral.findByIdAndUpdate(id, {
      $set: { status: 'completed', completedAt: new Date(), 'referrerReward.credited': true },
    }).exec();
  }

  async findAll(query: { page?: number; limit?: number; status?: string } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const [referrals, total] = await Promise.all([
      Referral.find(filter)
        .populate('referrerUserId', 'phone firstName')
        .populate('refereeUserId', 'phone firstName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Referral.countDocuments(filter).exec(),
    ]);
    return { referrals, meta: buildPaginationMeta(page, limit, total) };
  }

  async getReferrerStats(userId: string): Promise<{ total: number; completed: number; pending: number }> {
    const referrals = await Referral.find({ referrerUserId: new Types.ObjectId(userId) }).exec();
    return {
      total: referrals.length,
      completed: referrals.filter((r) => r.status === 'completed').length,
      pending: referrals.filter((r) => r.status === 'pending').length,
    };
  }
}
