import { CartRepository } from '../repositories/cart.repository';
import { StockReservationRepository } from '../repositories/stock-reservation.repository';
import { PriceSnapshotRepository } from '../repositories/price-snapshot.repository';
import { PricingService, PriceBreakdown } from '../../pricing/services/pricing.service';
import { BadRequestError } from '../../../utils/api-error';
import { IProductDoc } from '../../catalog/models/product.model';

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
  private snapshotRepo = new PriceSnapshotRepository();

  // ---------------------------------------------------------------------------
  // CHECKOUT SUMMARY
  // Loads cart, runs pricing engine on each item, returns full breakdown
  // ---------------------------------------------------------------------------

  async getSummary(sessionId: string, providedItems?: any[]): Promise<CheckoutSummary> {
    // Use provided items (from temporary cart) or fetch from session
    let cartItems = providedItems;

    if (!cartItems) {
      const cart = await this.cartRepo.findBySession(sessionId);
      cartItems = cart?.items ?? [];
    }

    if (!cartItems || cartItems.length === 0) {
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

    for (const item of cartItems) {
      // Handle both database documents and plain objects from request
      const productId = item.productId || item.productId;
      const variantId = item.variantId;
      const qty = item.qty;

      // Fetch product details
      const Product = require('../../catalog/models/product.model').Product;
      const product = await Product.findById(productId).lean();

      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      // Use variant price if variant selected, otherwise use base price
      let finalPrice = product.discountedPrice ?? product.price;
      if (variantId) {
        const ProductVariant = require('../../catalog/models/product-variant.model').ProductVariant;
        const variant = await ProductVariant.findById(variantId).lean();
        if (variant) {
          finalPrice = variant.discountedPrice ?? variant.price;
        }
      }

      const categoryId = product.category?.toString();
      const collectionIds = (product.collections ?? []).map((c: any) => c.toString());

      const pricing = await this.pricingService.calculate({
        productId: product._id.toString(),
        basePrice: finalPrice,
        categoryId,
        collectionIds,
        qty,
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

  async reserveStock(
    sessionId: string,
    providedItems?: Array<{ productId: string; variantId?: string; qty: number }>,
  ): Promise<{ issues: StockIssue[] }> {
    let items: any[] = providedItems || [];

    // Use provided items (from frontend) or fetch from session cart
    if (items.length === 0) {
      const sessionCart = await this.cartRepo.findBySession(sessionId);
      items = sessionCart?.items ?? [];
    }

    if (items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    const issues: StockIssue[] = [];
    const Product = require('../../catalog/models/product.model').Product;

    for (const item of items) {
      // Handle both database documents and plain objects from request
      let product: IProductDoc;

      if (typeof item.productId === 'string') {
        // From frontend: plain productId string
        product = await Product.findById(item.productId).lean();
      } else {
        // From database: already populated IProductDoc
        product = item.productId as unknown as IProductDoc;
      }

      if (!product) {
        throw new Error(`Product not found`);
      }

      // Check stock from variant if variantId provided, otherwise from product
      let trackInventory = product.trackInventory;
      let availableStock = product.stock ?? 999;

      if (item.variantId) {
        const ProductVariant = require('../../catalog/models/product-variant.model').ProductVariant;
        const variant = await ProductVariant.findById(item.variantId).lean();
        if (variant) {
          trackInventory = variant.trackInventory;
          availableStock = variant.stock;
        }
      }

      if (trackInventory) {
        const reserved = await this.reservationRepo.sumReservedQty(
          product._id.toString(),
          sessionId, // exclude own previous reservation
        );
        const available = availableStock - reserved;

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
    for (const item of items) {
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

  // ---------------------------------------------------------------------------
  // FREEZE PRICE (Option A: Frozen pricing without coupon)
  // Persists the computed price breakdown with 15-min TTL
  // Invalidates any previous active snapshot for the same session
  // ---------------------------------------------------------------------------

  async freezePrice(
    sessionId: string,
    providedItems?: any[],
  ): Promise<{
    snapshotId: string;
    total: number;
    items: CheckoutLineItem[];
    expiresAt: Date;
  }> {
    // 1. Get current checkout summary (reuses existing pricing logic)
    const summary = await this.getSummary(sessionId, providedItems);

    if (summary.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // 2. Invalidate previous ACTIVE snapshots for this session
    await this.snapshotRepo.invalidatePreviousActive(sessionId);

    // 3. Create new snapshot with 45-min TTL (extended from 15 min for payment verification window)
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 minutes
    const snapshot = await this.snapshotRepo.create({
      sessionId,
      items: summary.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.pricing.unitPrice,
        totalPrice: item.pricing.totalPrice,
        appliedRule: item.pricing.appliedRule,
        discountPercent: item.pricing.discountPercent,
        discountAmount: item.pricing.discountAmount,
        taxRate: item.pricing.taxRate,
      })),
      subtotal: summary.subtotal,
      totalDiscount: summary.totalDiscount,
      totalTax: summary.totalTax,
      total: summary.total,
      status: 'active',
      expiresAt,
      usedByPaymentId: null,
    });

    return {
      snapshotId: snapshot._id.toString(),
      total: snapshot.total,
      items: summary.items,
      expiresAt: snapshot.expiresAt,
    };
  }
}
