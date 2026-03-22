import { CategoryRepository } from '../repositories/category.repository';
import { CategoryDTO } from '../dto';
import { slugify, ensureUniqueSlug } from '../../../utils/slugify';
import { BadRequestError, ConflictError, NotFoundError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

interface CategoryQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  isActive?: boolean;
}

export class CategoryService {
  private repo: CategoryRepository;

  constructor() {
    this.repo = new CategoryRepository();
  }

  async listForAdmin(query: CategoryQuery = {}) {
    const all = await this.repo.findAllForAdmin();

    let filtered = all;
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filtered = all.filter((c) => re.test(c.name) || re.test(c.description ?? ''));
    }
    if (query.isActive !== undefined) {
      filtered = filtered.filter((c) => c.isActive === query.isActive);
    }

    const { page, limit } = parsePagination(query);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    return {
      categories: paged.map((c) => CategoryDTO.toView(c)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async listPublic() {
    const roots = await this.repo.findRoots();
    return roots.map((c) => CategoryDTO.toView(c));
  }

  async getBySlug(slug: string) {
    const cat = await this.repo.findBySlug(slug);
    if (!cat) throw new NotFoundError('Category not found');
    return CategoryDTO.toView(cat);
  }

  async getById(id: string) {
    const cat = await this.repo.findById(id);
    if (!cat) throw new NotFoundError('Category not found');
    // Populate parent
    const populated = await this.repo.findAllForAdmin();
    const match = populated.find((c) => c._id.toString() === id);
    return CategoryDTO.toView(match ?? cat);
  }

  async create(data: {
    name: string;
    slug?: string;
    description?: string;
    image?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Validate parent
    if (data.parentId) {
      const parent = await this.repo.findById(data.parentId);
      if (!parent) throw new BadRequestError('Parent category not found');
      if (!parent.isActive)
        throw new BadRequestError('Cannot assign an inactive category as parent');
    }

    // Slug handling
    const baseSlug = slugify(data.slug || data.name);
    const slug = await ensureUniqueSlug(baseSlug, (s) => this.repo.slugExists(s));

    const cat = await this.repo.create({
      name: data.name,
      slug,
      description: data.description,
      image: data.image,
      parent: data.parentId ? (data.parentId as never) : null,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    });

    return CategoryDTO.toView(cat);
  }

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      image?: string;
      parentId?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const cat = await this.repo.findById(id);
    if (!cat) throw new NotFoundError('Category not found');

    // Prevent circular parent
    if (data.parentId && data.parentId === id) {
      throw new BadRequestError('Category cannot be its own parent');
    }

    // Validate parent is active
    if (data.parentId) {
      const parent = await this.repo.findById(data.parentId);
      if (!parent) throw new BadRequestError('Parent category not found');
      if (!parent.isActive)
        throw new BadRequestError('Cannot assign an inactive category as parent');
    }

    // Block deactivating a parent that has active children
    if (data.isActive === false) {
      const hasChildren = await this.repo.hasChildren(id);
      if (hasChildren)
        throw new BadRequestError(
          'Cannot deactivate a category that has subcategories. Deactivate children first.',
        );
    }

    // Slug update
    let slug: string | undefined;
    if (data.slug || data.name) {
      const baseSlug = slugify(data.slug ?? data.name ?? cat.name);
      if (baseSlug !== cat.slug) {
        slug = await ensureUniqueSlug(baseSlug, (s) => this.repo.slugExists(s, id));
      }
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (slug !== undefined) update.slug = slug;
    if (data.description !== undefined) update.description = data.description;
    if (data.image !== undefined) update.image = data.image;
    if (data.parentId !== undefined) update.parent = data.parentId ?? null;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

    await this.repo.updateById(id, update);
    return this.getById(id);
  }

  async delete(id: string) {
    const cat = await this.repo.findById(id);
    if (!cat) throw new NotFoundError('Category not found');

    const hasChildren = await this.repo.hasChildren(id);
    if (hasChildren) {
      throw new ConflictError('Cannot delete a category that has subcategories');
    }

    await this.repo.deleteById(id);
  }

  async deleteAll() {
    const count = await this.repo.deleteAll();
    return { deletedCount: count };
  }
}
