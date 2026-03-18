import { BaseRepository } from './base.repository';
import { Category, ICategoryDoc } from '../models/category.model';

export class CategoryRepository extends BaseRepository<ICategoryDoc> {
  constructor() {
    super(Category);
  }

  async findBySlug(slug: string): Promise<ICategoryDoc | null> {
    return this.model.findOne({ slug }).exec();
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    return this.exists(query);
  }

  async findRoots(): Promise<ICategoryDoc[]> {
    return this.model.find({ parent: null, isActive: true }).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async findChildren(parentId: string): Promise<ICategoryDoc[]> {
    return this.model
      .find({ parent: parentId, isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async findAllForAdmin(): Promise<ICategoryDoc[]> {
    return this.model.find().populate('parent', 'name slug').sort({ sortOrder: 1, name: 1 }).exec();
  }

  async hasChildren(categoryId: string): Promise<boolean> {
    return this.model.exists({ parent: categoryId }).then((r) => r !== null);
  }
}
