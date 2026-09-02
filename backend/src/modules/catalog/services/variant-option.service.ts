import { VariantOptionRepository } from '../repositories/variant-option.repository';
import { IVariantOptionDoc } from '../models/variant-option.model';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';

export interface VariantOptionView {
  _id: string;
  key: string;
  values: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class VariantOptionService {
  private repo = new VariantOptionRepository();

  async listForAdmin(): Promise<VariantOptionView[]> {
    const options = await this.repo.findAll();
    return options.map(toView);
  }

  async listPublic(): Promise<VariantOptionView[]> {
    const options = await this.repo.findActive();
    // Hide options that have no values — nothing to filter/select by.
    return options.filter((o) => o.values.length > 0).map(toView);
  }

  async getById(id: string): Promise<VariantOptionView> {
    const option = await this.repo.findById(id);
    if (!option) throw new NotFoundError('Variant option not found');
    return toView(option);
  }

  async create(data: {
    key: string;
    values?: string[];
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<VariantOptionView> {
    const key = data.key.trim();
    if (!key) throw new BadRequestError('Option key is required');

    const existing = await this.repo.findByKey(key);
    if (existing) throw new BadRequestError(`Option "${key}" already exists`);

    const option = await this.repo.create({
      key,
      values: normalizeValues(data.values),
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    });
    return toView(option);
  }

  async update(
    id: string,
    data: {
      key?: string;
      values?: string[];
      isActive?: boolean;
      sortOrder?: number;
    },
  ): Promise<VariantOptionView> {
    const option = await this.repo.findById(id);
    if (!option) throw new NotFoundError('Variant option not found');

    const update: Record<string, unknown> = {};

    if (data.key !== undefined) {
      const key = data.key.trim();
      if (!key) throw new BadRequestError('Option key is required');
      const clash = await this.repo.findByKey(key, id);
      if (clash) throw new BadRequestError(`Option "${key}" already exists`);
      update.key = key;
    }
    if (data.values !== undefined) update.values = normalizeValues(data.values);
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

    await this.repo.updateById(id, update);
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const option = await this.repo.findById(id);
    if (!option) throw new NotFoundError('Variant option not found');
    await this.repo.deleteById(id);
  }
}

/** Trim values, drop empties, and dedupe (case-insensitive) while keeping order. */
function normalizeValues(values?: string[]): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    const lower = v.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(v);
  }
  return result;
}

function toView(option: IVariantOptionDoc): VariantOptionView {
  return {
    _id: option._id.toString(),
    key: option.key,
    values: option.values ?? [],
    isActive: option.isActive,
    sortOrder: option.sortOrder,
    createdAt: option.createdAt,
    updatedAt: option.updatedAt,
  };
}
