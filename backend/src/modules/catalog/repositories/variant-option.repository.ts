import { BaseRepository } from '../../../core/base.repository';
import { VariantOption, IVariantOptionDoc } from '../models/variant-option.model';

export class VariantOptionRepository extends BaseRepository<IVariantOptionDoc> {
  constructor() {
    super(VariantOption);
  }

  async findAll(): Promise<IVariantOptionDoc[]> {
    return this.model.find().sort({ sortOrder: 1, key: 1 }).exec();
  }

  async findActive(): Promise<IVariantOptionDoc[]> {
    return this.model.find({ isActive: true }).sort({ sortOrder: 1, key: 1 }).exec();
  }

  async findByKey(key: string, excludeId?: string): Promise<IVariantOptionDoc | null> {
    const query: Record<string, unknown> = { key: { $regex: `^${escapeRegex(key)}$`, $options: 'i' } };
    if (excludeId) query._id = { $ne: excludeId };
    return this.model.findOne(query).exec();
  }
}

/** Escape user input before using it inside a RegExp. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
