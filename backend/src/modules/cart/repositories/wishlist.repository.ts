import { Types } from 'mongoose';
import { Wishlist, IWishlistDoc } from '../models/wishlist.model';

export class WishlistRepository {
  async findBySession(sessionId: string): Promise<IWishlistDoc | null> {
    return Wishlist.findOne({ sessionId })
      .populate('productIds', 'name slug images basePrice status category')
      .exec();
  }

  async findByUserId(userId: string): Promise<IWishlistDoc | null> {
    return Wishlist.findOne({ userId: new Types.ObjectId(userId) })
      .populate('productIds', 'name slug images basePrice status category')
      .exec();
  }

  async findRawBySession(sessionId: string): Promise<IWishlistDoc | null> {
    return Wishlist.findOne({ sessionId }).exec();
  }

  async findRawByUserId(userId: string): Promise<IWishlistDoc | null> {
    return Wishlist.findOne({ userId: new Types.ObjectId(userId) }).exec();
  }

  async addProduct(sessionId: string, productId: string): Promise<IWishlistDoc> {
    const pid = new Types.ObjectId(productId);
    return Wishlist.findOneAndUpdate(
      { sessionId },
      { $addToSet: { productIds: pid } },
      { new: true, upsert: true },
    ).exec() as Promise<IWishlistDoc>;
  }

  async removeProduct(sessionId: string, productId: string): Promise<IWishlistDoc | null> {
    return Wishlist.findOneAndUpdate(
      { sessionId },
      { $pull: { productIds: new Types.ObjectId(productId) } },
      { new: true },
    ).exec();
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await Wishlist.deleteOne({ sessionId }).exec();
  }

  async assignUser(sessionId: string, userId: string): Promise<void> {
    await Wishlist.findOneAndUpdate(
      { sessionId },
      { $set: { userId: new Types.ObjectId(userId) } },
      { upsert: false },
    ).exec();
  }

  async saveProductIds(sessionId: string, productIds: Types.ObjectId[]): Promise<void> {
    await Wishlist.findOneAndUpdate(
      { sessionId },
      { $set: { productIds } },
      { upsert: true },
    ).exec();
  }
}
