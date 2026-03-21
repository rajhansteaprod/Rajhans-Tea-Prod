import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const FulfillmentJobs = {
  CREATE_ORDER: 'fulfillment:create-order',
  SHIP_ORDER: 'fulfillment:ship-order',
  SYNC_TRACKING: 'fulfillment:sync-tracking',
} as const;

let fulfillmentQueue: Queue | null = null;

export const getFulfillmentQueue = (): Queue => {
  if (!fulfillmentQueue) {
    fulfillmentQueue = new Queue('fulfillment', { connection: getBullMQConnectionOpts() });
  }
  return fulfillmentQueue;
};
