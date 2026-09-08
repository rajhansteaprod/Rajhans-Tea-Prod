import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { NotFoundError, BadRequestError } from '../../../utils/api-error';

export class ProductVariantService {
  private variantRepo: ProductVariantRepository;
  private productRepo: ProductRepository;

  constructor() {
    this.variantRepo = new ProductVariantRepository();
    this.productRepo = new ProductRepository();
  }

  async listByProductId(productId: string) {
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    return this.variantRepo.findByProductIdAll(productId);
  }

  async getById(variantId: string) {
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');
    return variant;
  }

  async create(productId: string, data: {
    name: string;
    optionKey?: string;
    optionValue?: string;
    sku?: string;
    price: number;
    discountedPrice?: number | null;
    cost?: number;
    costPerCupText?: string;
    stock: number;
    trackInventory?: boolean;
    images?: string[];
    position?: number;
  }) {
    // Verify product exists
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    // When a dictionary value is provided, it is the canonical display name.
    const name = (data.optionValue ?? data.name)?.trim();
    if (!name || !data.price) {
      throw new BadRequestError('name and price are required');
    }

    if (data.price <= 0) {
      throw new BadRequestError('price must be greater than 0');
    }
    if (data.discountedPrice != null && data.discountedPrice >= data.price) {
      throw new BadRequestError('discountedPrice must be lower than price');
    }

    // Get next position
    const existingVariants = await this.variantRepo.findByProductIdAll(productId);
    const nextPosition = Math.max(...existingVariants.map(v => v.position ?? 0), 0) + 1;

    let variant;
    try {
      variant = await this.variantRepo.create({
        productId: product._id,
        name,
        optionKey: data.optionKey?.trim() || undefined,
        optionValue: data.optionValue?.trim() || undefined,
        sku: this.normalizeSku(data.sku),
        price: data.price,
        discountedPrice: data.discountedPrice ?? undefined,
        cost: data.cost,
        costPerCupText: data.costPerCupText?.trim() || undefined,
        stock: data.stock ?? 0,
        trackInventory: data.trackInventory ?? true,
        images: data.images ?? [],
        position: data.position ?? nextPosition,
        isActive: true,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestError(`SKU "${data.sku}" is already in use`);
      }
      throw err;
    }

    // Update product hasVariants flag if not already set
    if (!product.hasVariants) {
      await this.productRepo.updateById(productId, { hasVariants: true });
    }

    // Keep product base/discounted price in sync with the cheapest variant
    const { ProductService } = await import('./product.service');
    await new ProductService().updateBasePricingByVariant(productId);

    return variant;
  }

  /** Empty/whitespace SKUs are stored as undefined so the sparse unique index ignores them. */
  private normalizeSku(sku?: string): string | undefined {
    const trimmed = sku?.trim().toLowerCase();
    return trimmed ? trimmed : undefined;
  }

  async update(variantId: string, data: {
    name?: string;
    optionKey?: string;
    optionValue?: string;
    sku?: string;
    price?: number;
    discountedPrice?: number | null; // null clears an existing discount
    cost?: number;
    costPerCupText?: string;
    stock?: number;
    trackInventory?: boolean;
    images?: string[];
    position?: number;
    isActive?: boolean;
  }) {
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');

    // Validate pricing against effective values
    const effectivePrice = data.price ?? variant.price;
    const effectiveDiscounted =
      data.discountedPrice !== undefined ? data.discountedPrice : variant.discountedPrice;
    if (effectivePrice <= 0) {
      throw new BadRequestError('price must be greater than 0');
    }
    if (effectiveDiscounted != null && effectiveDiscounted >= effectivePrice) {
      throw new BadRequestError('discountedPrice must be lower than price');
    }

    const update: Record<string, unknown> = {};
    // If a dictionary value is chosen it becomes the display name too.
    if (data.optionValue !== undefined) {
      update.optionValue = data.optionValue.trim() || undefined;
      update.name = data.optionValue.trim() || data.name?.trim() || variant.name;
    } else if (data.name !== undefined) {
      update.name = data.name.trim();
    }
    if (data.optionKey !== undefined) update.optionKey = data.optionKey.trim() || undefined;
    if (data.sku !== undefined) update.sku = this.normalizeSku(data.sku);
    if (data.price !== undefined) update.price = data.price;
    // null → remove the discount entirely; a number → set it
    let clearDiscount = false;
    if (data.discountedPrice === null) {
      clearDiscount = true;
    } else if (data.discountedPrice !== undefined) {
      update.discountedPrice = data.discountedPrice;
    }
    if (data.cost !== undefined) update.cost = data.cost;
    if (data.costPerCupText !== undefined) update.costPerCupText = data.costPerCupText.trim();
    if (data.stock !== undefined) update.stock = data.stock;
    if (data.trackInventory !== undefined) update.trackInventory = data.trackInventory;
    if (data.images !== undefined) update.images = data.images;
    if (data.position !== undefined) update.position = data.position;
    if (data.isActive !== undefined) update.isActive = data.isActive;

    try {
      if (clearDiscount) {
        const { ProductVariant } = await import('../models/product-variant.model');
        await ProductVariant.findByIdAndUpdate(
          variantId,
          { $set: update, $unset: { discountedPrice: 1 } },
          { new: true },
        ).exec();
      } else {
        await this.variantRepo.update(variantId, update as any);
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestError(`SKU "${data.sku}" is already in use`);
      }
      throw err;
    }

    // Keep product base/discounted price in sync when variant pricing changed
    if (data.price !== undefined || data.discountedPrice !== undefined || clearDiscount || data.isActive !== undefined) {
      const { ProductService } = await import('./product.service');
      await new ProductService().updateBasePricingByVariant(variant.productId.toString());
    }

    return this.getById(variantId);
  }

  async delete(variantId: string) {
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');

    await this.variantRepo.delete(variantId);

    const productId = variant.productId.toString();

    // Remove cart lines that reference this variant (no dangling references)
    const { Cart } = await import('../../cart/models/cart.model');
    await Cart.updateMany(
      { 'items.variantId': variant._id },
      { $pull: { items: { variantId: variant._id } } },
    ).exec();

    // Check if product has any remaining variants
    const remainingVariants = await this.variantRepo.findByProductIdAll(productId);
    if (remainingVariants.length === 0) {
      await this.productRepo.updateById(productId, { hasVariants: false });
    } else {
      const { ProductService } = await import('./product.service');
      await new ProductService().updateBasePricingByVariant(productId);
    }
  }

  async reorderVariants(productId: string, variantIds: string[]) {
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    for (let i = 0; i < variantIds.length; i++) {
      await this.variantRepo.updatePosition(variantIds[i], i);
    }
  }
}
