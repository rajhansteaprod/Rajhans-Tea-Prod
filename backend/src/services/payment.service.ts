import crypto from 'crypto';
import { config } from '../config';
import { getRazorpayClient } from '../loaders/razorpay.loader';
import { PaymentRepository } from '../repositories/payment.repository';
import { CheckoutService } from './checkout.service';
import { CartService } from './cart.service';
import { getInvoiceQueue, InvoiceJobs } from '../jobs/queues/invoice.queue';
import { getPaymentQueue, PaymentJobs } from '../jobs/queues/payment.queue';
import { getWalletQueue, WalletJobs } from '../jobs/queues/wallet.queue';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { IShippingAddress } from '../models/payment.model';
import { StockReservation } from '../models/stock-reservation.model';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateOrderResult {
  paymentId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentResult {
  paymentId: string;
  status: string;
  amountPaise: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PaymentService {
  private paymentRepo = new PaymentRepository();
  private checkoutService = new CheckoutService();
  private cartService = new CartService();

  // ---------------------------------------------------------------------------
  // CREATE RAZORPAY ORDER
  // ---------------------------------------------------------------------------

  async createOrder(
    sessionId: string,
    userId: string | null,
    address: IShippingAddress,
    idempotencyKey: string,
  ): Promise<CreateOrderResult> {
    // Idempotency — return existing if already created
    const existing = await this.paymentRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        paymentId: existing._id.toString(),
        razorpayOrderId: existing.razorpayOrderId,
        amountPaise: existing.amountPaise,
        currency: existing.currency,
        keyId: config.razorpay.keyId,
      };
    }

    // Get checkout summary (runs pricing engine)
    const summary = await this.checkoutService.getSummary(sessionId);
    if (summary.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // Reserve stock
    const stockResult = await this.checkoutService.reserveStock(sessionId);
    if (stockResult.issues.length > 0) {
      throw new BadRequestError('Some items are out of stock');
    }

    // Create Razorpay order
    const razorpay = getRazorpayClient();
    const amountPaise = Math.round(summary.total * 100);

    // Razorpay receipt max 40 chars — use short hash of idempotencyKey
    const receipt = `rcpt_${crypto.createHash('md5').update(idempotencyKey).digest('hex').slice(0, 24)}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
    });

    // Save payment document
    const payment = await this.paymentRepo.create({
      sessionId,
      userId: userId ? (userId as never) : null,
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      currency: 'INR',
      status: 'created',
      checkoutSnapshot: {
        items: summary.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.pricing.unitPrice,
          totalPrice: item.pricing.totalPrice,
        })),
        subtotal: summary.subtotal,
        totalDiscount: summary.totalDiscount,
        totalTax: summary.totalTax,
        total: summary.total,
      },
      shippingAddress: address,
      idempotencyKey,
    });

    // Schedule timeout job — if not verified in 30 min, mark failed & release stock
    await getPaymentQueue().add(
      PaymentJobs.VERIFY_TIMEOUT,
      { paymentId: payment._id.toString() },
      { delay: 30 * 60 * 1000, attempts: 1 },
    );

    return {
      paymentId: payment._id.toString(),
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      currency: 'INR',
      keyId: config.razorpay.keyId,
    };
  }

  // ---------------------------------------------------------------------------
  // VERIFY PAYMENT (after Razorpay checkout modal success callback)
  // ---------------------------------------------------------------------------

  async verifyPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<VerifyPaymentResult> {
    // 1. Find payment
    const payment = await this.paymentRepo.findByRazorpayOrderId(razorpayOrderId);
    if (!payment) throw new NotFoundError('Payment not found');

    // Already captured — idempotent
    if (payment.status === 'captured') {
      return {
        paymentId: payment._id.toString(),
        status: payment.status,
        amountPaise: payment.amountPaise,
      };
    }

    // 2. Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpaySignature),
    );

    if (!isValid) {
      await this.paymentRepo.updateStatus(payment._id.toString(), 'failed');
      await this.releaseStockForPayment(payment.sessionId);
      throw new BadRequestError('Payment signature verification failed');
    }

    // 3. Mark as captured
    await this.paymentRepo.updateStatus(payment._id.toString(), 'captured', {
      razorpayPaymentId,
      razorpaySignature,
    });

    // 4. Clear cart (purchase complete)
    await this.cartService.clearCart(payment.sessionId);

    // 5. Enqueue invoice generation
    await getInvoiceQueue().add(
      InvoiceJobs.GENERATE,
      { paymentId: payment._id.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return {
      paymentId: payment._id.toString(),
      status: 'captured',
      amountPaise: payment.amountPaise,
    };
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK HANDLER (Razorpay sends async events)
  // ---------------------------------------------------------------------------

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );

    if (!isValid) {
      throw new BadRequestError('Webhook signature invalid');
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event as string;

    if (eventType === 'payment.captured') {
      const rpPaymentId = event.payload?.payment?.entity?.id;
      const rpOrderId = event.payload?.payment?.entity?.order_id;
      if (rpOrderId) {
        const payment = await this.paymentRepo.findByRazorpayOrderId(rpOrderId);
        if (payment && payment.status === 'created') {
          await this.paymentRepo.updateStatus(payment._id.toString(), 'captured', {
            razorpayPaymentId: rpPaymentId,
          });
          await this.cartService.clearCart(payment.sessionId);
          await getInvoiceQueue().add(
            InvoiceJobs.GENERATE,
            { paymentId: payment._id.toString() },
            { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
          );
        }
      }
    } else if (eventType === 'payment.failed') {
      const rpOrderId = event.payload?.payment?.entity?.order_id;
      if (rpOrderId) {
        const payment = await this.paymentRepo.findByRazorpayOrderId(rpOrderId);
        if (payment && payment.status === 'created') {
          await this.paymentRepo.updateStatus(payment._id.toString(), 'failed');
          await this.releaseStockForPayment(payment.sessionId);
        }
      }
    } else if (eventType === 'refund.created') {
      const rpPaymentId = event.payload?.refund?.entity?.payment_id;
      const refundId = event.payload?.refund?.entity?.id;
      const amount = event.payload?.refund?.entity?.amount; // in paise
      if (rpPaymentId) {
        const payment = await this.paymentRepo.findByRazorpayPaymentId(rpPaymentId);
        if (payment) {
          await this.paymentRepo.addRefund(payment._id.toString(), {
            razorpayRefundId: refundId,
            amount,
            reason: 'Razorpay webhook',
          });

          // Credit wallet if user has userId
          if (payment.userId) {
            await getWalletQueue().add(WalletJobs.CREDIT, {
              userId: payment.userId.toString(),
              amount: amount / 100, // paise to rupees
              source: 'refund',
              referenceId: payment._id.toString(),
              description: `Refund for payment ${payment.razorpayPaymentId}`,
              idempotencyKey: `refund-${refundId}`,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // INITIATE REFUND
  // ---------------------------------------------------------------------------

  async initiateRefund(paymentId: string, amount: number, reason: string): Promise<void> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
      throw new BadRequestError('Payment cannot be refunded in its current state');
    }

    const amountPaise = Math.round(amount * 100);
    if (payment.refundedAmount + amountPaise > payment.amountPaise) {
      throw new BadRequestError('Refund amount exceeds captured amount');
    }

    const razorpay = getRazorpayClient();
    const refund = await (razorpay.payments as any).refund(payment.razorpayPaymentId!, {
      amount: amountPaise,
    });

    await this.paymentRepo.addRefund(paymentId, {
      razorpayRefundId: refund.id,
      amount: amountPaise,
      reason,
    });

    const newRefundedTotal = payment.refundedAmount + amountPaise;
    const newStatus = newRefundedTotal >= payment.amountPaise ? 'refunded' : 'partially_refunded';
    await this.paymentRepo.updateStatus(paymentId, newStatus);

    // Credit wallet
    if (payment.userId) {
      await getWalletQueue().add(WalletJobs.CREDIT, {
        userId: payment.userId.toString(),
        amount,
        source: 'refund',
        referenceId: paymentId,
        description: `Refund: ${reason}`,
        idempotencyKey: `refund-${refund.id}`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // PAYMENT HISTORY
  // ---------------------------------------------------------------------------

  async getHistory(userId: string, query: { page?: number; limit?: number } = {}) {
    return this.paymentRepo.findByUserId(userId, query);
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private async releaseStockForPayment(sessionId: string): Promise<void> {
    await StockReservation.deleteMany({ sessionId }).exec();
  }
}
