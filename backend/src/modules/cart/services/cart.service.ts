import { Types } from 'mongoose';
import { CartRepository } from '../repositories/cart.repository';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';
import { IProductDoc } from '../../catalog/models/product.model';
import { ICartDoc } from '../models/cart.model';

export interface CartItemView {
  productId: string;
  variantId?: string;
  variantName?: string;
  name: string;
  slug: string;
  image: string;
  basePrice: number;
  qty: number;
  lineTotal: number;
  shortDescription?: string;
  description?: string;
  discountedPrice?: number;
}

export interface CartView {
  items: CartItemView[];
  itemCount: number;
  subtotal: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CartService {
  private cartRepo = new CartRepository();
  private productRepo = new ProductRepository();
  private variantRepo = new ProductVariantRepository();

  // Get cart (works for both guest & user)
  async getCart(identifier: string | Types.ObjectId): Promise<CartView> {
    const cart = await this.cartRepo.getCart(identifier);
    return this.formatCartView(cart);
  }

  // Add item (works for both guest & user)
  async addItem(
    identifier: string | Types.ObjectId,
    productId: string,
    qty: number,
    variantId?: string,
    slug?: string
  ): Promise<CartView> {
    if (qty < 1) throw new BadRequestError('Quantity must be at least 1');

    // Validate product
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (product.status !== 'active') throw new BadRequestError('Product not available');

    // Validate variant if provided
    if (variantId) {
      const variant = await this.variantRepo.findById(variantId);
      if (!variant) throw new NotFoundError('Variant not found');
      if (variant.productId.toString() !== productId) throw new BadRequestError('Variant does not belong to product');
      if (!variant.isActive) throw new BadRequestError('Variant not available');
    }

    // Use provided slug or get from product
    const itemSlug = slug || product.slug;
    const cart = await this.cartRepo.upsertItem(identifier, productId, qty, variantId, itemSlug);
    return this.formatCartView(cart);
  }

  // Remove item (works for both guest & user)
  async removeItem(
    identifier: string | Types.ObjectId,
    productId: string,
    variantId?: string
  ): Promise<CartView> {
    const cart = await this.cartRepo.removeItem(identifier, productId, variantId);
    return this.formatCartView(cart);
  }

  // Clear cart (works for both guest & user)
  async clearCart(identifier: string | Types.ObjectId): Promise<void> {
    await this.cartRepo.clearCart(identifier);
  }

  // Merge guest cart to user cart on login
  async mergeOnLogin(guestSessionId: string, userId: string): Promise<CartView> {
    const cart = await this.cartRepo.mergeOnLogin(guestSessionId, new Types.ObjectId(userId));
    return this.formatCartView(cart);
  }

  // Format cart response
  private formatCartView(cart: ICartDoc | null): CartView {
    if (!cart || cart.items.length === 0) {
      return {
        items: [],
        itemCount: 0,
        subtotal: 0,
      };
    }

    const items: CartItemView[] = cart.items.map((item: any) => {
      const product = item.productId as IProductDoc;
      const variant = item.variantId;
      const price = variant?.discountedPrice ?? variant?.price ?? product.discountedPrice ?? product.basePrice;

      return {
        productId: product._id.toString(),
        variantId: variant?._id?.toString(),
        variantName: variant?.name,
        name: product.name,
        slug: item.slug || product.slug, // Use denormalized slug from item, fallback to product slug
        image: product.images?.[0] ?? '',
        basePrice: price,
        qty: item.qty,
        lineTotal: price * item.qty,
        shortDescription: product.shortDescription,
        description: product.description,
        discountedPrice: product.discountedPrice,
      };
    });

    return {
      items,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    };
  }
}
