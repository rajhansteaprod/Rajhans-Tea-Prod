import { Campaign, ICampaignDoc } from '../models/campaign.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class CampaignRepository {
  async findActive(): Promise<ICampaignDoc[]> {
    const now = new Date();
    return Campaign.find({
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    })
      .sort({ priority: -1 })
      .exec();
  }

  async findById(id: string): Promise<ICampaignDoc | null> {
    return Campaign.findById(id).exec();
  }

  async findAll(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const [campaigns, total] = await Promise.all([
      Campaign.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Campaign.countDocuments().exec(),
    ]);
    return { campaigns, meta: buildPaginationMeta(page, limit, total) };
  }

  async create(data: Partial<ICampaignDoc>): Promise<ICampaignDoc> {
    return Campaign.create(data) as Promise<ICampaignDoc>;
  }

  async update(id: string, data: Partial<ICampaignDoc>): Promise<ICampaignDoc | null> {
    return Campaign.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await Campaign.findByIdAndDelete(id).exec();
  }

  async findPendingActivation(): Promise<ICampaignDoc[]> {
    const now = new Date();
    return Campaign.find({ isActive: false, startsAt: { $lte: now }, endsAt: { $gte: now } }).exec();
  }

  async findExpired(): Promise<ICampaignDoc[]> {
    const now = new Date();
    return Campaign.find({ isActive: true, endsAt: { $lt: now } }).exec();
  }

  async setLinkedPriceRules(id: string, ruleIds: string[]): Promise<void> {
    await Campaign.findByIdAndUpdate(id, { $set: { linkedPriceRuleIds: ruleIds } }).exec();
  }
}
