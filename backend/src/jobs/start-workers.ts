import {
  startInvoiceWorker,
  closeInvoiceWorker,
} from '../modules/payments/jobs/workers/invoice.worker';
import {
  startWalletWorker,
  closeWalletWorker,
} from '../modules/payments/jobs/workers/wallet.worker';
import {
  startPaymentWorker,
  closePaymentWorker,
} from '../modules/payments/jobs/workers/payment.worker';
import {
  startFulfillmentWorker,
  closeFulfillmentWorker,
} from '../modules/inventory/jobs/workers/fulfillment.worker';
import {
  startPromotionsWorker,
  closePromotionsWorker,
} from '../modules/promotions/jobs/workers/promotions.worker';
import {
  startReviewsWorker,
  closeReviewsWorker,
} from '../modules/reviews/jobs/workers/reviews.worker';
import { logger } from '../utils/logger';

export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startFulfillmentWorker();
  startPromotionsWorker();
  startReviewsWorker();
  logger.info('BullMQ workers registered');
};

export const closeWorkers = async (): Promise<void> => {
  await closePaymentWorker();
  await closeInvoiceWorker();
  await closeWalletWorker();
  await closeFulfillmentWorker();
  await closePromotionsWorker();
  await closeReviewsWorker();
  logger.info('BullMQ workers closed');
};
