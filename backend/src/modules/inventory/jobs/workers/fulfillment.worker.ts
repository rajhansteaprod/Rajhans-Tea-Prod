import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { OrderService } from '../../services/order.service';
import { OrderRepository } from '../../repositories/order.repository';
import { logger } from '../../../../utils/logger';

const orderService = new OrderService();
const orderRepo = new OrderRepository();

let worker: Worker | null = null;

export const startFulfillmentWorker = (): void => {
  worker = new Worker(
    'fulfillment',
    async (job: Job) => {
      if (job.name === 'fulfillment:create-order') {
        const { paymentId } = job.data as { paymentId: string };
        logger.info({ paymentId, jobId: job.id }, 'Creating order from payment');
        await orderService.createFromPayment(paymentId);
        logger.info({ paymentId, jobId: job.id }, 'Order created');
      }

      if (job.name === 'fulfillment:ship-order') {
        const { orderId } = job.data as { orderId: string };
        logger.info({ orderId, jobId: job.id }, 'Shipping order via provider');
        await orderService.shipOrder(orderId);
        logger.info({ orderId, jobId: job.id }, 'Order shipped');
      }

      if (job.name === 'fulfillment:sync-tracking') {
        logger.info({ jobId: job.id }, 'Syncing tracking for active shipments');
        const activeOrders = await orderRepo.findActiveShipments();
        for (const order of activeOrders) {
          try {
            await orderService.getTracking(order._id.toString());
          } catch {
            logger.warn({ orderId: order._id }, 'Tracking sync failed for order');
          }
        }
        logger.info({ count: activeOrders.length, jobId: job.id }, 'Tracking sync complete');
      }
    },
    {
      connection: getBullMQConnectionOpts(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Fulfillment job failed');
  });
};

export const closeFulfillmentWorker = async (): Promise<void> => {
  if (worker) await worker.close();
};
