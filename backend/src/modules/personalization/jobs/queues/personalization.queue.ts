import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const PersonalizationJobs = {
  TRACK_VIEW: 'personalization:track-view',
  REBUILD_COPURCHASE: 'personalization:rebuild-copurchase',
  EVALUATE_RULES: 'personalization:evaluate-rules',
} as const;

let personalizationQueue: Queue | null = null;

export const getPersonalizationQueue = (): Queue => {
  if (!personalizationQueue) {
    personalizationQueue = new Queue('personalization', { connection: getBullMQConnectionOpts() });
  }
  return personalizationQueue;
};
