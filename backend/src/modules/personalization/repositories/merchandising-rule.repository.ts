import {
  MerchandisingRule,
  IMerchandisingRuleDoc,
  RuleSection,
} from '../models/merchandising-rule.model';
import { Types } from 'mongoose';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class MerchandisingRuleRepository {
  async findById(id: string): Promise<IMerchandisingRuleDoc | null> {
    return MerchandisingRule.findById(id).exec();
  }

  async findAll(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const [rules, total] = await Promise.all([
      MerchandisingRule.find().sort({ section: 1, priority: -1 }).skip(skip).limit(limit).exec(),
      MerchandisingRule.countDocuments().exec(),
    ]);
    return { rules, meta: buildPaginationMeta(page, limit, total) };
  }

  async getActiveForSection(section: RuleSection): Promise<IMerchandisingRuleDoc[]> {
    const now = new Date();
    return MerchandisingRule.find({
      section,
      isActive: true,
      $or: [{ startDate: null }, { startDate: { $lte: now } }],
      $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
    })
      .sort({ priority: -1 })
      .exec();
  }

  async create(data: Partial<IMerchandisingRuleDoc>): Promise<IMerchandisingRuleDoc> {
    return MerchandisingRule.create(data) as Promise<IMerchandisingRuleDoc>;
  }

  async update(
    id: string,
    data: Partial<IMerchandisingRuleDoc>,
  ): Promise<IMerchandisingRuleDoc | null> {
    return MerchandisingRule.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await MerchandisingRule.findByIdAndDelete(id).exec();
  }

  async updateCachedProducts(id: string, productIds: string[]): Promise<void> {
    await MerchandisingRule.findByIdAndUpdate(id, {
      $set: {
        cachedProductIds: productIds.map((p) => new Types.ObjectId(p)),
        cachedAt: new Date(),
      },
    }).exec();
  }

  async findAllAutomatedActive(): Promise<IMerchandisingRuleDoc[]> {
    return MerchandisingRule.find({ type: 'automated', isActive: true }).exec();
  }
}
