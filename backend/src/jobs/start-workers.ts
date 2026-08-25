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
  startWebhookWorker,
  closeWebhookWorker,
} from '../modules/payments/jobs/workers/webhook.worker';
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
import {
  startSeoAuditWorker,
  closeSeoAuditWorker,
} from '../modules/seo/jobs/workers/seo-audit.worker';
import {
  startGscSyncWorker,
  closeGscSyncWorker,
} from '../modules/seo/jobs/workers/gsc-sync.worker';
import { logger } from '../utils/logger';

export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startWebhookWorker();
  startFulfillmentWorker();
  startPromotionsWorker();
  startReviewsWorker();
  startSeoAuditWorker();
  startGscSyncWorker(); // processes manual GSC syncs; idle unless GSC is configured
  logger.info('BullMQ workers registered');
};

export const closeWorkers = async (): Promise<void> => {
  await closePaymentWorker();
  await closeInvoiceWorker();
  await closeWalletWorker();
  await closeWebhookWorker();
  await closeFulfillmentWorker();
  await closePromotionsWorker();
  await closeReviewsWorker();
  await closeSeoAuditWorker();
  await closeGscSyncWorker();
  logger.info('BullMQ workers closed');
};
