import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { Payment } from '../../models/payment.model';
import { StockReservation } from '../../../cart/models/stock-reservation.model';
import { PaymentService } from '../../services/payment.service';
import { logger } from '../../../../utils/logger';

let worker: Worker | null = null;
const paymentService = new PaymentService();

export const startPaymentWorker = (): void => {
  worker = new Worker(
    'payment',
    async (job: Job) => {
      if (job.name === 'payment:verify-timeout') {
        await handleVerifyTimeout(job);
      } else if (job.name === 'payment:compensate-wallet-debit') {
        await handleCompensateWalletDebit(job);
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, error: err.message }, 'Payment job failed');
  });
};

/**
 * Timeout job handler: Release stock if payment not verified within 30 minutes
 * Uses locking to prevent double execution if verification happens concurrently
 */
async function handleVerifyTimeout(job: Job): Promise<void> {
  const { paymentId } = job.data as { paymentId: string };
  logger.info({ paymentId, jobId: job.id }, 'Processing payment timeout');

  const payment = await Payment.findById(paymentId).exec();
  if (!payment) {
    logger.warn({ paymentId }, 'Payment not found for timeout job');
    return;
  }

  // Don't release stock if payment was already captured or marked failed
  if (payment.status !== 'created') {
    logger.info({ paymentId, status: payment.status }, 'Payment already processed, skipping timeout');
    return;
  }

  // CRITICAL: Use locking to prevent race with concurrent verification
  const isLocked = payment.lockedUntil && new Date(payment.lockedUntil) > new Date();
  if (isLocked) {
    // Verification is in progress, retry this job after lock expires
    throw new Error('Payment is locked for verification, will retry');
  }

  // Mark payment as failed
  payment.status = 'failed';
  await payment.save();

  // Release stock reservation
  try {
    await StockReservation.deleteMany({ sessionId: payment.sessionId }).exec();
    logger.info({ paymentId }, 'Payment timed out — marked failed, stock released');
  } catch (err) {
    logger.error({ paymentId, error: err }, 'Failed to release stock on timeout');
    throw err; // Retry job if stock release fails
  }
}

/**
 * Compensation job: Retry wallet debit if it failed during payment verification
 * Uses idempotency key to prevent double-debit
 */
async function handleCompensateWalletDebit(job: Job): Promise<void> {
  const { paymentId } = job.data as { paymentId: string };
  logger.info({ paymentId, jobId: job.id }, 'Processing wallet debit compensation');

  try {
    await paymentService.compensateWalletDebit(paymentId);
  } catch (err) {
    logger.error(
      { paymentId, jobId: job.id, error: (err as Error).message },
      'Wallet compensation failed, will retry'
    );
    throw err; // BullMQ will retry with exponential backoff
  }
}

export const closePaymentWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
