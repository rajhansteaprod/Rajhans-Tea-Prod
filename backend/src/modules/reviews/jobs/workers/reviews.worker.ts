import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { ReviewRepository } from '../../repositories/review.repository';
import { logger } from '../../../../utils/logger';

const reviewRepo = new ReviewRepository();

let worker: Worker | null = null;

export const startReviewsWorker = (): void => {
  worker = new Worker(
    'reviews',
    async (job: Job) => {
      if (job.name === 'reviews:recompute-rating') {
        const { productId } = job.data as { productId: string };
        logger.info({ productId, jobId: job.id }, 'Recomputing rating summary');
        await reviewRepo.computeRatingSummary(productId);
      }

      if (job.name === 'reviews:review-reminder') {
        const { userId, orderId } = job.data as { userId: string; orderId: string };
        logger.info({ userId, orderId, jobId: job.id }, 'Review reminder triggered (notification integration point)');
        // Future: create notification for user to review purchased products
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Reviews job failed');
  });
};

export const closeReviewsWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
