import { startInvoiceWorker, closeInvoiceWorker } from './workers/invoice.worker';
import { startWalletWorker, closeWalletWorker } from './workers/wallet.worker';
import { startPaymentWorker, closePaymentWorker } from './workers/payment.worker';
import { startFulfillmentWorker, closeFulfillmentWorker } from '../modules/inventory/jobs/workers/fulfillment.worker';
import { startPromotionsWorker, closePromotionsWorker } from '../modules/promotions/jobs/workers/promotions.worker';
import { startPersonalizationWorker, closePersonalizationWorker } from '../modules/personalization/jobs/workers/personalization.worker';
import { logger } from '../utils/logger';

export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startFulfillmentWorker();
  startPromotionsWorker();
  startPersonalizationWorker();
  logger.info('BullMQ workers registered');
};

export const closeWorkers = async (): Promise<void> => {
  await closePaymentWorker();
  await closeInvoiceWorker();
  await closeWalletWorker();
  await closeFulfillmentWorker();
  await closePromotionsWorker();
  await closePersonalizationWorker();
  logger.info('BullMQ workers closed');
};
