import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const PromotionJobs = {
  EARN_LOYALTY: 'promotions:earn-loyalty',
  EXPIRE_LOYALTY: 'promotions:expire-loyalty',
  COMPLETE_REFERRAL: 'promotions:complete-referral',
  REVERT_LOYALTY: 'promotions:revert-loyalty',
} as const;

let promotionsQueue: Queue | null = null;

export const getPromotionsQueue = (): Queue => {
  if (!promotionsQueue) {
    promotionsQueue = new Queue('promotions', { connection: getBullMQConnectionOpts() });
  }
  return promotionsQueue;
};
