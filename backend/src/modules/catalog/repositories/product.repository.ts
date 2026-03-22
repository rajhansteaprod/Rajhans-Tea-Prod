import { Types } from 'mongoose';
import { BaseRepository } from '../../../core/base.repository';
import { Product, IProductDoc, ProductStatus } from '../models/product.model';

interface ProductListOptions {
  skip?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 1 | -1;
  search?: string;
  categoryId?: string;
  collectionId?: string;
  status?: ProductStatus | ProductStatus[];
  isFeatured?: boolean;
}

export class ProductRepository extends BaseRepository<IProductDoc> {
  constructor() {
    super(Product);
  }

  async findBySlug(slug: string): Promise<IProductDoc | null> {
    return this.model
      .findOne({ slug })
      .populate('category', 'name slug')
      .populate('collections', 'name slug')
      .exec();
  }

  async findByIdPopulated(id: string): Promise<IProductDoc | null> {
    return this.model
      .findById(id)
      .populate('category', 'name slug')
      .populate('collections', 'name slug')
      .exec();
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    return this.exists(query);
  }

  async findList(
    options: ProductListOptions = {},
  ): Promise<{ products: IProductDoc[]; total: number }> {
    const {
      skip = 0,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = -1,
      search,
      categoryId,
      collectionId,
      status,
      isFeatured,
    } = options;

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    if (categoryId) filter.category = new Types.ObjectId(categoryId);

    if (collectionId) filter.collections = new Types.ObjectId(collectionId);

    if (status) {
      filter.status = Array.isArray(status) ? { $in: status } : status;
    }

    if (isFeatured !== undefined) filter.isFeatured = isFeatured;

    const [products, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('category', 'name slug')
        .populate('collections', 'name slug')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { products, total };
  }

  async countByCategory(categoryId: string): Promise<number> {
    return this.model.countDocuments({ category: categoryId }).exec();
  }

  async countByCollection(collectionId: string): Promise<number> {
    return this.model.countDocuments({ collections: collectionId }).exec();
  }

  async countByStatus(status: ProductStatus): Promise<number> {
    return this.model.countDocuments({ status }).exec();
  }
}
