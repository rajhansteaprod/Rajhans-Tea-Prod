import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../loaders/bullmq.loader';

export const PaymentJobs = {
  VERIFY_TIMEOUT: 'payment:verify-timeout',
  WEBHOOK_PROCESS: 'payment:webhook-process',
} as const;

let paymentQueue: Queue | null = null;

export const getPaymentQueue = (): Queue => {
  if (!paymentQueue) {
    paymentQueue = new Queue('payment', { connection: getBullMQConnectionOpts() });
  }
  return paymentQueue;
};
