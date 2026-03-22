import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { WalletService } from '../../services/wallet.service';
import { logger } from '../../../../utils/logger';

const walletService = new WalletService();

let worker: Worker | null = null;

interface WalletJobData {
  userId: string;
  amount: number;
  source: 'refund' | 'cashback' | 'admin_credit' | 'purchase' | 'admin_debit';
  referenceId: string;
  description: string;
  idempotencyKey: string;
}

export const startWalletWorker = (): void => {
  worker = new Worker(
    'wallet',
    async (job: Job<WalletJobData>) => {
      const { userId, amount, source, referenceId, description, idempotencyKey } = job.data;
      logger.info({ userId, amount, source, jobId: job.id }, `Processing wallet ${job.name}`);

      if (job.name === 'wallet:credit') {
        await walletService.credit(userId, amount, source, referenceId, description, idempotencyKey);
      } else if (job.name === 'wallet:debit') {
        await walletService.debit(userId, amount, source, referenceId, description, idempotencyKey);
      }

      logger.info({ userId, amount, jobId: job.id }, `Wallet ${job.name} processed`);
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Wallet job failed');
  });
};

export const closeWalletWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
