import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { ProductViewRepository } from '../../repositories/product-view.repository';
import { CoPurchaseRepository } from '../../repositories/co-purchase.repository';
import { MerchandisingService } from '../../services/merchandising.service';
import { logger } from '../../../../utils/logger';

const viewRepo = new ProductViewRepository();
const coPurchaseRepo = new CoPurchaseRepository();
const merchandisingService = new MerchandisingService();

let worker: Worker | null = null;

export const startPersonalizationWorker = (): void => {
  worker = new Worker(
    'personalization',
    async (job: Job) => {
      if (job.name === 'personalization:track-view') {
        const { productId, userId, sessionId } = job.data as {
          productId: string;
          userId: string | null;
          sessionId: string;
        };
        await viewRepo.logView(productId, userId, sessionId);
      }

      if (job.name === 'personalization:rebuild-copurchase') {
        logger.info({ jobId: job.id }, 'Rebuilding co-purchase matrix');
        const pairs = await coPurchaseRepo.rebuildFromOrders(90);
        logger.info({ pairs, jobId: job.id }, 'Co-purchase rebuild complete');
      }

      if (job.name === 'personalization:evaluate-rules') {
        logger.info({ jobId: job.id }, 'Evaluating merchandising rules');
        const count = await merchandisingService.evaluateAllRules();
        logger.info({ count, jobId: job.id }, 'Merchandising rules evaluated');
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Personalization job failed');
  });
};

export const closePersonalizationWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
