import { CollectionRepository } from '../repositories/collection.repository';
import { ProductRepository } from '../repositories/product.repository';
import { CollectionDTO } from '../dto';
import { slugify, ensureUniqueSlug } from '../../../utils/slugify';
import { NotFoundError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

interface CollectionQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export class CollectionService {
  private repo: CollectionRepository;
  private productRepo: ProductRepository;

  constructor() {
    this.repo = new CollectionRepository();
    this.productRepo = new ProductRepository();
  }

  async listForAdmin(query: CollectionQuery = {}) {
    const { page, limit, skip } = parsePagination(query);
    const { collections, total } = await this.repo.findAllForAdmin({
      skip,
      limit,
      search: query.search,
    });

    const withCounts = await Promise.all(
      collections.map(async (c) => {
        const count = await this.productRepo.countByCollection(c._id.toString());
        return CollectionDTO.toView(c, count);
      }),
    );

    return { collections: withCounts, meta: buildPaginationMeta(page, limit, total) };
  }

  async listPublic() {
    const cols = await this.repo.findActive();
    return cols.map((c) => CollectionDTO.toView(c));
  }

  async getBySlug(slug: string) {
    const col = await this.repo.findBySlug(slug);
    if (!col) throw new NotFoundError('Collection not found');

    const { products } = await this.productRepo.findList({
      collectionId: col._id.toString(),
      status: 'active',
    });

    return {
      collection: CollectionDTO.toView(col, products.length),
    };
  }

  async getById(id: string) {
    const col = await this.repo.findById(id);
    if (!col) throw new NotFoundError('Collection not found');
    const count = await this.productRepo.countByCollection(id);
    return CollectionDTO.toView(col, count);
  }

  async create(data: {
    name: string;
    slug?: string;
    description?: string;
    image?: string;
    isFeatured?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const baseSlug = slugify(data.slug || data.name);
    const slug = await ensureUniqueSlug(baseSlug, (s) => this.repo.slugExists(s));

    const col = await this.repo.create({
      name: data.name,
      slug,
      description: data.description,
      image: data.image,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      sortOrder: data.sortOrder ?? 0,
    });

    return CollectionDTO.toView(col, 0);
  }

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      image?: string;
      isActive?: boolean;
      isFeatured?: boolean;
      sortOrder?: number;
    },
  ) {
    const col = await this.repo.findById(id);
    if (!col) throw new NotFoundError('Collection not found');

    let slug: string | undefined;
    if (data.slug || data.name) {
      const baseSlug = slugify(data.slug ?? data.name ?? col.name);
      if (baseSlug !== col.slug) {
        slug = await ensureUniqueSlug(baseSlug, (s) => this.repo.slugExists(s, id));
      }
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (slug !== undefined) update.slug = slug;
    if (data.description !== undefined) update.description = data.description;
    if (data.image !== undefined) update.image = data.image;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.isFeatured !== undefined) update.isFeatured = data.isFeatured;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

    await this.repo.updateById(id, update);
    return this.getById(id);
  }

  async delete(id: string) {
    const col = await this.repo.findById(id);
    if (!col) throw new NotFoundError('Collection not found');
    await this.repo.deleteById(id);
  }
}
