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
import { DiscountService } from '../../discounts/services/discount.service';
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
  private discountService = new DiscountService();
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

    try {
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

        // Stale 'created' — mark failed; never touch captured/terminal records
        if (existing.status === 'created') {
          await this.paymentRepo.updateStatus(existing._id.toString(), 'failed');
        }
        // Generate new unique idempotency key
        idempotencyKey = `${idempotencyKey}-${Date.now()}`;
      }

      // Reserve stock FIRST — never freeze a price for items we cannot fulfil
      const stockResult = await this.checkoutService.reserveStock(sessionId, items);
      if (stockResult.issues.length > 0) {
        throw new BadRequestError('Some items are out of stock');
      }

      // SINGLE SOURCE OF TRUTH: freeze the full pricing breakdown, coupon
      // included. snapshot.total is the exact amount to collect (before
      // wallet / loyalty payment methods).
      const frozenPricing = await this.checkoutService.freezePrice(sessionId, items, promoCode);
      const summary = frozenPricing.summary;

    // Coupon comes from the frozen summary — no recomputation, no drift.
    // Usage is recorded on CAPTURE (not here), so abandoned payments don't
    // burn coupon usage limits.
    const discountId = summary.couponId;
    const discountPaise = Math.round(summary.couponDiscount * 100);
    const discountType = summary.couponType ?? undefined;

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

    // Amount still to collect = frozen total (coupon already applied) - loyalty
    const totalPaise = Math.round(summary.total * 100) - loyaltyDiscountPaise;
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

    // Fully covered without Razorpay (wallet and/or 100% discount) — debit
    // wallet NOW only if there is actually something to deduct
    if (razorpayAmountPaise <= 0 && userId) {
      if (walletDeductPaise > 0) {
        await this.walletService.debit(
          userId,
          walletDeductPaise / 100,
          'purchase',
          idempotencyKey,
          `Order payment (wallet)`,
          `wallet-debit-${idempotencyKey}`,
        );
      }
      const payment = await this.paymentRepo.create({
        sessionId,
        userId: userId ? (userId as never) : null,
        // Hash the FULL key — a truncated prefix collides across retries of
        // the same session+address (retry suffix lands beyond the cut)
        razorpayOrderId: `wallet_${crypto.createHash('md5').update(idempotencyKey).digest('hex').slice(0, 24)}`,
        amountPaise: totalPaise,
        walletDeductPaise,
        loyaltyPointsUsed,
        loyaltyDiscountPaise,
        promoCode: summary.couponCode ?? undefined,
        discountId: discountId as never,
        discountType,
        discountPaise,
        currency: 'INR',
        status: 'captured',
        checkoutSnapshot: this.buildCheckoutSnapshot(summary),
        shippingAddress: address,
        idempotencyKey,
        priceSnapshotId: frozenPricing.snapshotId as never, // Store reference to frozen price
      });

      // Mark snapshot used + record coupon usage + clear cart + enqueue jobs
      await this.runPostCaptureSideEffects(payment._id.toString(), { skipWalletDebit: true });

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
      checkoutSnapshot: this.buildCheckoutSnapshot(summary),
      shippingAddress: address,
      walletDeductPaise,
      loyaltyPointsUsed,
      loyaltyDiscountPaise,
      promoCode: summary.couponCode ?? undefined,
      discountId: discountId as never,
      discountType,
      discountPaise,
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
    } catch (err) {
      // Cleanup: Release stock if reservation succeeded but order creation failed
      console.error('Order creation failed:', err);
      try {
        await this.releaseStockForPayment(sessionId);
      } catch (cleanupErr) {
        console.error('Stock cleanup failed:', cleanupErr);
      }
      throw err; // Re-throw original error
    }
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
    if (!this.isSignatureValid(`${razorpayOrderId}|${razorpayPaymentId}`, razorpaySignature)) {
      // Query Razorpay before releasing stock — don't assume the payment
      // failed just because the signature check failed.
      const razorpay = getRazorpayClient();
      let paymentCaptured = false;
      try {
        const rzpPayment = await razorpay.payments.fetch(razorpayPaymentId);
        paymentCaptured = rzpPayment.status === 'captured';
      } catch (err) {
        // Can't reach Razorpay — be conservative, don't release stock
        console.error('Failed to verify payment status with Razorpay:', err);
        throw new BadRequestError('Cannot verify payment status. Please contact support.');
      }

      if (!paymentCaptured) {
        // Atomic transition — only the winner releases stock / reverts loyalty
        const failed = await this.paymentRepo.transitionStatus(
          payment._id.toString(),
          ['created', 'authorized'],
          'failed',
        );
        if (failed) {
          await this.releaseStockForPayment(payment.sessionId);
          if (payment.loyaltyPointsUsed > 0 && payment.userId) {
            await this.loyaltyService.revertRedemption(
              payment.userId.toString(),
              payment.loyaltyPointsUsed,
              payment._id.toString(),
            );
          }
        }
      } else {
        console.warn(
          `Payment ${razorpayOrderId} shows captured on Razorpay but signature invalid`,
        );
        await this.paymentRepo.updateFields(payment._id.toString(), {
          lastVerificationError: 'Signature mismatch but Razorpay shows captured',
        });
        throw new BadRequestError('Signature verification failed - contact support');
      }

      throw new BadRequestError('Payment signature verification failed');
    }

    // 3. Atomic capture — exactly ONE caller (client verify, webhook, or
    // retry) wins this transition and runs the side effects. Everyone else
    // gets the idempotent "already captured" response.
    const captured = await this.paymentRepo.transitionStatus(
      payment._id.toString(),
      ['created', 'authorized'],
      'captured',
      {
        razorpayPaymentId,
        razorpaySignature,
        verificationAttempts: (payment.verificationAttempts || 0) + 1,
      },
    );

    if (captured) {
      await this.runPostCaptureSideEffects(payment._id.toString());
    }

    return {
      paymentId: payment._id.toString(),
      status: 'captured',
      amountPaise: payment.amountPaise,
    };
  }

  // ---------------------------------------------------------------------------
  // POST-CAPTURE SIDE EFFECTS (shared by verify, webhook, and wallet paths)
  // Must be idempotent — may run after a retried capture.
  // ---------------------------------------------------------------------------

  private buildCheckoutSnapshot(summary: import('../../cart/services/checkout.service').CheckoutSummary) {
    return {
      items: summary.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        sku: item.sku ?? null,
        name: item.name,
        qty: item.qty,
        unitPrice: item.pricing.unitPrice,
        totalPrice: item.pricing.totalPrice,
      })),
      subtotal: summary.subtotal,
      totalDiscount: summary.totalDiscount + summary.couponDiscount,
      totalTax: summary.totalTax,
      total: summary.total,
    };
  }

  private isSignatureValid(payload: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(payload)
      .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(signature);
    // timingSafeEqual throws on length mismatch — guard first
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
  }

  private async runPostCaptureSideEffects(
    paymentId: string,
    opts: { skipWalletDebit?: boolean } = {},
  ): Promise<void> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment || payment.status !== 'captured') return;

    // 1. Mark price snapshot as used
    if (payment.priceSnapshotId) {
      try {
        const { PriceSnapshotRepository } = await import(
          '../../cart/repositories/price-snapshot.repository'
        );
        await new PriceSnapshotRepository().markAsUsed(
          payment.priceSnapshotId.toString(),
          payment._id.toString(),
        );
      } catch (err) {
        console.warn(`Failed to mark snapshot used for payment ${payment._id}`, err);
      }
    }

    // 2. Record coupon usage exactly once — conditional update on the flag
    // guarantees only one of the (verify | webhook | retry) callers records it
    if (payment.discountId) {
      const { Payment } = await import('../models/payment.model');
      const marked = await Payment.findOneAndUpdate(
        { _id: payment._id, couponUsageRecorded: { $ne: true } },
        { $set: { couponUsageRecorded: true } },
      ).exec();
      if (marked) {
        try {
          await this.discountService.recordUsage(payment.discountId.toString());
        } catch (err) {
          console.error(`Failed to record coupon usage for payment ${payment._id}:`, err);
        }
      }
    }

    // 3. Debit wallet portion (skipped when already debited synchronously)
    if (!opts.skipWalletDebit && payment.walletDeductPaise > 0 && payment.userId) {
      try {
        await this.walletService.debit(
          payment.userId.toString(),
          payment.walletDeductPaise / 100,
          'purchase',
          payment._id.toString(),
          `Order payment (wallet portion)`,
          `wallet-debit-${payment.idempotencyKey}`,
        );
        await this.paymentRepo.updateFields(payment._id.toString(), {
          walletDebitAttempts: (payment.walletDebitAttempts || 0) + 1,
        });
      } catch (walletErr) {
        console.error(`Wallet debit failed for payment ${payment._id}:`, walletErr);
        await this.paymentRepo.updateFields(payment._id.toString(), {
          walletDebitFailed: true,
          walletDebitAttempts: (payment.walletDebitAttempts || 0) + 1,
          lastVerificationError: `Wallet debit failed: ${(walletErr as Error).message}`,
        });
        await getPaymentQueue().add(
          PaymentJobs.COMPENSATE_WALLET_DEBIT,
          { paymentId: payment._id.toString() },
          { delay: 5000, attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
        );
      }
    }

    // 4. Clear cart (purchase complete) — both guest and user carts
    if (payment.userId) {
      await this.cartService.clearCart(payment.userId);
    } else {
      await this.cartService.clearCart(payment.sessionId);
    }

    // 5. Enqueue invoice generation
    await getInvoiceQueue().add(
      InvoiceJobs.GENERATE,
      { paymentId: payment._id.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    // 6. Enqueue order creation (Inventory & Fulfillment) — idempotent
    await getFulfillmentQueue().add(
      FulfillmentJobs.CREATE_ORDER,
      { paymentId: payment._id.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    // 7. Enqueue loyalty earn + referral completion (Promotions)
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
          if (payment) {
            // Atomic transition — no-op when verifyPayment already captured it
            const captured = await this.paymentRepo.transitionStatus(
              payment._id.toString(),
              ['created', 'authorized'],
              'captured',
              { razorpayPaymentId: rpPaymentId },
            );
            if (captured) {
              // Full side effects (wallet debit, coupon usage, snapshot, cart,
              // invoice, fulfillment, loyalty) — handles the case where the
              // client never called verifyPayment
              await this.runPostCaptureSideEffects(payment._id.toString());
            }
          }
        }
      } else if (eventType === 'payment.failed') {
        const rpOrderId = event.payload?.payment?.entity?.order_id;
        if (rpOrderId) {
          const payment = await this.paymentRepo.findByRazorpayOrderId(rpOrderId);
          if (payment) {
            // Atomic transition — only the winner runs the failure cleanup
            const failed = await this.paymentRepo.transitionStatus(
              payment._id.toString(),
              ['created'],
              'failed',
            );
            if (failed) {
              // Revert loyalty points if they were deducted during order creation
              if (payment.loyaltyPointsUsed > 0 && payment.userId) {
                await this.loyaltyService.revertRedemption(
                  payment.userId.toString(),
                  payment.loyaltyPointsUsed,
                  payment._id.toString(),
                );
              }

              // Release stock reservation
              await this.releaseStockForPayment(payment.sessionId);
            }
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
      // Handle webhook processing failure with retry scheduling
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const currentEvent = await this.webhookEventRepo.findByRazorpayEventId(razorpayEventId);

      if (!currentEvent) {
        throw new Error(`WebhookEvent not found for retry: ${razorpayEventId}`);
      }

      const newRetryCount = currentEvent.retryCount + 1;
      const maxRetries = currentEvent.maxRetries || 5;

      // Check if max retries exceeded
      if (newRetryCount > maxRetries) {
        // Mark as dead lettered (will be handled in US-09)
        await this.webhookEventRepo.markAsDeadLettered(webhookEventId, errorMessage);
        console.error(
          `💀 Webhook ${razorpayEventId} dead lettered after ${maxRetries} retries:`,
          errorMessage,
        );
        throw error;
      }

      // Calculate exponential backoff with jitter
      // Formula: delay = baseDelay * (2 ^ retryCount) + random jitter
      const baseDelayMs = 5000; // 5 seconds
      const exponentialDelay = baseDelayMs * Math.pow(2, newRetryCount - 1);
      const jitterMs = Math.random() * exponentialDelay * 0.1; // 10% jitter
      const totalDelayMs = exponentialDelay + jitterMs;

      // Schedule next retry
      const nextRetryAt = new Date(Date.now() + totalDelayMs);

      await this.webhookEventRepo.scheduleRetry(webhookEventId, nextRetryAt, errorMessage);

      console.error(
        `⏰ Webhook ${razorpayEventId} scheduled for retry ${newRetryCount}/${maxRetries}`,
        `in ${Math.round(totalDelayMs / 1000)}s:`,
        errorMessage,
      );

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK RETRY PROCESSING (scheduled job)
  // ---------------------------------------------------------------------------

  async processFailedWebhooksForRetry(): Promise<{ requeued: number; failed: number }> {
    // Find all failed webhooks that are ready for retry
    const failedWebhooks = await this.webhookEventRepo.findFailedForRetry();

    let requeued = 0;
    let failed = 0;

    for (const webhook of failedWebhooks) {
      try {
        // Re-enqueue to webhook queue for processing
        await getWebhookQueue().add(
          WebhookJobs.PROCESS,
          {
            rawBody: JSON.stringify(webhook.payload),
            signature: '', // Signature already verified in handleWebhook
            razorpayEventId: webhook.razorpayEventId,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        // Mark as processing again
        await this.webhookEventRepo.updateRetryInfo(webhook._id.toString(), {
          status: 'processing',
        });

        requeued++;
        console.log(
          `♻️  Webhook ${webhook.razorpayEventId} re-enqueued (retry ${webhook.retryCount + 1})`,
        );
      } catch (error) {
        failed++;
        console.error(
          `❌ Failed to re-enqueue webhook ${webhook.razorpayEventId}:`,
          (error as Error).message,
        );
      }
    }

    console.log(
      `📊 Webhook retry processing: ${requeued} requeued, ${failed} failed to requeue`,
    );

    return { requeued, failed };
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
  // DEAD LETTER QUEUE MANAGEMENT (admin APIs)
  // ---------------------------------------------------------------------------

  async getWebhookStats() {
    return this.webhookEventRepo.getStats();
  }

  async listDeadLetteredWebhooks(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const webhooks = await (require('../models/webhook-event.model').WebhookEvent)
      .find({ status: 'dead_lettered' })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await (require('../models/webhook-event.model').WebhookEvent).countDocuments({
      status: 'dead_lettered',
    });

    return {
      webhooks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWebhookDetail(webhookId: string) {
    return this.webhookEventRepo.findById(webhookId);
  }

  async retryDeadLetteredWebhook(webhookId: string) {
    const webhook = await this.webhookEventRepo.findById(webhookId);

    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    if (webhook.status !== 'dead_lettered') {
      throw new BadRequestError(
        `Cannot retry webhook with status "${webhook.status}". Only dead_lettered webhooks can be retried.`,
      );
    }

    // Reset retry count and status, re-enqueue
    await this.webhookEventRepo.updateRetryInfo(webhookId, {
      status: 'processing',
      retryCount: 0,
      processingError: null,
      nextRetryAt: null,
    });

    // Re-enqueue to webhook queue
    await getWebhookQueue().add(
      WebhookJobs.PROCESS,
      {
        rawBody: JSON.stringify(webhook.payload),
        signature: '',
        razorpayEventId: webhook.razorpayEventId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    console.log(`🔄 Dead lettered webhook ${webhook.razorpayEventId} manually re-enqueued for processing`);

    return {
      webhookId,
      razorpayEventId: webhook.razorpayEventId,
      status: 'processing',
      message: 'Webhook re-enqueued for processing with reset retry count',
    };
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
  // REFUND & COMPENSATION
  // ---------------------------------------------------------------------------

  /**
   * Compensation job: retry wallet debit if it failed during payment verification
   */
  async compensateWalletDebit(paymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment || payment.status !== 'captured') {
      return; // Payment not in captured state, skip
    }

    if (!payment.walletDebitFailed || payment.walletDeductPaise === 0) {
      return; // No need to compensate
    }

    try {
      await this.walletService.debit(
        payment.userId!.toString(),
        payment.walletDeductPaise / 100,
        'purchase',
        payment._id.toString(),
        `Order payment (wallet portion) - Retry`,
        `wallet-debit-retry-${payment.idempotencyKey}`,
      );

      await this.paymentRepo.updateFields(paymentId, {
        walletDebitFailed: false,
        walletDebitAttempts: 0,
      });

      console.log(`Wallet debit compensation successful for payment ${paymentId}`);
    } catch (err) {
      console.error(`Wallet debit compensation failed for payment ${paymentId}:`, err);
      // Will retry via job queue exponential backoff
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private async releaseStockForPayment(sessionId: string): Promise<void> {
    await StockReservation.deleteMany({ sessionId }).exec();
  }
}
