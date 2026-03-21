import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';

export const InventoryJobs = {
  STOCK_DEDUCT: 'inventory:stock-deduct',
} as const;

let inventoryQueue: Queue | null = null;

export const getInventoryQueue = (): Queue => {
  if (!inventoryQueue) {
    inventoryQueue = new Queue('inventory', { connection: getBullMQConnectionOpts() });
  }
  return inventoryQueue;
};
