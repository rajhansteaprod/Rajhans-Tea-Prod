import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { logger } from '../../../../utils/logger';
import { PaymentService } from '../../services/payment.service';

const paymentService = new PaymentService();

let worker: Worker | null = null;

export const startWebhookWorker = (): void => {
  worker = new Worker(
    'webhook',
    async (job: Job) => {
      const { rawBody, signature, razorpayEventId } = job.data as {
        rawBody: string;
        signature: string;
        razorpayEventId: string;
      };

      logger.info(
        { jobId: job.id, eventId: razorpayEventId },
        'Processing webhook',
      );

      try {
        // Process the webhook (will be implemented in handleWebhookPayload in US-07)
        await paymentService.processWebhookPayload(rawBody, signature, razorpayEventId);
        logger.info(
          { jobId: job.id, eventId: razorpayEventId },
          'Webhook processed successfully',
        );
      } catch (error) {
        logger.error(
          { jobId: job.id, eventId: razorpayEventId, error: (error as Error).message },
          'Webhook processing failed',
        );
        throw error;
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, eventId: job?.data?.razorpayEventId, error: err.message },
      'Webhook job failed',
    );
  });

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, eventId: job.data?.razorpayEventId },
      'Webhook job completed',
    );
  });
};

export const closeWebhookWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
