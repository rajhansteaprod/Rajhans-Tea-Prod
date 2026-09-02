import { Types } from 'mongoose';
import { CartRepository } from '../repositories/cart.repository';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';
import { IProductDoc } from '../../catalog/models/product.model';
import { ICartDoc } from '../models/cart.model';
import { resolveUnitPrice, toMoney } from '../../../utils/price';

const MAX_QTY_PER_ITEM = 10;

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

  // Add item / set quantity (works for both guest & user).
  // mode 'add'  → increment the existing quantity by `qty` (adding the same
  //               product twice results in qty 2). Used by "Add to cart".
  // mode 'set'  → replace the quantity with `qty` absolutely. Used by the
  //               quantity stepper / update endpoint.
  async addItem(
    identifier: string | Types.ObjectId,
    productId: string,
    qty: number,
    variantId?: string,
    mode: 'add' | 'set' = 'set',
  ): Promise<CartView> {
    if (!Number.isInteger(qty) || qty < 1) {
      throw new BadRequestError('Quantity must be at least 1');
    }
    if (qty > MAX_QTY_PER_ITEM) {
      throw new BadRequestError(`Maximum ${MAX_QTY_PER_ITEM} units per item`);
    }

    // Validate product
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (product.status !== 'active') throw new BadRequestError('Product not available');

    // Validate variant if provided
    let variant = null;
    if (variantId) {
      variant = await this.variantRepo.findById(variantId);
      if (!variant) throw new NotFoundError('Variant not found');
      if (variant.productId.toString() !== productId) throw new BadRequestError('Variant does not belong to product');
      if (!variant.isActive) throw new BadRequestError('Variant not available');
    }

    // Resolve the resulting quantity. For 'add', build on top of what's already
    // in the cart (capped at the per-item max so re-adding never overflows).
    let resultingQty = qty;
    if (mode === 'add') {
      const currentQty = await this.cartRepo.getItemQty(identifier, productId, variantId);
      resultingQty = Math.min(currentQty + qty, MAX_QTY_PER_ITEM);
    }

    // Stock validation for inventory-tracked items — against the resulting total
    const trackInventory = variant ? variant.trackInventory : product.trackInventory;
    if (trackInventory) {
      const stock = variant ? variant.stock : product.stock;
      if (stock < resultingQty) {
        throw new BadRequestError(
          stock <= 0 ? 'Out of stock' : `Only ${stock} unit(s) available`,
        );
      }
    }

    // Slug is always taken from the product — never trusted from the client.
    // upsertItem sets the quantity absolutely; we've already folded the
    // increment into resultingQty above.
    const cart = await this.cartRepo.upsertItem(identifier, productId, resultingQty, variantId, product.slug);
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

    const items: CartItemView[] = cart.items
      // Products deleted or unpublished after being added must not break the
      // cart view — they are silently dropped from the response.
      .filter((item: any) => {
        const product = item.productId as IProductDoc | null;
        if (!product || typeof product !== 'object' || !('_id' in product) || product.status !== 'active') {
          return false;
        }
        // variantId was set but the variant no longer exists (populate → null)
        if (item.variantId === null) return false;
        return true;
      })
      .map((item: any) => {
        const product = item.productId as IProductDoc;
        const variant = item.variantId;
        const price = resolveUnitPrice(product, variant ?? undefined);

        return {
          productId: product._id.toString(),
          variantId: variant?._id?.toString(),
          variantName: variant?.name,
          name: product.name,
          slug: product.slug,
          image: product.images?.[0] ?? '',
          basePrice: price,
          qty: item.qty,
          lineTotal: toMoney(price * item.qty),
          shortDescription: product.shortDescription,
          description: product.description,
          discountedPrice: product.discountedPrice,
        };
      });

    return {
      items,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal: toMoney(items.reduce((sum, i) => sum + i.lineTotal, 0)),
    };
  }
}
