import { startInvoiceWorker, closeInvoiceWorker } from './workers/invoice.worker';
import { startWalletWorker, closeWalletWorker } from './workers/wallet.worker';
import { startPaymentWorker, closePaymentWorker } from './workers/payment.worker';
import { startFulfillmentWorker, closeFulfillmentWorker } from '../modules/inventory/jobs/workers/fulfillment.worker';
import { logger } from '../utils/logger';

export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startFulfillmentWorker();
  // Future slices:
  // startNotificationWorker();
  // startAnalyticsWorker();
  logger.info('BullMQ workers registered');
};

export const closeWorkers = async (): Promise<void> => {
  await closePaymentWorker();
  await closeInvoiceWorker();
  await closeWalletWorker();
  await closeFulfillmentWorker();
  logger.info('BullMQ workers closed');
};
