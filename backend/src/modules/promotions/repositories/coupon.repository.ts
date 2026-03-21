import { Types } from 'mongoose';
import { Coupon, ICouponDoc } from '../models/coupon.model';
import { CouponUsage, ICouponUsageDoc } from '../models/coupon-usage.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class CouponRepository {
  async findByCode(code: string): Promise<ICouponDoc | null> {
    return Coupon.findOne({ code: code.toUpperCase().trim() }).exec();
  }

  async findById(id: string): Promise<ICouponDoc | null> {
    return Coupon.findById(id).exec();
  }

  async findAll(query: { page?: number; limit?: number; isActive?: boolean } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Coupon.countDocuments(filter).exec(),
    ]);
    return { coupons, meta: buildPaginationMeta(page, limit, total) };
  }

  async create(data: Partial<ICouponDoc>): Promise<ICouponDoc> {
    return Coupon.create(data) as Promise<ICouponDoc>;
  }

  async update(id: string, data: Partial<ICouponDoc>): Promise<ICouponDoc | null> {
    return Coupon.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async incrementUsedCount(id: string): Promise<void> {
    await Coupon.findByIdAndUpdate(id, { $inc: { usedCount: 1 } }).exec();
  }

  async delete(id: string): Promise<void> {
    await Coupon.findByIdAndDelete(id).exec();
  }

  async getUserUsageCount(couponId: string, userId: string): Promise<number> {
    return CouponUsage.countDocuments({
      couponId: new Types.ObjectId(couponId),
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async recordUsage(data: Partial<ICouponUsageDoc>): Promise<void> {
    await CouponUsage.create(data);
  }
}
