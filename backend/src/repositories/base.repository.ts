import { Model, Document, UpdateQuery, SortOrder } from 'mongoose';

type Filter<T> = Record<string, unknown> & Partial<T>;

export class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async findMany(
    filter: Filter<T> = {} as Filter<T>,
    options: {
      skip?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: SortOrder;
    } = {},
  ): Promise<T[]> {
    const { skip = 0, limit = 20, sortBy = 'createdAt', sortOrder = -1 } = options;

    return this.model
      .find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create(data) as Promise<T>;
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, update, { new: true, runValidators: true }).exec();
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async count(filter: Filter<T> = {} as Filter<T>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async exists(filter: Filter<T>): Promise<boolean> {
    const doc = await this.model.exists(filter);
    return doc !== null;
  }
}
