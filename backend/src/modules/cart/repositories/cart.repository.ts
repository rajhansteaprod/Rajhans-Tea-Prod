import { Types } from 'mongoose';
import { Cart, ICartDoc, ICartItem } from '../models/cart.model';

export class CartRepository {
  // Get cart by identifier (guest sessionId or userId)
  async getCart(identifier: string | Types.ObjectId): Promise<ICartDoc | null> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    return Cart.findOne(filter)
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price discountedPrice')
      .exec();
  }

  // Current quantity of a specific line item (0 if not in the cart yet).
  // Used to compute increments for "Add to cart".
  async getItemQty(
    identifier: string | Types.ObjectId,
    productId: string,
    variantId?: string,
  ): Promise<number> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    const cart = await Cart.findOne(filter).exec();
    if (!cart) return 0;

    const item = cart.items.find(
      (i) =>
        i.productId.toString() === productId &&
        (i.variantId?.toString() === variantId || (!i.variantId && !variantId)),
    );
    return item?.qty ?? 0;
  }

  // Upsert item for both guest and user
  async upsertItem(
    identifier: string | Types.ObjectId,
    productId: string,
    qty: number,
    variantId?: string,
    slug?: string
  ): Promise<ICartDoc> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : undefined;

    let cart = await Cart.findOne(filter).exec();

    if (!cart) {
      // Create new cart with appropriate identifier
      const createData = typeof identifier === 'string'
        ? { guestSessionId: identifier, items: [] }
        : { userId: identifier, items: [] };

      cart = await Cart.create(createData);
    }

    // Find and update or add item
    const idx = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        (item.variantId?.toString() === variantId || (!item.variantId && !variantId))
    );

    if (idx >= 0) {
      cart.items[idx].qty = qty;
    } else {
      cart.items.push({ productId: pid, slug: slug || '', variantId: vid, qty, addedAt: new Date() });
    }

    await cart.save();

    // Repopulate and return
    const updatedCart = await Cart.findOne(filter)
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price discountedPrice')
      .exec();
    return updatedCart as ICartDoc;
  }

  // Remove item for both guest and user
  async removeItem(
    identifier: string | Types.ObjectId,
    productId: string,
    variantId?: string
  ): Promise<ICartDoc | null> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    const pid = new Types.ObjectId(productId);
    const pullFilter: any = { productId: pid };

    if (variantId) {
      pullFilter.variantId = new Types.ObjectId(variantId);
    } else {
      pullFilter.variantId = { $exists: false };
    }

    await Cart.findOneAndUpdate(filter, { $pull: { items: pullFilter } }, { new: true }).exec();

    // Repopulate and return
    const updatedCart = await Cart.findOne(filter)
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price discountedPrice')
      .exec();
    return updatedCart;
  }

  // Clear all items
  async clearCart(identifier: string | Types.ObjectId): Promise<void> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    await Cart.findOneAndUpdate(filter, { $set: { items: [] } }).exec();
  }

  // Merge guest cart to user cart on login.
  // Always returns a fully populated cart (or null when neither cart exists) so
  // the caller can format a correct view — every branch below funnels through
  // the single populated read at the end.
  async mergeOnLogin(guestSessionId: string, userId: Types.ObjectId): Promise<ICartDoc | null> {
    const guestCart = await Cart.findOne({ guestSessionId }).exec();
    const userCart = await Cart.findOne({ userId }).exec();

    if (guestCart && !userCart) {
      // No user cart yet — adopt the guest cart as the user's cart in place.
      await Cart.updateOne(
        { _id: guestCart._id },
        { $unset: { guestSessionId: 1 }, $set: { userId } },
      ).exec();
    } else if (guestCart && userCart) {
      // Both exist — UNION of the two carts: every distinct item appears once,
      // and for an item present in both we keep the HIGHER quantity (no summing,
      // no cap). The user's saved cart is the base; guest-only items add on top
      // so nothing the guest put in the cart is lost.
      const merged = new Map<string, ICartItem>();

      const keyOf = (item: ICartItem) =>
        `${item.productId.toString()}-${item.variantId?.toString() || 'none'}`;
      const toPlain = (item: ICartItem): ICartItem => ({
        productId: item.productId,
        slug: item.slug,
        variantId: item.variantId,
        qty: item.qty,
        addedAt: item.addedAt,
      });

      for (const item of userCart.items) {
        merged.set(keyOf(item), toPlain(item));
      }
      for (const item of guestCart.items) {
        const existing = merged.get(keyOf(item));
        if (existing) {
          existing.qty = Math.max(existing.qty, item.qty);
        } else {
          merged.set(keyOf(item), toPlain(item));
        }
      }

      await Cart.updateOne(
        { _id: userCart._id },
        { $set: { items: Array.from(merged.values()) } },
      ).exec();
      await Cart.deleteOne({ _id: guestCart._id }).exec();
    }
    // else: no guest cart — nothing to merge; fall through to return user cart.

    // Single populated read for every path above.
    return Cart.findOne({ userId })
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price discountedPrice')
      .exec();
  }

  // Delete old guest carts (called by background job)
  async deleteOldGuestCarts(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await Cart.deleteMany({
      guestSessionId: { $exists: true },
      createdAt: { $lt: cutoffDate },
    }).exec();
    return result.deletedCount || 0;
  }

  // Legacy method for backward compatibility (CheckoutService)
  async findBySession(sessionId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ guestSessionId: sessionId })
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price discountedPrice')
      .exec();
  }

  /**
   * Resolve a cart from a checkout session identifier without populating.
   * Logged-in users use their userId (a valid ObjectId) as the session id;
   * guests use a UUID stored in guestSessionId.
   */
  async findByIdentifierRaw(sessionId: string): Promise<ICartDoc | null> {
    if (Types.ObjectId.isValid(sessionId)) {
      const asObjectId = new Types.ObjectId(sessionId);
      return Cart.findOne({
        $or: [{ userId: asObjectId }, { guestSessionId: sessionId }],
      }).exec();
    }
    return Cart.findOne({ guestSessionId: sessionId }).exec();
  }
}
