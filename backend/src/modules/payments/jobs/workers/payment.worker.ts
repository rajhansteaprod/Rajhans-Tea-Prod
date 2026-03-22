import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { Payment } from '../../models/payment.model';
import { StockReservation } from '../../../cart/models/stock-reservation.model';
import { logger } from '../../../../utils/logger';

let worker: Worker | null = null;

export const startPaymentWorker = (): void => {
  worker = new Worker(
    'payment',
    async (job: Job) => {
      if (job.name === 'payment:verify-timeout') {
        const { paymentId } = job.data as { paymentId: string };
        logger.info({ paymentId, jobId: job.id }, 'Checking payment timeout');

        const payment = await Payment.findById(paymentId).exec();
        if (payment && payment.status === 'created') {
          payment.status = 'failed';
          await payment.save();
          await StockReservation.deleteMany({ sessionId: payment.sessionId }).exec();
          logger.info({ paymentId }, 'Payment timed out — marked failed, stock released');
        }
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Payment job failed');
  });
};

export const closePaymentWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
