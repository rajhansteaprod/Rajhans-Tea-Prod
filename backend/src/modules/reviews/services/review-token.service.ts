import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../../../loaders';
import { config } from '../../../config';
import { IOrderDoc } from '../../inventory/models/order.model';

// Review tokens live for 2 months after the order is delivered.
const TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days
const TOKEN_KEY = (token: string) => `review:token:${token}`;
const ORDER_GUARD_KEY = (orderId: string) => `review:order:${orderId}`;
const DONE = 'done';

export interface ReviewTokenProduct {
  productId: string;
  name: string;
  image: string | null;
  reviewed: boolean;
}

export interface ReviewTokenPayload {
  orderId: string;
  orderNumber: string;
  products: ReviewTokenProduct[];
}

export class ReviewTokenService {
  private get redis() {
    return getRedisClient();
  }

  /** Absolute, shareable review URL (used in My Orders and WhatsApp messages). */
  buildUrl(token: string): string {
    return `${config.app.frontendUrl}/review/${token}`;
  }

  /**
   * Ensure a review token exists for a delivered order and return it.
   * Idempotent: returns the existing token if one is active, and returns null
   * if every product in the order has already been reviewed (token consumed).
   */
  async mintForOrder(order: IOrderDoc): Promise<string | null> {
    const orderId = order._id.toString();
    const guardKey = ORDER_GUARD_KEY(orderId);
    const token = uuidv4();

    // Atomically claim the mint. NX succeeds only if no guard exists yet.
    const claimed = await this.redis.set(guardKey, token, 'EX', TOKEN_TTL_SECONDS, 'NX');

    if (claimed !== 'OK') {
      // A guard already exists — either an active token or the 'done' marker.
      const existing = await this.redis.get(guardKey);
      if (!existing || existing === DONE) return null;
      return existing;
    }

    // Deduplicate products by productId — an order may repeat a product across
    // variants, but we ask for one review per distinct product.
    const seen = new Set<string>();
    const products: ReviewTokenProduct[] = [];
    for (const item of order.items) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      products.push({
        productId: item.productId,
        name: item.name,
        image: item.image ?? null,
        reviewed: false,
      });
    }

    const payload: ReviewTokenPayload = {
      orderId,
      orderNumber: order.orderNumber,
      products,
    };

    await this.redis.set(TOKEN_KEY(token), JSON.stringify(payload), 'EX', TOKEN_TTL_SECONDS);
    return token;
  }

  /** Return the active token's payload, or null if expired/consumed/invalid. */
  async getPayload(token: string): Promise<ReviewTokenPayload | null> {
    const raw = await this.redis.get(TOKEN_KEY(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ReviewTokenPayload;
    } catch {
      return null;
    }
  }

  /** True if the token is valid and this product hasn't been reviewed yet. */
  async assertProductReviewable(token: string, productId: string): Promise<ReviewTokenPayload> {
    const payload = await this.getPayload(token);
    if (!payload) throw new Error('INVALID_TOKEN');
    const product = payload.products.find((p) => p.productId === productId);
    if (!product) throw new Error('PRODUCT_NOT_IN_ORDER');
    if (product.reviewed) throw new Error('ALREADY_REVIEWED');
    return payload;
  }

  /**
   * Mark one product reviewed. When the last product is reviewed the token is
   * deleted (URL expires) and the order guard flips to 'done' so it is never
   * re-minted.
   */
  async markProductReviewed(token: string, productId: string): Promise<void> {
    const payload = await this.getPayload(token);
    if (!payload) return;

    const product = payload.products.find((p) => p.productId === productId);
    if (product) product.reviewed = true;

    const allReviewed = payload.products.every((p) => p.reviewed);
    if (allReviewed) {
      await this.redis.del(TOKEN_KEY(token));
      await this.redis.set(ORDER_GUARD_KEY(payload.orderId), DONE, 'EX', TOKEN_TTL_SECONDS);
    } else {
      // Preserve the original TTL so the 2-month window still counts from delivery.
      await this.redis.set(TOKEN_KEY(token), JSON.stringify(payload), 'KEEPTTL');
    }
  }

  /**
   * Read-only lookup of an order's active review URL without minting.
   * Returns null when no token is active (never delivered, or fully reviewed).
   */
  async getActiveUrlForOrder(orderId: string): Promise<string | null> {
    const guard = await this.redis.get(ORDER_GUARD_KEY(orderId));
    if (!guard || guard === DONE) return null;
    return this.buildUrl(guard);
  }
}

export const reviewTokenService = new ReviewTokenService();
