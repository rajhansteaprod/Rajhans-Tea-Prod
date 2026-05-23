import { Worker, Job } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../../loaders/bullmq.loader';
import { OrderService } from '../../services/order.service';
import { ShipmentService } from '../../services/shipment.service';
import { OrderRepository } from '../../repositories/order.repository';
import { logger } from '../../../../utils/logger';
import { shipmentLogger } from '../../../../utils/shipment-logger';

const orderService = new OrderService();
const shipmentService = new ShipmentService();
const orderRepo = new OrderRepository();

let worker: Worker | null = null;

export const startFulfillmentWorker = (): void => {
  worker = new Worker(
    'fulfillment',
    async (job: Job) => {
      if (job.name === 'fulfillment:create-order') {
        const { paymentId } = job.data as { paymentId: string };
        logger.info({ paymentId, jobId: job.id }, 'Creating order from payment');
        const order = await orderService.createFromPayment(paymentId);
        logger.info({ paymentId, jobId: job.id, orderId: order._id }, 'Order created');

        // Auto-queue SHIP_ORDER job
        const queue = (await import('../queues/fulfillment.queue')).getFulfillmentQueue();
        await queue.add(
          'fulfillment:ship-order',
          { orderId: order._id.toString() },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
        logger.info({ orderId: order._id.toString() }, 'SHIP_ORDER job queued automatically');
      }

      if (job.name === 'fulfillment:ship-order') {
        const { orderId } = job.data as { orderId: string };
        shipmentLogger.info({ orderId, jobId: job.id }, '▶ Processing SHIP_ORDER job');

        try {
          shipmentLogger.debug({ orderId }, '📤 Calling orderService.shipOrder()');
          await orderService.shipOrder(orderId);
          shipmentLogger.info({ orderId }, '✅ Order shipped successfully via Shiprocket');

          // Create Shipment document for tracking
          shipmentLogger.debug({ orderId }, '📋 Creating shipment tracking document');
          await shipmentService.createFromOrder(orderId);
          shipmentLogger.info({ orderId }, '✅ Shipment tracking document created');
        } catch (err) {
          shipmentLogger.error({
            orderId,
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          }, '❌ SHIP_ORDER job failed');
          throw err;
        }
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
