import { startInvoiceWorker, closeInvoiceWorker } from './workers/invoice.worker';
import { startWalletWorker, closeWalletWorker } from './workers/wallet.worker';
import { startPaymentWorker, closePaymentWorker } from './workers/payment.worker';
import { startFulfillmentWorker, closeFulfillmentWorker } from '../modules/inventory/jobs/workers/fulfillment.worker';
import { startPromotionsWorker, closePromotionsWorker } from '../modules/promotions/jobs/workers/promotions.worker';
import { startPersonalizationWorker, closePersonalizationWorker } from '../modules/personalization/jobs/workers/personalization.worker';
import { startReviewsWorker, closeReviewsWorker } from '../modules/reviews/jobs/workers/reviews.worker';
import { startNotificationWorker, closeNotificationWorker } from '../modules/communication/jobs/workers/notification.worker';
import { startDataPlatformWorker, closeDataPlatformWorker } from '../modules/data-platform/jobs/workers/data-platform.worker';
import { logger } from '../utils/logger';

export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startFulfillmentWorker();
  startPromotionsWorker();
  startPersonalizationWorker();
  startReviewsWorker();
  startNotificationWorker();
  startDataPlatformWorker();
  logger.info('BullMQ workers registered');
};

export const closeWorkers = async (): Promise<void> => {
  await closePaymentWorker();
  await closeInvoiceWorker();
  await closeWalletWorker();
  await closeFulfillmentWorker();
  await closePromotionsWorker();
  await closePersonalizationWorker();
  await closeReviewsWorker();
  await closeNotificationWorker();
  await closeDataPlatformWorker();
  logger.info('BullMQ workers closed');
};
