import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../loaders/bullmq.loader';

export const InvoiceJobs = {
  GENERATE: 'invoice:generate',
} as const;

let invoiceQueue: Queue | null = null;

export const getInvoiceQueue = (): Queue => {
  if (!invoiceQueue) {
    invoiceQueue = new Queue('invoice', { connection: getBullMQConnectionOpts() });
  }
  return invoiceQueue;
};
