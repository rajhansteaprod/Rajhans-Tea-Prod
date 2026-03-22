import { Types } from 'mongoose';
import { ReviewRepository } from '../repositories/review.repository';
import { ReviewVote } from '../models/review-vote.model';
import { ReviewReport } from '../models/review-report.model';
import { Order } from '../../inventory/models/order.model';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../utils/api-error';

// Simple bad words filter
const BAD_WORDS = ['scam', 'fraud', 'cheat', 'fake', 'spam'];

function containsBadWords(text: string): boolean {
  const lower = text.toLowerCase();
  return BAD_WORDS.some((w) => lower.includes(w));
}

export class ReviewService {
  private repo = new ReviewRepository();

  async submitReview(
    userId: string,
    productId: string,
    data: { rating: number; title: string; body: string; images?: string[] },
  ) {
    // One review per user per product
    const existing = await this.repo.findByUserAndProduct(userId, productId);
    if (existing) throw new ConflictError('You have already reviewed this product');

    // Check verified purchase
    const order = await Order.findOne({
      userId: new Types.ObjectId(userId),
      status: 'delivered',
      'items.productId': productId,
    }).exec();
    const isVerifiedPurchase = !!order;

    // Auto-approve for verified purchasers unless bad words detected
    const hasBadWords = containsBadWords(data.title + ' ' + data.body);
    const status = isVerifiedPurchase && !hasBadWords ? 'approved' : 'pending';

    const review = await this.repo.create({
      userId: new Types.ObjectId(userId),
      productId: new Types.ObjectId(productId),
      rating: data.rating,
      title: data.title,
      body: data.body,
      images: data.images || [],
      isVerifiedPurchase,
      status,
    });

    // Recompute rating if auto-approved
    if (status === 'approved') {
      await this.repo.computeRatingSummary(productId);
    }

    return review;
  }

  async getProductReviews(
    productId: string,
    query: { page?: number; limit?: number; sort?: string; rating?: number } = {},
  ) {
    return this.repo.findByProduct(productId, query);
  }

  async getRatingSummary(productId: string) {
    return this.repo.getRatingSummary(productId);
  }

  async getMyReviews(userId: string, query: { page?: number; limit?: number } = {}) {
    return this.repo.findByUser(userId, query);
  }

  async voteHelpful(userId: string, reviewId: string): Promise<'added' | 'removed'> {
    const exists = await ReviewVote.findOne({
      userId: new Types.ObjectId(userId),
      reviewId: new Types.ObjectId(reviewId),
    }).exec();

    if (exists) {
      await ReviewVote.findByIdAndDelete(exists._id).exec();
      await this.repo.incrementHelpfulVotes(reviewId, -1);
      return 'removed';
    }

    await ReviewVote.create({
      userId: new Types.ObjectId(userId),
      reviewId: new Types.ObjectId(reviewId),
    });
    await this.repo.incrementHelpfulVotes(reviewId, 1);
    return 'added';
  }

  async reportReview(
    userId: string,
    reviewId: string,
    reason: string,
    details?: string,
  ): Promise<void> {
    const exists = await ReviewReport.findOne({
      userId: new Types.ObjectId(userId),
      reviewId: new Types.ObjectId(reviewId),
    }).exec();
    if (exists) throw new ConflictError('You have already reported this review');

    await ReviewReport.create({
      userId: new Types.ObjectId(userId),
      reviewId: new Types.ObjectId(reviewId),
      reason,
      details: details || null,
    });
    await this.repo.incrementReportCount(reviewId, 1);
  }

  async deleteReview(userId: string, reviewId: string): Promise<void> {
    const review = await this.repo.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    if (review.userId.toString() !== userId)
      throw new ForbiddenError("Cannot delete another user's review");

    const productId = review.productId.toString();
    await this.repo.deleteById(reviewId);
    await this.repo.computeRatingSummary(productId);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async getModerationQueue(query: { page?: number; limit?: number; status?: string } = {}) {
    return this.repo.findModerationQueue(query as any);
  }

  async approveReview(reviewId: string): Promise<void> {
    const review = await this.repo.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    await this.repo.updateStatus(reviewId, 'approved');
    await this.repo.computeRatingSummary(review.productId.toString());
  }

  async rejectReview(reviewId: string, reason: string): Promise<void> {
    const review = await this.repo.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    await this.repo.updateStatus(reviewId, 'rejected', reason);
    await this.repo.computeRatingSummary(review.productId.toString());
  }

  async replyToReview(reviewId: string, adminId: string, body: string): Promise<void> {
    const review = await this.repo.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    await this.repo.addAdminReply(reviewId, body, adminId);
  }

  async pinReview(reviewId: string): Promise<void> {
    const review = await this.repo.findById(reviewId);
    if (!review) throw new NotFoundError('Review not found');
    await this.repo.togglePin(reviewId);
  }

  async getAnalytics() {
    return this.repo.getAnalytics();
  }

  async getMostReported(query: { page?: number; limit?: number } = {}) {
    return this.repo.findMostReported(query);
  }
}
