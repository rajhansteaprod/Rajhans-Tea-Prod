import { Types } from 'mongoose';
import { Review, IReviewDoc, ReviewStatus } from '../models/review.model';
import { RatingSummary } from '../models/rating-summary.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class ReviewRepository {
  async create(data: Partial<IReviewDoc>): Promise<IReviewDoc> {
    return Review.create(data) as Promise<IReviewDoc>;
  }

  async findById(id: string): Promise<IReviewDoc | null> {
    return Review.findById(id).populate('userId', 'phone firstName lastName').exec();
  }

  async findByUserAndProduct(userId: string, productId: string): Promise<IReviewDoc | null> {
    return Review.findOne({
      userId: new Types.ObjectId(userId),
      productId: new Types.ObjectId(productId),
    }).exec();
  }

  async findByProduct(
    productId: string,
    query: { page?: number; limit?: number; sort?: string; rating?: number } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {
      productId: new Types.ObjectId(productId),
      status: 'approved',
    };
    if (query.rating) filter.rating = query.rating;

    let sort: Record<string, 1 | -1> = { isPinned: -1, createdAt: -1 };
    if (query.sort === 'helpful') sort = { isPinned: -1, helpfulVotes: -1 };
    if (query.sort === 'highest') sort = { isPinned: -1, rating: -1 };
    if (query.sort === 'lowest') sort = { isPinned: -1, rating: 1 };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('userId', 'phone firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
    return { reviews, meta: buildPaginationMeta(page, limit, total) };
  }

  async findByUser(userId: string, query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('productId', 'name slug images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
    return { reviews, meta: buildPaginationMeta(page, limit, total) };
  }

  async findModerationQueue(query: { page?: number; limit?: number; status?: ReviewStatus } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    else filter.status = 'pending';

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('userId', 'phone firstName lastName')
        .populate('productId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
    return { reviews, meta: buildPaginationMeta(page, limit, total) };
  }

  async updateStatus(id: string, status: ReviewStatus, rejectionReason?: string): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (rejectionReason) update.rejectionReason = rejectionReason;
    await Review.findByIdAndUpdate(id, { $set: update }).exec();
  }

  async addAdminReply(id: string, body: string, adminId: string): Promise<void> {
    await Review.findByIdAndUpdate(id, {
      $set: { adminReply: { body, repliedBy: new Types.ObjectId(adminId), repliedAt: new Date() } },
    }).exec();
  }

  async togglePin(id: string): Promise<void> {
    const review = await Review.findById(id).exec();
    if (review) {
      await Review.findByIdAndUpdate(id, { $set: { isPinned: !review.isPinned } }).exec();
    }
  }

  async incrementHelpfulVotes(id: string, delta: number): Promise<void> {
    await Review.findByIdAndUpdate(id, { $inc: { helpfulVotes: delta } }).exec();
  }

  async incrementReportCount(id: string, delta: number): Promise<void> {
    await Review.findByIdAndUpdate(id, { $inc: { reportCount: delta } }).exec();
  }

  async deleteById(id: string): Promise<void> {
    await Review.findByIdAndDelete(id).exec();
  }

  async computeRatingSummary(productId: string) {
    const pid = new Types.ObjectId(productId);
    const [result] = await Review.aggregate([
      { $match: { productId: pid, status: 'approved' } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          total: { $sum: 1 },
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]).exec();

    const summary = {
      averageRating: result ? +result.avg.toFixed(1) : 0,
      totalReviews: result?.total ?? 0,
      distribution: {
        1: result?.r1 ?? 0,
        2: result?.r2 ?? 0,
        3: result?.r3 ?? 0,
        4: result?.r4 ?? 0,
        5: result?.r5 ?? 0,
      },
    };

    await RatingSummary.findOneAndUpdate(
      { productId: pid },
      { $set: summary },
      { upsert: true },
    ).exec();

    return summary;
  }

  async getRatingSummary(productId: string) {
    const summary = await RatingSummary.findOne({
      productId: new Types.ObjectId(productId),
    }).exec();
    if (summary) return summary;
    return this.computeRatingSummary(productId);
  }

  async findMostReported(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { reportCount: { $gt: 0 } };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('userId', 'phone firstName')
        .populate('productId', 'name slug')
        .sort({ reportCount: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
    return { reviews, meta: buildPaginationMeta(page, limit, total) };
  }

  async getAnalytics() {
    const [total, pending, reported, avgResult] = await Promise.all([
      Review.countDocuments({ status: 'approved' }).exec(),
      Review.countDocuments({ status: 'pending' }).exec(),
      Review.countDocuments({ reportCount: { $gt: 0 } }).exec(),
      Review.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating' } } },
      ]).exec(),
    ]);
    return {
      totalApproved: total,
      pendingCount: pending,
      reportedCount: reported,
      overallAvgRating: avgResult[0] ? +avgResult[0].avg.toFixed(1) : 0,
    };
  }
}
