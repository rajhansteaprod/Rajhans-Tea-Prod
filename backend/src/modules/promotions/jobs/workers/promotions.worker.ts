import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { LoyaltyService } from '../../services/loyalty.service';
import { ReferralService } from '../../services/referral.service';
import { LoyaltyRepository } from '../../repositories/loyalty.repository';
import { LoyaltyAccount } from '../../models/loyalty-account.model';
import { logger } from '../../../../utils/logger';

const loyaltyService = new LoyaltyService();
const referralService = new ReferralService();
const loyaltyRepo = new LoyaltyRepository();

let worker: Worker | null = null;

export const startPromotionsWorker = (): void => {
  worker = new Worker(
    'promotions',
    async (job: Job) => {
      if (job.name === 'promotions:earn-loyalty') {
        const { userId, orderTotal, paymentId } = job.data as {
          userId: string;
          orderTotal: number;
          paymentId: string;
        };
        logger.info({ userId, orderTotal, jobId: job.id }, 'Earning loyalty points');
        const points = await loyaltyService.earnFromPurchase(userId, orderTotal, paymentId);
        logger.info({ userId, points, jobId: job.id }, 'Loyalty points earned');
      }

      if (job.name === 'promotions:complete-referral') {
        const { refereeUserId, paymentId } = job.data as {
          refereeUserId: string;
          paymentId: string;
        };
        logger.info({ refereeUserId, jobId: job.id }, 'Completing referral');
        await referralService.completeReferral(refereeUserId, paymentId);
        logger.info({ refereeUserId, jobId: job.id }, 'Referral completed');
      }

      if (job.name === 'promotions:revert-loyalty') {
        const { userId, points, paymentId } = job.data as {
          userId: string;
          points: number;
          paymentId: string;
        };
        logger.info({ userId, points, jobId: job.id }, 'Reverting loyalty redemption');
        await loyaltyService.revertRedemption(userId, points, paymentId);
      }

      if (job.name === 'promotions:expire-loyalty') {
        logger.info({ jobId: job.id }, 'Running loyalty points expiry');
        const expiredTxns = await loyaltyRepo.findExpiredEarnTransactions();
        for (const txn of expiredTxns) {
          if (txn.points <= 0) continue;
          const pointsToExpire = txn.points;
          await LoyaltyAccount.findOneAndUpdate(
            { userId: txn.userId },
            { $inc: { balance: -pointsToExpire, totalExpired: pointsToExpire } },
          ).exec();
          await loyaltyRepo.markExpired(txn._id.toString());
        }
        logger.info({ count: expiredTxns.length, jobId: job.id }, 'Loyalty expiry complete');
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Promotions job failed');
  });
};

export const closePromotionsWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
