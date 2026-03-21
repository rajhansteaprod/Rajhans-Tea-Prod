import { Router, raw } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { authorize } from '../../../middleware/rbac.middleware';
import { validate } from '../../../middleware/validate.middleware';
import * as ctrl from '../controllers/payment.controller';
import {
  createOrderSchema,
  verifyPaymentSchema,
  refundSchema,
  walletCreditSchema,
} from '../validators/payment.validator';

const router = Router();

// ===========================================================================
// PAYMENT — create & verify (authenticated — guests must login before payment)
// ===========================================================================

router.post('/payments/orders', authenticate, validate(createOrderSchema), ctrl.createOrder);
router.post('/payments/verify', authenticate, validate(verifyPaymentSchema), ctrl.verifyPayment);

// Razorpay webhook — raw body for signature verification, no auth
router.post(
  '/payments/webhook',
  raw({ type: 'application/json' }),
  ctrl.handleWebhook,
);

// Payment history — authenticated
router.get('/payments/history', authenticate, ctrl.getPaymentHistory);

// Refund — admin only
router.post(
  '/payments/:id/refund',
  authenticate,
  authorize('admin'),
  validate(refundSchema),
  ctrl.initiateRefund,
);

// ===========================================================================
// WALLET — authenticated
// ===========================================================================

router.get('/wallet', authenticate, ctrl.getWalletBalance);
router.get('/wallet/transactions', authenticate, ctrl.getWalletTransactions);

// Admin credit — admin only
router.post(
  '/wallet/credit',
  authenticate,
  authorize('admin'),
  validate(walletCreditSchema),
  ctrl.adminCreditWallet,
);

// ===========================================================================
// INVOICES — authenticated
// ===========================================================================

router.get('/invoices', authenticate, ctrl.getUserInvoices);
router.get('/invoices/:id/download', ctrl.downloadInvoice); // public — ObjectId is unguessable

export default router;
