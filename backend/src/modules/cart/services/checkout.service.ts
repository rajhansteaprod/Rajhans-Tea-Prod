import { Types } from 'mongoose';
import { CartRepository } from '../repositories/cart.repository';
import { StockReservationRepository } from '../repositories/stock-reservation.repository';
import { PriceSnapshotRepository } from '../repositories/price-snapshot.repository';
import { PricingService, PriceBreakdown } from '../../pricing/services/pricing.service';
import { DiscountService } from '../../discounts/services/discount.service';
import { Product, IProductDoc } from '../../catalog/models/product.model';
import { ProductVariant, IProductVariantDoc } from '../../catalog/models/product-variant.model';
import { BadRequestError } from '../../../utils/api-error';
import { resolveUnitPrice, toMoney } from '../../../utils/price';
import { logger } from '../../../utils/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_QTY_PER_ITEM = 10;
const MAX_ITEMS_PER_CHECKOUT = 50;
const SNAPSHOT_TTL_MINUTES = 45;
export const PRICING_VERSION = 2;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  productId: string;
  variantId?: string;
  variantName?: string;
  sku?: string;
  name: string;
  slug: string;
  image: string;
  qty: number;
  pricing: PriceBreakdown;
}

export interface CheckoutSummary {
  sessionId: string;
  items: CheckoutLineItem[];
  subtotal: number; // sum of priceAfterDiscount * qty (before tax, before coupon)
  totalDiscount: number; // sum of rule discountAmount * qty (excludes coupon)
  totalTax: number; // sum of taxAmount * qty
  itemsTotal: number; // sum of line totalPrice (rules + tax, before coupon)
  couponCode: string | null;
  couponId: string | null;
  couponType: 'promo_code' | 'offer' | null;
  couponDiscount: number; // order-level coupon/offer discount (applied ONCE)
  shippingCost: number;
  total: number; // itemsTotal - couponDiscount + shippingCost (amount to charge)
  itemCount: number;
  promoError?: string; // set when a provided promo/offer could not be applied
}

export interface StockIssue {
  productId: string;
  variantId?: string;
  name: string;
  requested: number;
  available: number;
}

interface NormalizedItem {
  productId: string;
  variantId?: string;
  qty: number;
}

interface ResolvedItem extends NormalizedItem {
  product: IProductDoc;
  variant?: IProductVariantDoc;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CheckoutService {
  private cartRepo = new CartRepository();
  private reservationRepo = new StockReservationRepository();
  private pricingService = new PricingService();
  private discountService = new DiscountService();
  private snapshotRepo = new PriceSnapshotRepository();

  // ---------------------------------------------------------------------------
  // ITEM RESOLUTION
  // Normalizes client-provided items or loads the session/user cart, then
  // validates every product/variant against the live catalog.
  // ---------------------------------------------------------------------------

  private normalizeItems(rawItems: unknown[]): NormalizedItem[] {
    if (rawItems.length > MAX_ITEMS_PER_CHECKOUT) {
      throw new BadRequestError(`A maximum of ${MAX_ITEMS_PER_CHECKOUT} items is allowed per checkout`);
    }

    // De-duplicate on productId+variantId, summing quantities
    const merged = new Map<string, NormalizedItem>();

    for (const raw of rawItems) {
      const item = raw as Record<string, unknown>;
      const productId = this.extractObjectId(item['productId']);
      if (!productId) throw new BadRequestError('Invalid productId in items');

      let variantId: string | undefined;
      if (item['variantId'] != null && item['variantId'] !== '') {
        const extracted = this.extractObjectId(item['variantId']);
        if (!extracted) throw new BadRequestError('Invalid variantId in items');
        variantId = extracted;
      }

      const qty = Number(item['qty']);
      if (!Number.isInteger(qty) || qty < 1) {
        throw new BadRequestError('Item quantity must be a positive integer');
      }

      const key = `${productId}:${variantId ?? ''}`;
      const existing = merged.get(key);
      const nextQty = Math.min((existing?.qty ?? 0) + qty, MAX_QTY_PER_ITEM);
      merged.set(key, { productId, variantId, qty: nextQty });
    }

    return Array.from(merged.values());
  }

  private extractObjectId(value: unknown): string | null {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string' && Types.ObjectId.isValid(value)) return value;
    // Populated document from a cart lookup
    if (value && typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
      const id = (value as Record<string, unknown>)['_id'];
      if (id instanceof Types.ObjectId) return id.toString();
      if (typeof id === 'string' && Types.ObjectId.isValid(id)) return id;
    }
    return null;
  }

  private async loadItems(sessionId: string, providedItems?: unknown[]): Promise<NormalizedItem[]> {
    if (providedItems && providedItems.length > 0) {
      return this.normalizeItems(providedItems);
    }
    const cart = await this.cartRepo.findByIdentifierRaw(sessionId);
    if (!cart || cart.items.length === 0) return [];
    return this.normalizeItems(
      cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        qty: i.qty,
      })),
    );
  }

  /**
   * Bulk-load and validate products + variants for a set of items.
   * Throws when a product/variant is missing, inactive, or mismatched —
   * checkout must never proceed on stale catalog data.
   */
  private async resolveItems(items: NormalizedItem[]): Promise<ResolvedItem[]> {
    if (items.length === 0) return [];

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = [...new Set(items.filter((i) => i.variantId).map((i) => i.variantId as string))];

    const [products, variants] = await Promise.all([
      Product.find({ _id: { $in: productIds } }).lean<IProductDoc[]>().exec(),
      variantIds.length > 0
        ? ProductVariant.find({ _id: { $in: variantIds } }).lean<IProductVariantDoc[]>().exec()
        : Promise.resolve([] as IProductVariantDoc[]),
    ]);

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

    return items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestError('One of the products in your cart is no longer available');
      }
      if (product.status !== 'active') {
        throw new BadRequestError(`"${product.name}" is no longer available`);
      }

      let variant: IProductVariantDoc | undefined;
      if (item.variantId) {
        variant = variantMap.get(item.variantId);
        if (!variant) {
          throw new BadRequestError(`The selected option for "${product.name}" is no longer available`);
        }
        if (variant.productId.toString() !== item.productId) {
          throw new BadRequestError('Variant does not belong to the selected product');
        }
        if (!variant.isActive) {
          throw new BadRequestError(`The selected option for "${product.name}" is no longer available`);
        }
      }

      return { ...item, product, variant };
    });
  }

  // ---------------------------------------------------------------------------
  // CHECKOUT SUMMARY — the single pricing authority
  //
  // Order of operations (deterministic):
  //   latest unit price (product/variant, discountedPrice honoured)
  //   → price rules (quantity tiers / percentage / fixed, via PricingService)
  //   → tax (per category rule)
  //   → order-level coupon OR offer (applied ONCE on the items total)
  //   → shipping
  //   → grand total
  // ---------------------------------------------------------------------------

  async getSummary(
    sessionId: string,
    providedItems?: unknown[],
    promoCode?: string,
    offerId?: string,
  ): Promise<CheckoutSummary> {
    const normalized = await this.loadItems(sessionId, providedItems);

    if (normalized.length === 0) {
      return this.emptySummary(sessionId);
    }

    const resolved = await this.resolveItems(normalized);
    const lineItems: CheckoutLineItem[] = [];

    for (const item of resolved) {
      const unitPrice = resolveUnitPrice(item.product, item.variant);

      const pricing = await this.pricingService.calculate({
        productId: item.productId,
        basePrice: unitPrice,
        categoryId: item.product.category?.toString(),
        collectionIds: (item.product.collections ?? []).map((c) => c.toString()),
        qty: item.qty,
      });

      lineItems.push({
        productId: item.productId,
        variantId: item.variantId,
        variantName: item.variant?.name,
        sku: item.variant?.sku,
        name: item.product.name,
        slug: item.product.slug,
        image: item.variant?.images?.[0] ?? item.product.images?.[0] ?? '',
        qty: item.qty,
        pricing,
      });
    }

    const subtotal = toMoney(lineItems.reduce((s, i) => s + i.pricing.priceAfterDiscount * i.qty, 0));
    const totalDiscount = toMoney(lineItems.reduce((s, i) => s + i.pricing.discountAmount * i.qty, 0));
    const totalTax = toMoney(lineItems.reduce((s, i) => s + i.pricing.taxAmount * i.qty, 0));
    const itemsTotal = toMoney(lineItems.reduce((s, i) => s + i.pricing.totalPrice, 0));

    // Order-level coupon/offer — applied exactly once, on the items total.
    let couponCode: string | null = null;
    let couponId: string | null = null;
    let couponType: 'promo_code' | 'offer' | null = null;
    let couponDiscount = 0;
    let promoError: string | undefined;

    if (promoCode && promoCode.trim()) {
      const validation = await this.discountService.validatePromoCode(promoCode.trim(), itemsTotal);
      if (validation.valid) {
        couponCode = promoCode.trim().toUpperCase();
        couponId = validation.discountId ?? null;
        couponType = 'promo_code';
        couponDiscount = toMoney(validation.discountAmount ?? 0);
      } else {
        promoError = validation.message ?? 'Invalid promo code';
      }
    } else if (offerId && offerId.trim()) {
      const offerResult = await this.validateOffer(offerId.trim(), itemsTotal);
      if (offerResult.valid) {
        couponCode = offerResult.title;
        couponId = offerResult.discountId;
        couponType = 'offer';
        couponDiscount = toMoney(offerResult.discountAmount);
      } else {
        promoError = offerResult.message;
      }
    }

    couponDiscount = Math.min(couponDiscount, itemsTotal);

    const shippingCost = 0; // Shipping is currently free; kept explicit so totals are auditable.
    const total = toMoney(Math.max(0, itemsTotal - couponDiscount) + shippingCost);

    return {
      sessionId,
      items: lineItems,
      subtotal,
      totalDiscount,
      totalTax,
      itemsTotal,
      couponCode,
      couponId,
      couponType,
      couponDiscount,
      shippingCost,
      total,
      itemCount: lineItems.reduce((s, i) => s + i.qty, 0),
      promoError,
    };
  }

  private async validateOffer(
    offerId: string,
    orderTotal: number,
  ): Promise<
    | { valid: true; discountId: string; title: string; discountAmount: number }
    | { valid: false; message: string }
  > {
    if (!Types.ObjectId.isValid(offerId)) {
      return { valid: false, message: 'Invalid offer' };
    }
    const offer = await this.discountService.getById(offerId);
    if (!offer || offer.type !== 'offer') return { valid: false, message: 'Invalid offer' };
    if (!offer.isActive) return { valid: false, message: 'This offer is not active' };

    const now = new Date();
    if (now < offer.validFrom) return { valid: false, message: 'This offer is not yet available' };
    if (now > offer.validUntil) return { valid: false, message: 'This offer has expired' };
    if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
      return { valid: false, message: 'This offer has reached its usage limit' };
    }
    if (orderTotal < offer.minOrderAmount) {
      return { valid: false, message: `Minimum order amount ₹${offer.minOrderAmount} required` };
    }

    let amount = 0;
    if (offer.valueType === 'percentage') {
      amount = (orderTotal * offer.value) / 100;
      if (offer.maxCap) amount = Math.min(amount, offer.maxCap);
    } else {
      amount = Math.min(offer.value, orderTotal);
    }

    return {
      valid: true,
      discountId: offer._id.toString(),
      title: offer.title,
      discountAmount: toMoney(amount),
    };
  }

  private emptySummary(sessionId: string): CheckoutSummary {
    return {
      sessionId,
      items: [],
      subtotal: 0,
      totalDiscount: 0,
      totalTax: 0,
      itemsTotal: 0,
      couponCode: null,
      couponId: null,
      couponType: null,
      couponDiscount: 0,
      shippingCost: 0,
      total: 0,
      itemCount: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // RESERVE STOCK
  // Variant-aware. Reserves first, then re-verifies against live stock so two
  // concurrent sessions cannot both hold the last unit (optimistic check with
  // rollback — works without a Mongo replica set).
  // ---------------------------------------------------------------------------

  async reserveStock(
    sessionId: string,
    providedItems?: unknown[],
  ): Promise<{ issues: StockIssue[] }> {
    const normalized = await this.loadItems(sessionId, providedItems);
    if (normalized.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    const resolved = await this.resolveItems(normalized);
    const tracked = resolved.filter((item) =>
      item.variant ? item.variant.trackInventory : item.product.trackInventory,
    );

    if (tracked.length === 0) return { issues: [] };

    // Pre-check availability (fast fail for the common case)
    const preIssues = await this.collectStockIssues(sessionId, tracked, false);
    if (preIssues.length > 0) return { issues: preIssues };

    // Reserve, then re-verify including our own reservation. If a concurrent
    // session won the race, roll back our reservations and report.
    for (const item of tracked) {
      await this.reservationRepo.reserve(sessionId, item.productId, item.qty, item.variantId);
    }

    const postIssues = await this.collectStockIssues(sessionId, tracked, true);
    if (postIssues.length > 0) {
      await this.reservationRepo.releaseBySession(sessionId);
      return { issues: postIssues };
    }

    return { issues: [] };
  }

  private async collectStockIssues(
    sessionId: string,
    items: ResolvedItem[],
    includeOwnReservation: boolean,
  ): Promise<StockIssue[]> {
    const issues: StockIssue[] = [];

    for (const item of items) {
      const stock = item.variant ? item.variant.stock : (item.product.stock ?? 0);
      const reserved = await this.reservationRepo.sumReservedQty(
        item.productId,
        includeOwnReservation ? undefined : sessionId,
        item.variantId,
      );

      // When our own reservation is included, it accounts for item.qty itself.
      const demand = includeOwnReservation ? reserved : reserved + item.qty;

      if (demand > stock) {
        issues.push({
          productId: item.productId,
          variantId: item.variantId,
          name: item.variant ? `${item.product.name} (${item.variant.name})` : item.product.name,
          requested: item.qty,
          available: Math.max(0, stock - (includeOwnReservation ? reserved - item.qty : reserved)),
        });
      }
    }

    return issues;
  }

  // ---------------------------------------------------------------------------
  // RELEASE STOCK RESERVATION
  // ---------------------------------------------------------------------------

  async releaseReservation(sessionId: string): Promise<void> {
    await this.reservationRepo.releaseBySession(sessionId);
  }

  // ---------------------------------------------------------------------------
  // FREEZE PRICE
  // Persists the full pricing breakdown — INCLUDING the coupon — as an
  // immutable snapshot. snapshot.total is the exact amount to charge
  // (before wallet / loyalty payment methods are applied).
  // ---------------------------------------------------------------------------

  async freezePrice(
    sessionId: string,
    providedItems?: unknown[],
    promoCode?: string,
    offerId?: string,
  ): Promise<{
    snapshotId: string;
    summary: CheckoutSummary;
    expiresAt: Date;
  }> {
    const summary = await this.getSummary(sessionId, providedItems, promoCode, offerId);

    if (summary.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // A coupon the user asked for that fails validation must abort payment,
    // not silently charge the undiscounted amount.
    if (summary.promoError) {
      throw new BadRequestError(summary.promoError);
    }

    await this.snapshotRepo.invalidatePreviousActive(sessionId);

    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MINUTES * 60 * 1000);
    const snapshot = await this.snapshotRepo.create({
      sessionId,
      items: summary.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        sku: item.sku ?? null,
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
      itemsTotal: summary.itemsTotal,
      couponCode: summary.couponCode,
      couponId: summary.couponId ? new Types.ObjectId(summary.couponId) : null,
      couponType: summary.couponType,
      couponDiscount: summary.couponDiscount,
      shippingCost: summary.shippingCost,
      total: summary.total,
      currency: 'INR',
      pricingVersion: PRICING_VERSION,
      status: 'active',
      expiresAt,
      usedByPaymentId: null,
    });

    logger.info(
      `Price snapshot ${snapshot._id} frozen for session ${sessionId}: total=${summary.total}, coupon=${summary.couponCode ?? 'none'} (-${summary.couponDiscount})`,
    );

    return {
      snapshotId: snapshot._id.toString(),
      summary,
      expiresAt: snapshot.expiresAt,
    };
  }
}
