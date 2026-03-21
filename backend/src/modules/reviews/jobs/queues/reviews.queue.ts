import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const ReviewJobs = {
  RECOMPUTE_RATING: 'reviews:recompute-rating',
  REVIEW_REMINDER: 'reviews:review-reminder',
} as const;

let reviewsQueue: Queue | null = null;

export const getReviewsQueue = (): Queue => {
  if (!reviewsQueue) {
    reviewsQueue = new Queue('reviews', { connection: getBullMQConnectionOpts() });
  }
  return reviewsQueue;
};
