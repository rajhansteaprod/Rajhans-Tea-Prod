import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const WalletJobs = {
  CREDIT: 'wallet:credit',
  DEBIT: 'wallet:debit',
} as const;

let walletQueue: Queue | null = null;

export const getWalletQueue = (): Queue => {
  if (!walletQueue) {
    walletQueue = new Queue('wallet', { connection: getBullMQConnectionOpts() });
  }
  return walletQueue;
};
