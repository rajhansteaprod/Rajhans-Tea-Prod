import { Product, IProductDoc } from '../../../models/product.model';
import { Category } from '../../../models/category.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc' | 'featured';
  categoryId?: string;
  categorySlug?: string;
  collectionId?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  tags?: string[];
}

export interface SearchFacets {
  categories: { _id: string; name: string; slug: string; count: number }[];
  priceRange: { min: number; max: number };
  tags: { tag: string; count: number }[];
}

export interface SearchResult {
  products: IProductDoc[];
  meta: ReturnType<typeof buildPaginationMeta>;
  facets: SearchFacets;
}

export class SearchRepository {
  async search(params: SearchParams): Promise<SearchResult> {
    const { page, limit, skip } = parsePagination({
      page: params.page,
      limit: params.limit || 20,
    });

    // Resolve category slug to ID
    let categoryId = params.categoryId;
    if (params.categorySlug && !categoryId) {
      const cat = await Category.findOne({ slug: params.categorySlug }).exec();
      if (cat) categoryId = cat._id.toString();
    }

    // Build match filter
    const matchFilter: Record<string, unknown> = { status: 'active' };
    if (categoryId) matchFilter.category = categoryId;
    if (params.collectionId) matchFilter.collections = params.collectionId;
    if (params.priceMin !== undefined || params.priceMax !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (params.priceMin !== undefined) priceFilter.$gte = params.priceMin;
      if (params.priceMax !== undefined) priceFilter.$lte = params.priceMax;
      matchFilter.basePrice = priceFilter;
    }
    if (params.inStock) matchFilter.stock = { $gt: 0 };
    if (params.tags && params.tags.length > 0) matchFilter.tags = { $in: params.tags };

    // Try $text search first
    let products: IProductDoc[];
    let total: number;
    // track search method for future analytics

    if (params.q && params.q.trim()) {
      try {
        const textFilter = { ...matchFilter, $text: { $search: params.q } };
        total = await Product.countDocuments(textFilter).exec();

        if (total > 0) {
          // text search matched
          const sortOption = this.buildSort(params.sort, true);
          products = await Product.find(textFilter, { score: { $meta: 'textScore' } })
            .populate('category', 'name slug')
            .populate('collections', 'name slug')
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .exec();
        } else {
          // Fallback: regex search for fuzzy matching
          const regexFilter = { ...matchFilter };
          const words = params.q.trim().split(/\s+/).filter(Boolean);
          const regexOr = words.map((w) => ({
            $or: [
              { name: { $regex: w, $options: 'i' } },
              { description: { $regex: w, $options: 'i' } },
              { tags: { $regex: w, $options: 'i' } },
            ],
          }));
          if (regexOr.length > 0) {
            (regexFilter as any).$and = regexOr;
          }

          total = await Product.countDocuments(regexFilter).exec();
          const sortOption = this.buildSort(params.sort, false);
          products = await Product.find(regexFilter)
            .populate('category', 'name slug')
            .populate('collections', 'name slug')
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .exec();
        }
      } catch {
        // $text search failed (no text index?) — fallback to regex
        const regexFilter = { ...matchFilter, name: { $regex: params.q, $options: 'i' } };
        total = await Product.countDocuments(regexFilter).exec();
        products = await Product.find(regexFilter)
          .populate('category', 'name slug')
          .populate('collections', 'name slug')
          .sort(this.buildSort(params.sort, false))
          .skip(skip)
          .limit(limit)
          .exec();
      }
    } else {
      // No query — browse mode
      total = await Product.countDocuments(matchFilter).exec();
      products = await Product.find(matchFilter)
        .populate('category', 'name slug')
        .populate('collections', 'name slug')
        .sort(this.buildSort(params.sort, false))
        .skip(skip)
        .limit(limit)
        .exec();
    }

    // Build facets
    const facets = await this.buildFacets(matchFilter, params.q);

    return {
      products,
      meta: buildPaginationMeta(page, limit, total),
      facets,
    };
  }

  async autocomplete(query: string, limit = 8): Promise<{ type: 'product' | 'category'; name: string; slug: string; image?: string }[]> {
    const regex = { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' };

    const [products, categories] = await Promise.all([
      Product.find({ name: regex, status: 'active' })
        .select('name slug images')
        .limit(Math.ceil(limit * 0.7))
        .exec(),
      Category.find({ name: regex, isActive: true })
        .select('name slug')
        .limit(Math.ceil(limit * 0.3))
        .exec(),
    ]);

    const suggestions: { type: 'product' | 'category'; name: string; slug: string; image?: string }[] = [];

    for (const p of products) {
      suggestions.push({ type: 'product', name: p.name, slug: p.slug, image: p.images?.[0] });
    }
    for (const c of categories) {
      suggestions.push({ type: 'category', name: c.name, slug: c.slug });
    }

    return suggestions.slice(0, limit);
  }

  private buildSort(sort: string | undefined, hasTextScore: boolean): Record<string, any> {
    switch (sort) {
      case 'price_asc': return { basePrice: 1 };
      case 'price_desc': return { basePrice: -1 };
      case 'newest': return { createdAt: -1 };
      case 'name_asc': return { name: 1 };
      case 'featured': return { isFeatured: -1, createdAt: -1 };
      case 'relevance':
      default:
        return hasTextScore ? { score: { $meta: 'textScore' }, isFeatured: -1 } : { isFeatured: -1, createdAt: -1 };
    }
  }

  private async buildFacets(_baseFilter: Record<string, unknown>, query?: string): Promise<SearchFacets> {
    const activeFilter: Record<string, unknown> = { status: 'active' };
    if (query) {
      try {
        activeFilter.$text = { $search: query };
      } catch {
        activeFilter.name = { $regex: query, $options: 'i' };
      }
    }

    const [categoryFacets, priceAgg, tagAgg] = await Promise.all([
      Product.aggregate([
        { $match: activeFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'cat',
          },
        },
        { $unwind: '$cat' },
        { $project: { _id: { $toString: '$_id' }, name: '$cat.name', slug: '$cat.slug', count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).exec(),

      Product.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, min: { $min: '$basePrice' }, max: { $max: '$basePrice' } } },
      ]).exec(),

      Product.aggregate([
        { $match: { status: 'active' } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
      ]).exec(),
    ]);

    return {
      categories: categoryFacets,
      priceRange: {
        min: priceAgg[0]?.min ?? 0,
        max: priceAgg[0]?.max ?? 0,
      },
      tags: tagAgg,
    };
  }
}
