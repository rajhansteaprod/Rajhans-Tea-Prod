import { Request, Response } from 'express';
import { PaymentService } from './services/payment.service';
import { WalletService } from './services/wallet.service';
import { InvoiceService } from './services/invoice.service';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/api-error';
import crypto from 'crypto';

const paymentService = new PaymentService();
const walletService = new WalletService();
const invoiceService = new InvoiceService();

function getSessionId(req: Request): string {
  const sid = req.headers['x-session-id'];
  if (!sid || typeof sid !== 'string' || sid.trim() === '') {
    throw new BadRequestError('X-Session-ID header is required');
  }
  return sid.trim();
}

// ---------------------------------------------------------------------------
// PAYMENT
// ---------------------------------------------------------------------------

export const createOrder = async (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const userId = req.user?.userId ?? null;
  const { address, walletAmount, loyaltyPoints } = req.body;

  // Idempotency key: derived from sessionId + address hash (prevents double payment for same cart)
  const addressHash = crypto
    .createHash('md5')
    .update(JSON.stringify(address))
    .digest('hex')
    .slice(0, 12);
  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) || `${sessionId}-${addressHash}`;

  const result = await paymentService.createOrder(
    sessionId,
    userId,
    address,
    idempotencyKey,
    walletAmount || 0,
    loyaltyPoints || 0,
  );
  sendCreated(
    res,
    result,
    'paidViaWallet' in result ? 'Paid via wallet' : 'Razorpay order created',
  );
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const result = await paymentService.verifyPayment(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );
  sendSuccess(res, result, 'Payment verified');
};

export const handleWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) {
    throw new BadRequestError('Missing webhook signature');
  }
  const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf-8');
  await paymentService.handleWebhook(rawBody, signature);
  // Razorpay expects 200 OK
  res.status(200).json({ status: 'ok' });
};

export const getPaymentHistory = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { page, limit } = req.query as { page?: string; limit?: string };
  const result = await paymentService.getHistory(userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.payments, result.meta, 'Payment history');
};

export const initiateRefund = async (req: Request, res: Response) => {
  const paymentId = req.params['id'] as string;
  const { amount, reason } = req.body;
  await paymentService.initiateRefund(paymentId, amount, reason);
  sendSuccess(res, { refunded: true }, 'Refund initiated');
};

// ---------------------------------------------------------------------------
// WALLET
// ---------------------------------------------------------------------------

export const getWalletBalance = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const wallet = await walletService.getOrCreateWallet(userId);
  sendSuccess(res, { balance: wallet.balance, currency: wallet.currency });
};

export const getWalletTransactions = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { page, limit } = req.query as { page?: string; limit?: string };
  const result = await walletService.getHistory(userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.transactions, result.meta, 'Wallet transactions');
};

export const adminCreditWallet = async (req: Request, res: Response) => {
  const { userId, amount, description } = req.body;
  const idempotencyKey = `admin-credit-${userId}-${Date.now()}`;
  await walletService.credit(userId, amount, 'admin_credit', null, description, idempotencyKey);
  sendSuccess(res, { credited: true }, 'Wallet credited');
};

// ---------------------------------------------------------------------------
// INVOICES
// ---------------------------------------------------------------------------

export const getUserInvoices = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { page, limit } = req.query as { page?: string; limit?: string };
  const result = await invoiceService.getUserInvoices(userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.invoices, result.meta, 'Invoices');
};

export const downloadInvoice = async (req: Request, res: Response) => {
  const invoiceId = req.params['id'] as string;
  const invoice = await invoiceService.getById(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');

  // Owner check (only if user is authenticated)
  if (req.user && invoice.userId && invoice.userId.toString() !== req.user.userId) {
    throw new ForbiddenError('Access denied');
  }

  if (!invoice.pdfPath) {
    throw new NotFoundError('Invoice PDF not yet generated');
  }

  // Redirect to static file path (served by express.static or nginx)
  res.redirect(invoice.pdfPath);
};

// ---------------------------------------------------------------------------
// ADMIN — Payments Management
// ---------------------------------------------------------------------------

export const adminGetPaymentStats = async (_req: Request, res: Response) => {
  const stats = await paymentService.getRevenueStats();
  sendSuccess(res, stats);
};

export const adminListPayments = async (req: Request, res: Response) => {
  const { page, limit, status, search } = req.query as {
    page?: string;
    limit?: string;
    status?: string;
    search?: string;
  };
  const result = await paymentService.adminListPayments({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    status,
    search,
  });
  sendPaginated(res, result.payments, result.meta, 'Payments');
};

export const adminGetPaymentDetail = async (req: Request, res: Response) => {
  const paymentId = req.params['id'] as string;
  const payment = await paymentService.getPaymentById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  sendSuccess(res, payment);
};

export const adminGetUserWallet = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const wallet = await walletService.getOrCreateWallet(userId);
  const history = await walletService.getHistory(userId, { page: 1, limit: 50 });
  sendSuccess(res, { wallet, transactions: history.transactions });
};

export const adminListInvoices = async (req: Request, res: Response) => {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const result = await invoiceService.getAllInvoices({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.invoices, result.meta, 'Invoices');
};
