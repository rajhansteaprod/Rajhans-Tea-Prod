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
    sku?: string;
    price: number;
    discountPercentage: number;
    cost?: number;
    stock: number;
    trackInventory?: boolean;
    images?: string[];
    position?: number;
  }) {
    // Verify product exists
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    if (!data.name || !data.price) {
      throw new BadRequestError('name and price are required');
    }

    // Get next position
    const existingVariants = await this.variantRepo.findByProductIdAll(productId);
    const nextPosition = Math.max(...existingVariants.map(v => v.position ?? 0), 0) + 1;

    const variant = await this.variantRepo.create({
      productId: product._id,
      name: data.name.trim(),
      sku: data.sku?.toLowerCase(),
      price: data.price,
      discountPercentage: data.discountPercentage,
      cost: data.cost,
      stock: data.stock ?? 0,
      trackInventory: data.trackInventory ?? true,
      images: data.images ?? [],
      position: data.position ?? nextPosition,
      isActive: true,
    });

    // Update product hasVariants flag if not already set
    if (!product.hasVariants) {
      await this.productRepo.updateById(productId, { hasVariants: true });
    }

    return variant;
  }

  async update(variantId: string, data: {
    name?: string;
    sku?: string;
    price?: number;
    discountPercentage?: number;
    cost?: number;
    stock?: number;
    trackInventory?: boolean;
    images?: string[];
    position?: number;
    isActive?: boolean;
  }) {
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.sku !== undefined) update.sku = data.sku?.toLowerCase();
    if (data.price !== undefined) update.price = data.price;
    if (data.discountPercentage !== undefined) update.discountPercentage = data.discountPercentage;
    if (data.cost !== undefined) update.cost = data.cost;
    if (data.stock !== undefined) update.stock = data.stock;
    if (data.trackInventory !== undefined) update.trackInventory = data.trackInventory;
    if (data.images !== undefined) update.images = data.images;
    if (data.position !== undefined) update.position = data.position;
    if (data.isActive !== undefined) update.isActive = data.isActive;

    await this.variantRepo.update(variantId, update as any);
    return this.getById(variantId);
  }

  async delete(variantId: string) {
    const variant = await this.variantRepo.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');

    await this.variantRepo.delete(variantId);

    // Check if product has any remaining variants
    const remainingVariants = await this.variantRepo.findByProductIdAll(variant.productId.toString());
    if (remainingVariants.length === 0) {
      await this.productRepo.updateById(variant.productId.toString(), { hasVariants: false });
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
