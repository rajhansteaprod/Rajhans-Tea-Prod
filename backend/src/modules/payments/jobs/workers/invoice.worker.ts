import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { InvoiceService } from '../../services/invoice.service';
import { logger } from '../../../../utils/logger';

const invoiceService = new InvoiceService();

let worker: Worker | null = null;

export const startInvoiceWorker = (): void => {
  worker = new Worker(
    'invoice',
    async (job: Job) => {
      const { paymentId } = job.data as { paymentId: string };
      logger.info({ paymentId, jobId: job.id }, 'Generating invoice');
      await invoiceService.generateInvoice(paymentId);
      logger.info({ paymentId, jobId: job.id }, 'Invoice generated');
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Invoice job failed');
  });
};

export const closeInvoiceWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
