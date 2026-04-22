import crypto from 'crypto';
import { config } from '../../../config';
import { getRazorpayClient } from '../../../loaders/razorpay.loader';
import { PaymentRepository } from '../repositories/payment.repository';
import { WebhookEventRepository } from '../repositories/webhook-event.repository';
import { CheckoutService } from '../../cart/services/checkout.service';
import { CartService } from '../../cart/services/cart.service';
import { getInvoiceQueue, InvoiceJobs } from '../jobs/queues/invoice.queue';
import { getPaymentQueue, PaymentJobs } from '../jobs/queues/payment.queue';
import { getWalletQueue, WalletJobs } from '../jobs/queues/wallet.queue';
import { getWebhookQueue, WebhookJobs } from '../jobs/queues/webhook.queue';
import {
  getFulfillmentQueue,
  FulfillmentJobs,
} from '../../inventory/jobs/queues/fulfillment.queue';
import { getPromotionsQueue, PromotionJobs } from '../../promotions/jobs/queues/promotions.queue';
import { WalletService } from './wallet.service';
import { LoyaltyService } from '../../promotions/services/loyalty.service';
import { PromoCodeService } from '../../promo/services/promo.service';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';
import { IShippingAddress } from '../models/payment.model';
import { StockReservation } from '../../cart/models/stock-reservation.model';

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
  private webhookEventRepo = new WebhookEventRepository();
  private promoService = new PromoCodeService();
  private checkoutService = new CheckoutService();
  private cartService = new CartService();
  private walletService = new WalletService();
  private loyaltyService = new LoyaltyService();

  // ---------------------------------------------------------------------------
  // CREATE RAZORPAY ORDER
  // ---------------------------------------------------------------------------

  async createOrder(
    sessionId: string,
    userId: string | null,
    address: IShippingAddress,
    idempotencyKey_: string,
    walletAmount = 0,
    loyaltyPoints = 0,
    items?: any[],
    promoCode?: string,
  ): Promise<CreateOrderResult | { paymentId: string; paidViaWallet: true }> {
    let idempotencyKey = idempotencyKey_;

    // Idempotency — return existing if still valid (created + fresh < 25 min)
    const existing = await this.paymentRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      const ageMs = Date.now() - new Date(existing.createdAt).getTime();
      const isFresh = ageMs < 25 * 60 * 1000;

      if (existing.status === 'created' && isFresh) {
        return {
          paymentId: existing._id.toString(),
          razorpayOrderId: existing.razorpayOrderId,
          amountPaise: existing.amountPaise,
          currency: existing.currency,
          keyId: config.razorpay.keyId,
        };
      }

      // Stale or failed — delete old and create fresh
      await this.paymentRepo.updateStatus(existing._id.toString(), 'failed');
      // Generate new unique idempotency key
      idempotencyKey = `${idempotencyKey}-${Date.now()}`;
    }

    // OPTION A: Freeze prices (no recomputation)
    // Pass items if provided (from temporary cart), else fetch from session
    console.log('🛒 DEBUG: Creating order', {
      sessionId,
      userId,
      providedItems: items?.length ?? 0,
      itemsArray: items,
    });

    const frozenPricing = await this.checkoutService.freezePrice(sessionId, items);
    console.log('❄️ DEBUG: Price frozen', {
      snapshotId: frozenPricing.snapshotId,
      total: frozenPricing.total,
      expiresAt: frozenPricing.expiresAt,
    });

    if (frozenPricing.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // Reserve stock (pass items so it uses provided items from frontend)
    const stockResult = await this.checkoutService.reserveStock(sessionId, items);
    if (stockResult.issues.length > 0) {
      throw new BadRequestError('Some items are out of stock');
    }

    // Create a summary-like object from frozen pricing for compatibility
    const summary = {
      sessionId,
      items: frozenPricing.items,
      subtotal: frozenPricing.items.reduce((s, i) => s + i.pricing.priceAfterDiscount * i.qty, 0),
      totalDiscount: frozenPricing.items.reduce((s, i) => s + i.pricing.discountAmount * i.qty, 0),
      totalTax: frozenPricing.items.reduce((s, i) => s + i.pricing.taxAmount * i.qty, 0),
      total: frozenPricing.total,
      itemCount: frozenPricing.items.reduce((s, i) => s + i.qty, 0),
    };

    // Validate and calculate promo discount (if applicable)
    let promoCodeId: any = null;
    let promoDiscountPaise = 0;

    if (promoCode) {
      const validation = await this.promoService.validatePromoCode(promoCode);
      if (!validation.valid) {
        throw new BadRequestError(validation.error || 'Invalid promo code');
      }

      const discount = this.promoService.calculateDiscount(
        validation.code!,
        summary.total,
      );
      promoDiscountPaise = Math.round(discount.discountAmount * 100);
      promoCodeId = validation.code!._id;
    }

    // Calculate loyalty discount (if applicable)
    let loyaltyPointsUsed = 0;
    let loyaltyDiscountPaise = 0;

    if (loyaltyPoints > 0 && userId) {
      const redemption = await this.loyaltyService.calculateRedemption(
        userId,
        loyaltyPoints,
        summary.total,
      );
      if (redemption.valid) {
        loyaltyPointsUsed = redemption.points;
        loyaltyDiscountPaise = Math.round(redemption.discount * 100);
      }
    }

    // Calculate wallet deduction (if applicable)
    // Total = summary - promo - loyalty
    const totalPaise = Math.round(summary.total * 100) - promoDiscountPaise - loyaltyDiscountPaise;
    let walletDeductPaise = 0;

    if (walletAmount > 0 && userId) {
      const balance = await this.walletService.getBalance(userId);
      walletDeductPaise = Math.min(
        Math.round(walletAmount * 100),
        totalPaise,
        Math.round(balance * 100),
      );
    }

    const razorpayAmountPaise = totalPaise - walletDeductPaise;

    // Deduct loyalty points BEFORE payment (if applicable)
    if (loyaltyPointsUsed > 0 && userId) {
      await this.loyaltyService.redeemPoints(userId, loyaltyPointsUsed, idempotencyKey);
    }

    // Full wallet payment — debit wallet NOW, no Razorpay needed
    if (razorpayAmountPaise <= 0 && userId) {
      await this.walletService.debit(
        userId,
        walletDeductPaise / 100,
        'purchase',
        idempotencyKey,
        `Order payment (wallet)`,
        `wallet-debit-${idempotencyKey}`,
      );
      const payment = await this.paymentRepo.create({
        sessionId,
        userId: userId ? (userId as never) : null,
        razorpayOrderId: `wallet_${idempotencyKey.slice(0, 20)}`,
        amountPaise: totalPaise + promoDiscountPaise + loyaltyDiscountPaise,
        walletDeductPaise,
        loyaltyPointsUsed,
        loyaltyDiscountPaise,
        promoCode,
        promoCodeId,
        promoDiscountPaise,
        currency: 'INR',
        status: 'captured',
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
        priceSnapshotId: frozenPricing.snapshotId as never, // Store reference to frozen price
      });

      await this.cartService.clearCart(sessionId);
      await getInvoiceQueue().add(
        InvoiceJobs.GENERATE,
        { paymentId: payment._id.toString() },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      await getFulfillmentQueue().add(
        FulfillmentJobs.CREATE_ORDER,
        { paymentId: payment._id.toString() },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      return { paymentId: payment._id.toString(), paidViaWallet: true };
    }

    // Partial or no wallet — create Razorpay order for remaining
    // Wallet is NOT debited here — only after Razorpay payment is verified
    const amountPaise = razorpayAmountPaise;
    const razorpay = getRazorpayClient();

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
      walletDeductPaise,
      loyaltyPointsUsed,
      loyaltyDiscountPaise,
      promoCode,
      promoCodeId,
      promoDiscountPaise,
      idempotencyKey,
      priceSnapshotId: frozenPricing.snapshotId as never, // Store reference to frozen price
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
      // Revert loyalty points if they were deducted during order creation
      if (payment.loyaltyPointsUsed > 0 && payment.userId) {
        await this.loyaltyService.revertRedemption(
          payment.userId.toString(),
          payment.loyaltyPointsUsed,
          payment._id.toString(),
        );
      }
      throw new BadRequestError('Payment signature verification failed');
    }

    // 3. Mark as captured
    await this.paymentRepo.updateStatus(payment._id.toString(), 'captured', {
      razorpayPaymentId,
      razorpaySignature,
    });

    // 3b. Mark price snapshot as used (Option A: frozen pricing)
    if (payment.priceSnapshotId) {
      const snapshotRepo = new (require('../../cart/repositories/price-snapshot.repository').PriceSnapshotRepository)();
      await snapshotRepo.markAsUsed(payment.priceSnapshotId.toString(), payment._id.toString());
    }

    // 4. Debit wallet NOW (Razorpay confirmed — safe to deduct)
    if (payment.walletDeductPaise > 0 && payment.userId) {
      await this.walletService.debit(
        payment.userId.toString(),
        payment.walletDeductPaise / 100,
        'purchase',
        payment._id.toString(),
        `Order payment (wallet portion)`,
        `wallet-debit-${payment.idempotencyKey}`,
      );
    }

    // 5. Clear cart (purchase complete)
    await this.cartService.clearCart(payment.sessionId);

    // 6. Enqueue invoice generation
    await getInvoiceQueue().add(
      InvoiceJobs.GENERATE,
      { paymentId: payment._id.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    // 7. Enqueue order creation (Inventory & Fulfillment)
    await getFulfillmentQueue().add(
      FulfillmentJobs.CREATE_ORDER,
      { paymentId: payment._id.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    // 8. Enqueue loyalty earn + referral completion (Promotions)
    if (payment.userId) {
      await getPromotionsQueue().add(
        PromotionJobs.EARN_LOYALTY,
        {
          userId: payment.userId.toString(),
          orderTotal: payment.amountPaise / 100,
          paymentId: payment._id.toString(),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
      );
      await getPromotionsQueue().add(
        PromotionJobs.COMPLETE_REFERRAL,
        { refereeUserId: payment.userId.toString(), paymentId: payment._id.toString() },
        { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
      );
    }

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
    // 1. Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!isValid) {
      throw new BadRequestError('Webhook signature invalid');
    }

    const event = JSON.parse(rawBody);
    const razorpayEventId = event.id as string; // Unique event ID from Razorpay
    const eventType = event.event as string;

    // 2. Idempotency guard — check if this webhook has already been processed
    const existingEvent = await this.webhookEventRepo.findByRazorpayEventId(razorpayEventId);
    if (existingEvent) {
      // Already processed or currently processing — return immediately (idempotent)
      if (existingEvent.status === 'processed' || existingEvent.status === 'processing') {
        console.log(`📡 Webhook ${razorpayEventId} already ${existingEvent.status}, skipping`);
        return;
      }
      // If dead_lettered or failed, also skip to avoid repeated failures
      if (existingEvent.status === 'dead_lettered') {
        console.log(`📡 Webhook ${razorpayEventId} is dead lettered, skipping`);
        return;
      }
    }

    // 3. Mark webhook as processing (create or update)
    try {
      await this.webhookEventRepo.create({
        razorpayEventId,
        eventType,
        payload: event.payload || {},
        status: 'processing',
        retryCount: 0,
        maxRetries: 5,
      });
    } catch (error: any) {
      // Race condition: another request already created this webhook event
      // Check if it's a duplicate key error (code 11000)
      if (error.code === 11000) {
        console.log(`📡 Webhook ${razorpayEventId} already being processed by another request`);
        return;
      }
      throw error;
    }

    // 4. Enqueue webhook for async processing (return 200 immediately)
    await getWebhookQueue().add(
      WebhookJobs.PROCESS,
      {
        rawBody,
        signature,
        razorpayEventId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    console.log(`📡 Webhook ${razorpayEventId} enqueued for processing`);
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK PROCESSING (called by webhook worker)
  // ---------------------------------------------------------------------------

  async processWebhookPayload(
    rawBody: string,
    _signature: string,
    razorpayEventId: string,
  ): Promise<void> {
    const event = JSON.parse(rawBody);
    const eventType = event.event as string;

    // Get the webhook event record
    const webhookEvent = await this.webhookEventRepo.findByRazorpayEventId(razorpayEventId);
    if (!webhookEvent) {
      throw new Error(`WebhookEvent not found for ${razorpayEventId}`);
    }

    const webhookEventId = webhookEvent._id.toString();

    try {
      // Process the webhook event
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
            // ✅ Revert loyalty points if they were deducted during order creation
            if (payment.loyaltyPointsUsed > 0 && payment.userId) {
              await this.loyaltyService.revertRedemption(
                payment.userId.toString(),
                payment.loyaltyPointsUsed,
                payment._id.toString(),
              );
            }

            // Release stock reservation
            await this.releaseStockForPayment(payment.sessionId);

            // Mark payment as failed
            await this.paymentRepo.updateStatus(payment._id.toString(), 'failed');
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

      // Mark webhook as successfully processed
      await this.webhookEventRepo.markAsProcessed(webhookEventId);
      console.log(`✅ Webhook ${razorpayEventId} processed successfully`);
    } catch (error) {
      // Mark webhook as failed with error details
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.webhookEventRepo.updateRetryInfo(webhookEventId, {
        status: 'failed',
        processingError: errorMessage,
      });
      console.error(`❌ Webhook ${razorpayEventId} failed:`, errorMessage);
      throw error;
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
  // ADMIN
  // ---------------------------------------------------------------------------

  async getRevenueStats() {
    return this.paymentRepo.getRevenueStats();
  }

  async adminListPayments(
    query: { page?: number; limit?: number; status?: string; search?: string } = {},
  ) {
    return this.paymentRepo.findAllAdmin(query);
  }

  async getPaymentById(paymentId: string) {
    return this.paymentRepo.findById(paymentId);
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private async releaseStockForPayment(sessionId: string): Promise<void> {
    await StockReservation.deleteMany({ sessionId }).exec();
  }
}
