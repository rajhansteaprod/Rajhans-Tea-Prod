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
    discountedPrice?: number;
    images?: string[];
    reflectedImage: string;
    attributes?: Record<string, string>;
    tags?: string[];
    status?: ProductStatus;
    isFeatured?: boolean;
    stock?: number;
    trackInventory?: boolean;
  }) {
    // Validate category
    const category = await this.categoryRepo.findById(data.categoryId);
    if (!category) throw new BadRequestError('Category not found');

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
      discountedPrice: data.discountedPrice,
      images: data.images ?? [],
      reflectedImage: data.reflectedImage,
      attributes: attributesMap as never,
      tags: (data.tags ?? []).map((t) => t.toLowerCase().trim()),
      status: data.status ?? 'draft',
      isFeatured: data.isFeatured ?? false,
      stock: data.stock ?? 0,
      trackInventory: data.trackInventory ?? false,
      hasVariants: false,
    });

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
      discountedPrice?: number;
      images?: string[];
      reflectedImage?: string;
      attributes?: Record<string, string>;
      tags?: string[];
      status?: ProductStatus;
      isFeatured?: boolean;
      stock?: number;
      trackInventory?: boolean;
    },
  ) {
    const product = await this.productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    if (data.categoryId) {
      const category = await this.categoryRepo.findById(data.categoryId);
      if (!category) throw new BadRequestError('Category not found');
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
    if (data.discountedPrice !== undefined) update.discountedPrice = data.discountedPrice;
    if (data.images !== undefined) update.images = data.images;
    if (data.reflectedImage !== undefined) update.reflectedImage = data.reflectedImage;
    if (data.attributes !== undefined) {
      update.attributes = new Map(Object.entries(data.attributes));
    }
    if (data.tags !== undefined) {
      update.tags = data.tags.map((t) => t.toLowerCase().trim());
    }
    if (data.status !== undefined) update.status = data.status;
    if (data.isFeatured !== undefined) update.isFeatured = data.isFeatured;
    if (data.stock !== undefined) update.stock = data.stock;
    if (data.trackInventory !== undefined) update.trackInventory = data.trackInventory;

    await this.productRepo.updateById(id, update);
    this.updateBasePricingByVariant(id); // in case price/discount changed and variants exist, update base price and discounted price accordinglyt
    this.updateBasePricingByVariant(id);
    return this.getById(id);
  }

  async delete(id: string) {
    const product = await this.productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    await this.productRepo.deleteById(id);
  }
  async updateBasePricingByVariant(productId: string) {
    const variants = await this.variantRepo.findByProductId(productId);
    if (variants.length === 0) {
      return;
    }

    const basePrice = Math.min(...variants.map((v) => v.price));
    await this.productRepo.updateById(productId, { basePrice });
    const discountedPrice = variants.some((v) => v.discountedPrice && v.discountedPrice < v.price)
      ? Math.min(...variants.map((v) => v.discountedPrice ?? v.price))
      : undefined;
    const product=await this.productRepo.updateById(productId, { discountedPrice });
    logger.info(`Updating base pricing  for product ${productId} new basePrice: ${product!.basePrice}, discountedPrice: ${product!.discountedPrice} from ${basePrice} and ${discountedPrice} of variants`);
  }
}
