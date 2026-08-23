import { Types } from 'mongoose';
import { Page, IPageDoc } from '../models/page.model';
import { Blog, IBlogDoc } from '../models/blog.model';
import { Product } from '../../catalog/models/product.model';
import { Category } from '../../catalog/models/category.model';
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
      Blog.find()
        .populate('author', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
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

    // Safe lastmod: an invalid/missing updatedAt on a single record must never
    // 500 the whole sitemap — fall back to today.
    const lastmod = (d: unknown): string => {
      const dt = d ? new Date(d as string | number | Date) : null;
      return dt && !isNaN(dt.getTime())
        ? dt.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    };
    const escapeXml = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const loc = (path: string): string => `${baseUrl}${escapeXml(path)}`;

    // Duplicate policy slugs whose content lives at a canonical slug; these are
    // 301-redirected at the edge, so they must not appear in the sitemap.
    const EXCLUDED_PAGE_SLUGS = new Set(['return-refund', 'terms-and-conditions']);

    // Canonical URLs carry a trailing slash (prerendered pages are directories
    // that 301 to add it) — emit the final slash form so Google indexes the
    // canonical URL directly instead of following a redirect for every entry.

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Homepage
    xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;

    // Products
    for (const p of products) {
      if (!p.slug) continue;
      xml += `  <url><loc>${loc(`/product/${p.slug}/`)}</loc><lastmod>${lastmod(p.updatedAt)}</lastmod><priority>0.8</priority></url>\n`;
    }

    // Categories
    for (const c of categories) {
      if (!c.slug) continue;
      xml += `  <url><loc>${loc(`/catalog/${c.slug}/`)}</loc><lastmod>${lastmod(c.updatedAt)}</lastmod><priority>0.7</priority></url>\n`;
    }

    // Pages (excluding duplicate policy slugs)
    for (const p of pages) {
      if (!p.slug || EXCLUDED_PAGE_SLUGS.has(p.slug)) continue;
      xml += `  <url><loc>${loc(`/page/${p.slug}/`)}</loc><lastmod>${lastmod(p.updatedAt)}</lastmod><priority>0.5</priority></url>\n`;
    }

    // Blog
    for (const b of blogs) {
      if (!b.slug) continue;
      xml += `  <url><loc>${loc(`/blog/${b.slug}/`)}</loc><lastmod>${lastmod(b.updatedAt)}</lastmod><priority>0.6</priority></url>\n`;
    }

    xml += '</urlset>';
    return xml;
  }
}
