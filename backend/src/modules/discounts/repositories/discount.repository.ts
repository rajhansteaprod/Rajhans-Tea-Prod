import { Discount, IDiscountDoc } from '../models/discount.model';

export class DiscountRepository {
  async findByCode(code: string): Promise<IDiscountDoc | null> {
    return Discount.findOne({ code: code.toUpperCase().trim(), type: 'promo_code' }).exec();
  }

  async findById(id: string): Promise<IDiscountDoc | null> {
    return Discount.findById(id).exec();
  }

  async findActiveOffers(orderTotal: number): Promise<IDiscountDoc[]> {
    const now = new Date();
    return Discount.find({
      type: 'offer',
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      minOrderAmount: { $lte: orderTotal },
    })
      .sort({ value: -1 })
      .exec();
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    type?: 'promo_code' | 'offer';
    isActive?: boolean;
  } = {}): Promise<{ discounts: IDiscountDoc[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.type) filter.type = query.type;
    if (query.isActive !== undefined) filter.isActive = query.isActive;

    const [discounts, total] = await Promise.all([
      Discount.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Discount.countDocuments(filter).exec(),
    ]);

    return { discounts, total };
  }

  async create(data: Partial<IDiscountDoc>): Promise<IDiscountDoc> {
    return Discount.create(data) as Promise<IDiscountDoc>;
  }

  async update(id: string, data: Partial<IDiscountDoc>): Promise<IDiscountDoc | null> {
    return Discount.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async incrementUsedCount(id: string): Promise<void> {
    await Discount.findByIdAndUpdate(id, { $inc: { usedCount: 1 } }).exec();
  }

  async delete(id: string): Promise<void> {
    await Discount.findByIdAndDelete(id).exec();
  }
}
