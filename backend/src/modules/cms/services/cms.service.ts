import { Types } from 'mongoose';
import { Page, IPageDoc } from '../models/page.model';
import { Blog, IBlogDoc } from '../models/blog.model';
import { Product } from '../../../models/product.model';
import { Category } from '../../../models/category.model';
import { NotFoundError } from '../../../utils/api-error';
import { slugify } from '../../../utils/slugify';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class CmsService {
  // ─── Pages ────────────────────────────────────────────────────────────────

  async getPageBySlug(slug: string) {
    const page = await Page.findOne({ slug, status: 'published' }).exec();
    if (!page) throw new NotFoundError('Page not found');
    return page;
  }

  async listPages() {
    return Page.find().sort({ title: 1 }).exec();
  }

  async createPage(data: Partial<IPageDoc>, adminUserId: string) {
    if (!data.slug && data.title) data.slug = slugify(data.title);
    data.updatedBy = new Types.ObjectId(adminUserId);
    return Page.create(data);
  }

  async updatePage(id: string, data: Partial<IPageDoc>, adminUserId: string) {
    data.updatedBy = new Types.ObjectId(adminUserId);
    const page = await Page.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    if (!page) throw new NotFoundError('Page not found');
    return page;
  }

  async deletePage(id: string) {
    await Page.findByIdAndDelete(id).exec();
  }

  // ─── Blog ─────────────────────────────────────────────────────────────────

  async listPublishedBlogs(query: { page?: number; limit?: number; tag?: string } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { status: 'published' };
    if (query.tag) filter.tags = query.tag;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .populate('author', 'firstName lastName phone')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Blog.countDocuments(filter).exec(),
    ]);
    return { blogs, meta: buildPaginationMeta(page, limit, total) };
  }

  async getBlogBySlug(slug: string) {
    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('author', 'firstName lastName phone')
      .exec();
    if (!blog) throw new NotFoundError('Blog post not found');
    return blog;
  }

  async listAllBlogs(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const [blogs, total] = await Promise.all([
      Blog.find().populate('author', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Blog.countDocuments().exec(),
    ]);
    return { blogs, meta: buildPaginationMeta(page, limit, total) };
  }

  async createBlog(data: Partial<IBlogDoc>, authorId: string) {
    if (!data.slug && data.title) data.slug = slugify(data.title);
    data.author = new Types.ObjectId(authorId);
    if (data.status === 'published' && !data.publishedAt) data.publishedAt = new Date();
    return Blog.create(data);
  }

  async updateBlog(id: string, data: Partial<IBlogDoc>) {
    if (data.status === 'published') {
      const existing = await Blog.findById(id).exec();
      if (existing && !existing.publishedAt) data.publishedAt = new Date();
    }
    const blog = await Blog.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    if (!blog) throw new NotFoundError('Blog not found');
    return blog;
  }

  async deleteBlog(id: string) {
    await Blog.findByIdAndDelete(id).exec();
  }

  // ─── SEO — Sitemap ────────────────────────────────────────────────────────

  async generateSitemap(baseUrl: string): Promise<string> {
    const [products, categories, pages, blogs] = await Promise.all([
      Product.find({ status: 'active' }).select('slug updatedAt').lean().exec(),
      Category.find({ isActive: true }).select('slug updatedAt').lean().exec(),
      Page.find({ status: 'published' }).select('slug updatedAt').lean().exec(),
      Blog.find({ status: 'published' }).select('slug updatedAt').lean().exec(),
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Homepage
    xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;

    // Products
    for (const p of products) {
      xml += `  <url><loc>${baseUrl}/product/${p.slug}</loc><lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod><priority>0.8</priority></url>\n`;
    }

    // Categories
    for (const c of categories) {
      xml += `  <url><loc>${baseUrl}/catalog/${c.slug}</loc><lastmod>${new Date(c.updatedAt).toISOString().slice(0, 10)}</lastmod><priority>0.7</priority></url>\n`;
    }

    // Pages
    for (const p of pages) {
      xml += `  <url><loc>${baseUrl}/page/${p.slug}</loc><lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod><priority>0.5</priority></url>\n`;
    }

    // Blog
    for (const b of blogs) {
      xml += `  <url><loc>${baseUrl}/blog/${b.slug}</loc><lastmod>${new Date(b.updatedAt).toISOString().slice(0, 10)}</lastmod><priority>0.6</priority></url>\n`;
    }

    xml += '</urlset>';
    return xml;
  }
}
