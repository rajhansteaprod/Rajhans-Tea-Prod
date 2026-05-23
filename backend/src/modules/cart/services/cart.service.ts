import { Types } from 'mongoose';
import { CartRepository } from '../repositories/cart.repository';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';
import { IProductDoc } from '../../catalog/models/product.model';
import {logger} from '../../../utils/logger';
// ─── Types ───────────────────────────────────────────────────────────────────

export interface CartItemView {
  productId: string;
  variantId?: string;
  variantName?: string;
  name: string;
  slug: string;
  image: string;
  basePrice: number;
  qty: number;
  lineTotal: number; // basePrice/variantPrice * qty (before pricing engine — for fast display)
  shortDescription?: string;
  description?: string;
  discountedPrice?: number; // for display in cart sidebar
}

export interface CartView {
  sessionId: string;
  items: CartItemView[];
  itemCount: number;
  subtotal: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CartService {
  private cartRepo = new CartRepository();
  private productRepo = new ProductRepository();
  private variantRepo = new ProductVariantRepository();

  // ---------------------------------------------------------------------------
  // GET CART
  // ---------------------------------------------------------------------------

  async getCart(sessionId: string): Promise<CartView> {
    const cart = await this.cartRepo.findBySession(sessionId);
    
    if (!cart || cart.items.length === 0) {
      return { sessionId, items: [], itemCount: 0, subtotal: 0 };
    }

    const items: CartItemView[] = cart.items.map((item) => {
      // productId is populated
      const product = item.productId as unknown as IProductDoc;
      const image = product.images?.[0] ?? '';

      // Use variant price if variant is present, else use base price
      let price = product.discountedPrice ?? product.basePrice;
      let variantName: string | undefined;
      let variantId: string | undefined;

      if (item.variantId) {
        const variant = item.variantId as unknown as any;
        price = variant.price ?? product.basePrice;
        variantName = variant.name;
        variantId = variant._id?.toString();
      }

      const lineTotal = price * item.qty;
      logger.info("Product returned from DB:"+ product);
      return {
        productId: product._id.toString(),
        variantId,
        variantName,
        name: product.name,
        slug: product.slug,
        image,
        basePrice: price,
        qty: item.qty,
        lineTotal,
        shortDescription: product.shortDescription,
        description: product.description,
        discountedPrice: product.discountedPrice,
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

    return {
      sessionId,
      items,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal,
    };
  }

  // ---------------------------------------------------------------------------
  // ADD / UPDATE ITEM
  // ---------------------------------------------------------------------------

  async addItem(sessionId: string, productId: string, qty: number, variantId?: string): Promise<CartView> {
    if (qty < 1) throw new BadRequestError('Quantity must be at least 1');

    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (product.status !== 'active') throw new BadRequestError('Product is not available');

    // If variantId provided, validate it exists and belongs to this product
    if (variantId) {
      const variant = await this.variantRepo.findById(variantId);
      if (!variant) throw new NotFoundError('Variant not found');
      if (variant.productId.toString() !== productId) throw new BadRequestError('Variant does not belong to this product');
      if (!variant.isActive) throw new BadRequestError('Variant is not available');
    }

    await this.cartRepo.upsertItem(sessionId, productId, qty, variantId);
    return this.getCart(sessionId);
  }

  async updateItem(sessionId: string, productId: string, qty: number, variantId?: string): Promise<CartView> {
    if (qty < 1) throw new BadRequestError('Quantity must be at least 1');

    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    // If variantId provided, validate it exists
    if (variantId) {
      const variant = await this.variantRepo.findById(variantId);
      if (!variant) throw new NotFoundError('Variant not found');
      if (variant.productId.toString() !== productId) throw new BadRequestError('Variant does not belong to this product');
    }

    await this.cartRepo.upsertItem(sessionId, productId, qty, variantId);
    return this.getCart(sessionId);
  }

  // ---------------------------------------------------------------------------
  // REMOVE ITEM
  // ---------------------------------------------------------------------------

  async removeItem(sessionId: string, productId: string, variantId?: string): Promise<CartView> {
    await this.cartRepo.removeItem(sessionId, productId, variantId);
    return this.getCart(sessionId);
  }

  // ---------------------------------------------------------------------------
  // CLEAR CART
  // ---------------------------------------------------------------------------

  async clearCart(sessionId: string): Promise<void> {
    await this.cartRepo.clearItems(sessionId);
  }

  // ---------------------------------------------------------------------------
  // MERGE ON LOGIN
  // Guest cart + User's previous cart → merged by max qty per product
  // ---------------------------------------------------------------------------

  async mergeOnLogin(guestSessionId: string, userId: string): Promise<CartView> {
    const guestCart = await this.cartRepo.findRawBySession(guestSessionId);
    const userCart = await this.cartRepo.findRawByUserId(userId);

    if (!guestCart && !userCart) {
      // Nothing to merge — return empty cart
      return { sessionId: guestSessionId, items: [], itemCount: 0, subtotal: 0 };
    }

    if (!guestCart && userCart) {
      // User has an old cart from a previous session — reassign its sessionId so it's accessible
      await this.cartRepo.saveItems(guestSessionId, userCart.items);
      if (userCart.sessionId !== guestSessionId) {
  await this.cartRepo.deleteBySession(userCart.sessionId);
}
      await this.cartRepo.assignUser(guestSessionId, userId);
      return this.getCart(guestSessionId);
    }

    if (guestCart && !userCart) {
      // Only guest cart exists — just attach userId
      await this.cartRepo.assignUser(guestSessionId, userId);
      return this.getCart(guestSessionId);
    }

    // Both exist — merge by max qty per {productId, variantId} pair
    const merged = new Map<
      string,
      { productId: Types.ObjectId; variantId?: Types.ObjectId; qty: number; addedAt: Date }
    >();

    for (const item of guestCart!.items) {
      const key = `${item.productId.toString()}-${item.variantId?.toString() || 'none'}`;
      merged.set(key, {
        productId: item.productId,
        variantId: item.variantId,
        qty: item.qty,
        addedAt: item.addedAt,
      });
    }

    for (const item of userCart!.items) {
      const key = `${item.productId.toString()}-${item.variantId?.toString() || 'none'}`;
      const existing = merged.get(key);
      if (existing) {
        existing.qty = Math.max(existing.qty, item.qty);
      } else {
        merged.set(key, {
          productId: item.productId,
          variantId: item.variantId,
          qty: item.qty,
          addedAt: item.addedAt,
        });
      }
    }

    const mergedItems = Array.from(merged.values());
    await this.cartRepo.saveItems(guestSessionId, mergedItems);
    await this.cartRepo.assignUser(guestSessionId, userId);
    // Delete old user cart (different sessionId)
    
if (userCart!.sessionId !== guestSessionId) {
  await this.cartRepo.deleteBySession(userCart!.sessionId);
}
    return this.getCart(guestSessionId);
  }
}
