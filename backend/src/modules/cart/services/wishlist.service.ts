import { Types } from 'mongoose';
import { WishlistRepository } from '../repositories/wishlist.repository';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { NotFoundError } from '../../../utils/api-error';
import { IProductDoc } from '../../catalog/models/product.model';
// ─── Types ───────────────────────────────────────────────────────────────────

export interface WishlistItemView {
  productId: string;
  name: string;
  slug: string;
  image: string;
  basePrice: number;
  status: string;
}

export interface WishlistView {
  sessionId: string;
  items: WishlistItemView[];
  productIds: string[]; // plain id list for fast "isWishlisted" checks on frontend
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WishlistService {
  private wishlistRepo = new WishlistRepository();
  private productRepo = new ProductRepository();

  // ---------------------------------------------------------------------------
  // GET WISHLIST
  // ---------------------------------------------------------------------------

  async getWishlist(sessionId: string): Promise<WishlistView> {
    const wishlist = await this.wishlistRepo.findBySession(sessionId);
    if (!wishlist || wishlist.productIds.length === 0) {
      return { sessionId, items: [], productIds: [] };
    }

    const items: WishlistItemView[] = (wishlist.productIds as unknown as IProductDoc[]).map(
      (product) => ({
        productId: product._id.toString(),
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] ?? '',
        basePrice: product.basePrice,
        status: product.status,
      }),
    );

    return {
      sessionId,
      items,
      productIds: items.map((i) => i.productId),
    };
  }

  // ---------------------------------------------------------------------------
  // TOGGLE (add if absent, remove if present)
  // ---------------------------------------------------------------------------

  async toggle(
    sessionId: string,
    productId: string,
  ): Promise<{ action: 'added' | 'removed'; wishlist: WishlistView }> {
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    const raw = await this.wishlistRepo.findRawBySession(sessionId);
    const isPresent = raw?.productIds.some((id) => id.toString() === productId) ?? false;

    if (isPresent) {
      await this.wishlistRepo.removeProduct(sessionId, productId);
      return { action: 'removed', wishlist: await this.getWishlist(sessionId) };
    } else {
      await this.wishlistRepo.addProduct(sessionId, productId);
      return { action: 'added', wishlist: await this.getWishlist(sessionId) };
    }
  }

  // ---------------------------------------------------------------------------
  // MERGE ON LOGIN — union of both sets
  // ---------------------------------------------------------------------------

  async mergeOnLogin(guestSessionId: string, userId: string): Promise<WishlistView> {
    const guestWishlist = await this.wishlistRepo.findRawBySession(guestSessionId);
    const userWishlist = await this.wishlistRepo.findRawByUserId(userId);
    if (!guestWishlist && !userWishlist) {
      return { sessionId: guestSessionId, items: [], productIds: [] };
    }

    if (!guestWishlist && userWishlist) {
      await this.wishlistRepo.saveProductIds(guestSessionId, userWishlist.productIds);
      await this.wishlistRepo.deleteBySession(userWishlist.sessionId);
      await this.wishlistRepo.assignUser(guestSessionId, userId);
      return this.getWishlist(guestSessionId);
    }

    if (guestWishlist && !userWishlist) {
      await this.wishlistRepo.assignUser(guestSessionId, userId);
      return this.getWishlist(guestSessionId);
    }

    // Union of both productId sets
    const seen = new Set<string>();
    const unionIds: Types.ObjectId[] = [];

    for (const id of [...guestWishlist!.productIds, ...userWishlist!.productIds]) {
      const key = id.toString();
      if (!seen.has(key)) {
        seen.add(key);
        unionIds.push(id);
      }
    }

    await this.wishlistRepo.saveProductIds(guestSessionId, unionIds);
    await this.wishlistRepo.assignUser(guestSessionId, userId);
    await this.wishlistRepo.deleteBySession(userWishlist!.sessionId);

    return this.getWishlist(guestSessionId);
  }
}
