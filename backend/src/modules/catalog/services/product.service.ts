import { ProductRepository } from '../repositories/product.repository';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { CategoryRepository } from '../repositories/category.repository';
import { CollectionRepository } from '../repositories/collection.repository';
import { ProductDTO } from '../dto';
import { slugify, ensureUniqueSlug } from '../../../utils/slugify';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';
import { ProductStatus } from '../models/product.model';
import {logger} from '../../../utils/logger';
interface ProductListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  categoryId?: string;
  collectionId?: string;
  status?: ProductStatus | 'all';
  isFeatured?: boolean;
  priceMin?: number;
  priceMax?: number;
  tags?: string[];
  region?: string;
  bestTakenFor?: string;
  weight?: string;
}

/** A variant supplied inline with the product create/update payload. */
export interface InlineVariantInput {
  _id?: string;
  optionKey?: string;
  optionValue: string;
  price: number;
  discountedPrice?: number | null;
  stock?: number;
}

export class ProductService {
  private productRepo: ProductRepository;
  private variantRepo: ProductVariantRepository;
  private categoryRepo: CategoryRepository;
  private collectionRepo: CollectionRepository;

  constructor() {
    this.productRepo = new ProductRepository();
    this.variantRepo = new ProductVariantRepository();
    this.categoryRepo = new CategoryRepository();
    this.collectionRepo = new CollectionRepository();
  }

  async list(query: ProductListQuery = {}) {
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(query);

    const status = query.status === 'all' ? undefined : (query.status as ProductStatus | undefined);

    const { products, total } = await this.productRepo.findList({
      skip,
      limit,
      sortBy,
      sortOrder,
      search: query.search,
      categoryId: query.categoryId,
      collectionId: query.collectionId,
      status,
      isFeatured: query.isFeatured,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      tags: query.tags,
      region: query.region,
      bestTakenFor: query.bestTakenFor,
      weight: query.weight,
    });

    return {
      products: products.map((p) => ProductDTO.toAdmin(p)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async listPublic(query: ProductListQuery = {}) {
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(query);

    const { products, total } = await this.productRepo.findList({
      skip,
      limit,
      sortBy,
      sortOrder,
      search: query.search,
      categoryId: query.categoryId,
      collectionId: query.collectionId,
      status: 'active' as ProductStatus,
      isFeatured: query.isFeatured,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      tags: query.tags,
      region: query.region,
      bestTakenFor: query.bestTakenFor,
      weight: query.weight,
    });

    // Fetch variants for products that have them
    const productsWithVariants = await Promise.all(
      products.map(async (p) => {
        if (p.hasVariants) {
          const variants = await this.variantRepo.findByProductId(p._id.toString());
          return ProductDTO.toPublic(p, variants);
        }
        return ProductDTO.toPublic(p);
      })
    );

    return {
      products: productsWithVariants,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async getBySlug(slug: string) {
    const product = await this.productRepo.findBySlug(slug);
    if (!product) throw new NotFoundError('Product not found');
    const variants = product.hasVariants
      ? await this.variantRepo.findByProductId(product._id.toString())
      : undefined;
    return ProductDTO.toPublic(product, variants);
  }

  async getById(id: string) {
    const product = await this.productRepo.findByIdPopulated(id);
    if (!product) throw new NotFoundError('Product not found');
    const variants = product.hasVariants
      ? await this.variantRepo.findByProductIdAll(product._id.toString())
      : undefined;
    return ProductDTO.toAdmin(product, variants);
  }

  async create(data: {
    name: string;
    slug?: string;
    description?: string;
    shortDescription?: string;
    categoryId: string;
    collectionIds?: string[];
    basePrice: number;
    discountedPrice?: number | null;
    images?: string[];
    primaryImage?: string;
    imageAltText?: string;
    reflectedImage?: string;
    attributes?: Record<string, string>;
    tags?: string[];
    region?: string | null;
    bestTakenFor?: string[] | null;
    status?: ProductStatus;
    isFeatured?: boolean;
    showBadge?: boolean;
    badgeText?: string;
    stock?: number;
    trackInventory?: boolean;
    hasVariants?: boolean;
    variants?: InlineVariantInput[];
  }) {
    // Validate category
    const category = await this.categoryRepo.findById(data.categoryId);
    if (!category) throw new BadRequestError('Category not found');

    // A discounted price must be a real discount
    if (
      data.discountedPrice !== undefined &&
      data.discountedPrice !== null &&
      data.discountedPrice >= data.basePrice
    ) {
      throw new BadRequestError('discountedPrice must be lower than basePrice');
    }

    // Validate collections
    if (data.collectionIds?.length) {
      for (const colId of data.collectionIds) {
        const exists = await this.collectionRepo.findById(colId);
        if (!exists) throw new BadRequestError(`Collection ${colId} not found`);
      }
    }

    const baseSlug = slugify(data.slug || data.name);
    const slug = await ensureUniqueSlug(baseSlug, (s) => this.productRepo.slugExists(s));

    const attributesMap = new Map<string, string>(Object.entries(data.attributes ?? {}));

    const product = await this.productRepo.create({
      name: data.name,
      slug,
      description: data.description,
      shortDescription: data.shortDescription,
      category: data.categoryId as never,
      collections: (data.collectionIds ?? []) as never,
      basePrice: data.basePrice,
      discountedPrice: data.discountedPrice ?? undefined,
      images: data.images ?? [],
      primaryImage: data.primaryImage,
      imageAltText: data.imageAltText,
      reflectedImage: data.reflectedImage,
      attributes: attributesMap as never,
      tags: (data.tags ?? []).map((t) => t.toLowerCase().trim()),
      region: (data.region ?? undefined) as any,
      bestTakenFor: (data.bestTakenFor?.length ? data.bestTakenFor : undefined) as any,
      status: data.status ?? 'draft',
      isFeatured: data.isFeatured ?? false,
      showBadge: data.showBadge ?? false,
      badgeText: data.badgeText,
      stock: data.stock ?? 0,
      trackInventory: data.trackInventory ?? false,
      // Admin's declared intent; the variant service flips this automatically
      // as variants are added/removed.
      hasVariants: data.hasVariants ?? false,
    });

    logger.info(
      { productId: product._id.toString(), slug, name: data.name, status: data.status ?? 'draft' },
      'Product created',
    );

    // Create any inline variants. The variant service flips hasVariants=true and
    // syncs the product's base/discounted price from the cheapest variant.
    if (data.hasVariants && data.variants?.length) {
      await this.reconcileVariants(product._id.toString(), data.variants);
    }

    return this.getById(product._id.toString());
  }

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      shortDescription?: string;
      categoryId?: string;
      collectionIds?: string[];
      basePrice?: number;
      discountedPrice?: number | null; // null clears an existing discount
      images?: string[];
      primaryImage?: string;
      imageAltText?: string;
      reflectedImage?: string;
      attributes?: Record<string, string>;
      tags?: string[];
      region?: string | null; // null clears the field
      bestTakenFor?: string[] | null; // null/empty clears the field
      status?: ProductStatus;
      isFeatured?: boolean;
      showBadge?: boolean;
      badgeText?: string;
      stock?: number;
      trackInventory?: boolean;
      hasVariants?: boolean;
      variants?: InlineVariantInput[];
    },
  ) {
    const product = await this.productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    if (data.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) throw new BadRequestError('Category not found');
    }

    // Validate discountedPrice against the effective basePrice
    const effectiveBasePrice = data.basePrice ?? product.basePrice;
    const effectiveDiscounted = data.discountedPrice !== undefined ? data.discountedPrice : product.discountedPrice;
    if (
      effectiveDiscounted !== undefined &&
      effectiveDiscounted !== null &&
      effectiveDiscounted >= effectiveBasePrice
    ) {
      throw new BadRequestError('discountedPrice must be lower than basePrice');
    }

    if (data.collectionIds?.length) {
      for (const colId of data.collectionIds) {
        const exists = await this.collectionRepo.findById(colId);
        if (!exists) throw new BadRequestError(`Collection ${colId} not found`);
      }
    }

    let slug: string | undefined;
    if (data.slug || data.name) {
      const baseSlug = slugify(data.slug ?? data.name ?? product.name);
      if (baseSlug !== product.slug) {
        slug = await ensureUniqueSlug(baseSlug, (s) => this.productRepo.slugExists(s, id));
      }
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (slug !== undefined) update.slug = slug;
    if (data.description !== undefined) update.description = data.description;
    if (data.shortDescription !== undefined) update.shortDescription = data.shortDescription;
    if (data.categoryId !== undefined) update.category = data.categoryId;
    if (data.collectionIds !== undefined) update.collections = data.collectionIds;
    if (data.basePrice !== undefined) update.basePrice = data.basePrice;
    // null → remove the discount entirely; a number → set it
    let clearDiscount = false;
    if (data.discountedPrice === null) {
      clearDiscount = true;
    } else if (data.discountedPrice !== undefined) {
      update.discountedPrice = data.discountedPrice;
    }
    if (data.images !== undefined) update.images = data.images;
    if (data.primaryImage !== undefined) update.primaryImage = data.primaryImage;
    if (data.imageAltText !== undefined) update.imageAltText = data.imageAltText;
    if (data.reflectedImage !== undefined) update.reflectedImage = data.reflectedImage;
    if (data.attributes !== undefined) {
      update.attributes = new Map(Object.entries(data.attributes));
    }
    if (data.tags !== undefined) {
      update.tags = data.tags.map((t) => t.toLowerCase().trim());
    }
    // Optional enum fields: null clears them ($unset), a value sets them.
    // Setting null directly would trip Mongoose enum validation.
    const unset: Record<string, 1> = {};
    if (data.region === null) unset.region = 1;
    else if (data.region !== undefined) update.region = data.region;
    // null or an empty array clears the field; a non-empty array sets it
    if (data.bestTakenFor === null || (Array.isArray(data.bestTakenFor) && data.bestTakenFor.length === 0)) {
      unset.bestTakenFor = 1;
    } else if (data.bestTakenFor !== undefined) {
      update.bestTakenFor = data.bestTakenFor;
    }
    if (clearDiscount) unset.discountedPrice = 1;

    if (data.status !== undefined) update.status = data.status;
    if (data.isFeatured !== undefined) update.isFeatured = data.isFeatured;
    if (data.showBadge !== undefined) update.showBadge = data.showBadge;
    if (data.badgeText !== undefined) update.badgeText = data.badgeText;
    if (data.stock !== undefined) update.stock = data.stock;
    if (data.trackInventory !== undefined) update.trackInventory = data.trackInventory;
    if (data.hasVariants !== undefined) update.hasVariants = data.hasVariants;

    const updateQuery = Object.keys(unset).length > 0
      ? { $set: update, $unset: unset }
      : update;
    await this.productRepo.updateById(id, updateQuery as never);

    // Reconcile inline variants when the payload carries them.
    //  - hasVariants=true  → create/update/delete to match the incoming list
    //  - hasVariants=false → drop all variants (product reverts to flat pricing)
    if (data.variants !== undefined) {
      await this.reconcileVariants(id, data.hasVariants === false ? [] : data.variants);
    } else if (data.hasVariants === false) {
      await this.reconcileVariants(id, []);
    }

    // If the product has variants, base/discounted price mirror the cheapest variant
    await this.updateBasePricingByVariant(id);

    logger.info(
      { productId: id, changedFields: [...Object.keys(update), ...Object.keys(unset)] },
      'Product updated',
    );

    return this.getById(id);
  }

  /**
   * Reconcile a product's variants against an inline list (single option key
   * per product). Rows with `_id` are updated, rows without are created, and
   * existing variants absent from the list are deleted. Delegates to
   * ProductVariantService so cart cleanup, the hasVariants flag, and base-price
   * sync all stay correct.
   */
  async reconcileVariants(productId: string, incoming: InlineVariantInput[]): Promise<void> {
    const { ProductVariantService } = await import('./product-variant.service');
    const variantService = new ProductVariantService();

    const existing = await this.variantRepo.findByProductIdAll(productId);
    const incomingIds = new Set(incoming.filter((v) => v._id).map((v) => v._id));

    // Delete variants that are no longer present
    for (const ex of existing) {
      if (!incomingIds.has(ex._id.toString())) {
        await variantService.delete(ex._id.toString());
      }
    }

    // Create or update the incoming variants
    for (const v of incoming) {
      const payload = {
        name: v.optionValue,
        optionKey: v.optionKey,
        optionValue: v.optionValue,
        price: v.price,
        discountedPrice: v.discountedPrice ?? null,
        stock: v.stock ?? 0,
      };
      if (v._id) {
        await variantService.update(v._id, payload);
      } else {
        await variantService.create(productId, payload);
      }
    }
  }

  async delete(id: string) {
    const product = await this.productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    // Remove dependent records so no orphans are left behind:
    // variants of this product, and cart lines referencing it.
    const { ProductVariant } = await import('../models/product-variant.model');
    const { Cart } = await import('../../cart/models/cart.model');
    await ProductVariant.deleteMany({ productId: product._id }).exec();
    await Cart.updateMany(
      { 'items.productId': product._id },
      { $pull: { items: { productId: product._id } } },
    ).exec();

    await this.productRepo.deleteById(id);

    logger.info({ productId: id, name: product.name, slug: product.slug }, 'Product deleted');
  }

  async updateBasePricingByVariant(productId: string) {
    const variants = await this.variantRepo.findByProductId(productId);
    if (variants.length === 0) {
      return;
    }

    const basePrice = Math.min(...variants.map((v) => v.price));
    const hasDiscount = variants.some((v) => v.discountedPrice && v.discountedPrice < v.price);
    const discountedPrice = hasDiscount
      ? Math.min(...variants.map((v) => v.discountedPrice ?? v.price))
      : undefined;

    // $unset clears a stale discountedPrice when no variant is discounted
    const update = hasDiscount
      ? { $set: { basePrice, discountedPrice } }
      : { $set: { basePrice }, $unset: { discountedPrice: 1 } };

    const product = await this.productRepo.updateById(productId, update as never);
    if (product) {
      logger.info(
        `Synced product ${productId} pricing from variants: basePrice=${basePrice}, discountedPrice=${discountedPrice ?? 'none'}`,
      );
    }
  }
}
