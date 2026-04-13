import { Types } from 'mongoose';
import { Cart, ICartDoc } from '../models/cart.model';

export class CartRepository {
  async findBySession(sessionId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ sessionId })
      .populate('items.productId', 'name slug images basePrice category collections status')
      .populate('items.variantId', 'name price')
      .exec();
  }

  async findByUserId(userId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ userId: new Types.ObjectId(userId) })
      .populate('items.productId', 'name slug images basePrice category collections status')
      .populate('items.variantId', 'name price')
      .exec();
  }

  async findRawBySession(sessionId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ sessionId }).exec();
  }

  async findRawByUserId(userId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ userId: new Types.ObjectId(userId) }).exec();
  }

  async upsertItem(sessionId: string, productId: string, qty: number, variantId?: string): Promise<ICartDoc> {
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : undefined;
    let cart = await Cart.findOne({ sessionId }).exec();

    if (!cart) {
      cart = await Cart.create({
        sessionId,
        items: [{ productId: pid, variantId: vid, qty, addedAt: new Date() }],
      });
      return cart;
    }

    // Match by productId + variantId pair
    const idx = cart.items.findIndex((item) =>
      item.productId.toString() === productId &&
      (item.variantId?.toString() === variantId || (!item.variantId && !variantId))
    );
    if (idx >= 0) {
      cart.items[idx].qty = qty;
    } else {
      cart.items.push({ productId: pid, variantId: vid, qty, addedAt: new Date() });
    }

    return cart.save();
  }

  async removeItem(sessionId: string, productId: string): Promise<ICartDoc | null> {
    return Cart.findOneAndUpdate(
      { sessionId },
      { $pull: { items: { productId: new Types.ObjectId(productId) } } },
      { new: true },
    ).exec();
  }

  async clearItems(sessionId: string): Promise<void> {
    await Cart.findOneAndUpdate({ sessionId }, { $set: { items: [] } }).exec();
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await Cart.deleteOne({ sessionId }).exec();
  }

  async assignUser(sessionId: string, userId: string): Promise<void> {
    await Cart.findOneAndUpdate(
      { sessionId },
      { $set: { userId: new Types.ObjectId(userId) } },
      { upsert: false },
    ).exec();
  }

  async saveItems(
    sessionId: string,
    items: { productId: Types.ObjectId; qty: number; addedAt: Date }[],
  ): Promise<void> {
    await Cart.findOneAndUpdate({ sessionId }, { $set: { items } }, { upsert: true }).exec();
  }
}
