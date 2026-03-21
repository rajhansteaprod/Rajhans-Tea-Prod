import { CartRepository } from '../repositories/cart.repository';
import { StockReservationRepository } from '../repositories/stock-reservation.repository';
import { PricingService, PriceBreakdown } from './pricing.service';
import { BadRequestError } from '../utils/api-error';
import { IProductDoc } from '../models/product.model';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  productId: string;
  name: string;
  slug: string;
  image: string;
  qty: number;
  pricing: PriceBreakdown;
}

export interface CheckoutSummary {
  sessionId: string;
  items: CheckoutLineItem[];
  subtotal: number; // sum of priceAfterDiscount * qty (before tax)
  totalDiscount: number; // sum of discountAmount * qty
  totalTax: number; // sum of taxAmount * qty
  total: number; // sum of totalPrice
  itemCount: number;
}

export interface StockIssue {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CheckoutService {
  private cartRepo = new CartRepository();
  private reservationRepo = new StockReservationRepository();
  private pricingService = new PricingService();

  // ---------------------------------------------------------------------------
  // CHECKOUT SUMMARY
  // Loads cart, runs pricing engine on each item, returns full breakdown
  // ---------------------------------------------------------------------------

  async getSummary(sessionId: string): Promise<CheckoutSummary> {
    const cart = await this.cartRepo.findBySession(sessionId);

    if (!cart || cart.items.length === 0) {
      return {
        sessionId,
        items: [],
        subtotal: 0,
        totalDiscount: 0,
        totalTax: 0,
        total: 0,
        itemCount: 0,
      };
    }

    const lineItems: CheckoutLineItem[] = [];

    for (const item of cart.items) {
      const product = item.productId as unknown as IProductDoc;
      const categoryId = product.category?.toString();
      const collectionIds = (product.collections ?? []).map((c) => c.toString());

      const pricing = await this.pricingService.calculate({
        productId: product._id.toString(),
        basePrice: product.basePrice,
        categoryId,
        collectionIds,
        qty: item.qty,
      });

      lineItems.push({
        productId: product._id.toString(),
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] ?? '',
        qty: item.qty,
        pricing,
      });
    }

    const subtotal = lineItems.reduce((s, i) => s + i.pricing.priceAfterDiscount * i.qty, 0);
    const totalDiscount = lineItems.reduce((s, i) => s + i.pricing.discountAmount * i.qty, 0);
    const totalTax = lineItems.reduce((s, i) => s + i.pricing.taxAmount * i.qty, 0);
    const total = lineItems.reduce((s, i) => s + i.pricing.totalPrice, 0);

    return {
      sessionId,
      items: lineItems,
      subtotal: +subtotal.toFixed(2),
      totalDiscount: +totalDiscount.toFixed(2),
      totalTax: +totalTax.toFixed(2),
      total: +total.toFixed(2),
      itemCount: lineItems.reduce((s, i) => s + i.qty, 0),
    };
  }

  // ---------------------------------------------------------------------------
  // RESERVE STOCK
  // Checks availability, creates reservations (15-min TTL), returns issues if any
  // ---------------------------------------------------------------------------

  async reserveStock(sessionId: string): Promise<{ issues: StockIssue[] }> {
    const cart = await this.cartRepo.findBySession(sessionId);

    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    const issues: StockIssue[] = [];

    for (const item of cart.items) {
      const product = item.productId as unknown as IProductDoc;

      // Only check stock if tracking is enabled
      if (product.trackInventory) {
        const reserved = await this.reservationRepo.sumReservedQty(
          product._id.toString(),
          sessionId, // exclude own previous reservation
        );
        const available = product.stock - reserved;

        if (available < item.qty) {
          issues.push({
            productId: product._id.toString(),
            name: product.name,
            requested: item.qty,
            available: Math.max(0, available),
          });
        }
      }
    }

    if (issues.length > 0) {
      return { issues };
    }

    // All items available — create/refresh reservations
    for (const item of cart.items) {
      const product = item.productId as unknown as IProductDoc;
      if (product.trackInventory) {
        await this.reservationRepo.reserve(sessionId, product._id.toString(), item.qty);
      }
    }

    return { issues: [] };
  }

  // ---------------------------------------------------------------------------
  // RELEASE STOCK RESERVATION
  // ---------------------------------------------------------------------------

  async releaseReservation(sessionId: string): Promise<void> {
    await this.reservationRepo.releaseBySession(sessionId);
  }
}
