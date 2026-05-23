import { Types } from 'mongoose';
import { Cart, ICartDoc } from '../models/cart.model';

export class CartRepository {
  async findBySession(sessionId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ sessionId })
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
      .populate('items.variantId', 'name price')
      .exec();
  }

  async findByUserId(userId: string): Promise<ICartDoc | null> {
    return Cart.findOne({ userId: new Types.ObjectId(userId) })
      .populate('items.productId', 'name slug images basePrice category collections status shortDescription description discountedPrice')
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

  async removeItem(sessionId: string, productId: string, variantId?: string): Promise<ICartDoc | null> {
    const pid = new Types.ObjectId(productId);
    const vid = variantId ? new Types.ObjectId(variantId) : undefined;

    // Match by productId + variantId pair
    const pullFilter: any = { productId: pid };
    if (vid) {
      pullFilter.variantId = vid;
    } else {
      pullFilter.variantId = { $exists: false };
    }

    return Cart.findOneAndUpdate({ sessionId }, { $pull: { items: pullFilter } }, { new: true }).exec();
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
    items: { productId: Types.ObjectId; variantId?: Types.ObjectId; qty: number; addedAt: Date }[],
  ): Promise<void> {
    await Cart.findOneAndUpdate({ sessionId }, { $set: { items } }, { upsert: true }).exec();
  }

  async updateStatus(sessionId: string, status: 'temporary' | 'checkout_started' | 'completed' | 'abandoned'): Promise<void> {
    const updateData: any = { status };
    if (status === 'checkout_started') {
      updateData.checkoutStartedAt = new Date();
    }
    await Cart.findOneAndUpdate({ sessionId }, { $set: updateData }).exec();
  }

  async markAsCompleted(sessionId: string): Promise<void> {
    await Cart.findOneAndUpdate({ sessionId }, { $set: { status: 'completed' } }).exec();
  }
}
