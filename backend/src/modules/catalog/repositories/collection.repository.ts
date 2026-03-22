import { BaseRepository } from '../../../core/base.repository';
import { Collection, ICollectionDoc } from '../models/collection.model';

export class CollectionRepository extends BaseRepository<ICollectionDoc> {
  constructor() {
    super(Collection);
  }

  async findBySlug(slug: string): Promise<ICollectionDoc | null> {
    return this.model.findOne({ slug }).exec();
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    return this.exists(query);
  }

  async findActive(): Promise<ICollectionDoc[]> {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async findFeatured(): Promise<ICollectionDoc[]> {
    return this.model.find({ isActive: true, isFeatured: true }).sort({ sortOrder: 1 }).exec();
  }

  async findAllForAdmin(
    options: {
      skip?: number;
      limit?: number;
      search?: string;
    } = {},
  ): Promise<{ collections: ICollectionDoc[]; total: number }> {
    const { skip = 0, limit = 20, search } = options;
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const [collections, total] = await Promise.all([
      this.model.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { collections, total };
  }
}
