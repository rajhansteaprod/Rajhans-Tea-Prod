import { Types } from 'mongoose';
import { Cart, ICartDoc } from '../models/cart.model';

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

    return cart.save();
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

    return Cart.findOneAndUpdate(filter, { $pull: { items: pullFilter } }, { new: true }).exec();
  }

  // Clear all items
  async clearCart(identifier: string | Types.ObjectId): Promise<void> {
    const filter = typeof identifier === 'string'
      ? { guestSessionId: identifier }
      : { userId: identifier };

    await Cart.findOneAndUpdate(filter, { $set: { items: [] } }).exec();
  }

  // Merge guest cart to user cart on login
  async mergeOnLogin(guestSessionId: string, userId: Types.ObjectId): Promise<ICartDoc | null> {
    const guestCart = await Cart.findOne({ guestSessionId }).exec();
    const userCart = await Cart.findOne({ userId }).exec();

    if (!guestCart) {
      // No guest cart - return user cart as is
      return userCart;
    }

    if (!userCart) {
      // No user cart - convert guest cart to user cart
      return Cart.findOneAndUpdate(
        { guestSessionId },
        {
          $unset: { guestSessionId: 1 },
          $set: { userId },
        },
        { new: true }
      ).exec();
    }

    // Both exist - merge items (take max qty for duplicates)
    const merged = new Map<string, any>();

    // Add all guest items
    for (const item of guestCart.items) {
      const key = `${item.productId.toString()}-${item.variantId?.toString() || 'none'}`;
      merged.set(key, item);
    }

    // Merge user items (take max qty)
    for (const item of userCart.items) {
      const key = `${item.productId.toString()}-${item.variantId?.toString() || 'none'}`;
      const existing = merged.get(key);
      if (existing) {
        existing.qty = Math.max(existing.qty, item.qty);
      } else {
        merged.set(key, item);
      }
    }

    // Update user cart with merged items
    await Cart.findByIdAndUpdate(userCart._id, {
      items: Array.from(merged.values()),
    }).exec();

    // Delete guest cart
    await Cart.deleteOne({ guestSessionId }).exec();

    return Cart.findById(userCart._id).exec();
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
}
