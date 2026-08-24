import { Product } from '../../catalog/models/product.model';
import { Category } from '../../catalog/models/category.model';
import { Page } from '../../cms/models/page.model';
import { Blog } from '../../cms/models/blog.model';
import { seoConfig } from '../seo.config';
import { normalizeUrl } from '../seo.util';
import { fetchRaw } from './fetcher.service';
import { parseSitemapLocs } from './parser.service';
import { logger } from '../../../utils/logger';

export interface Inventory {
  /** URLs to crawl (absolute, normalized, deduped). */
  urls: string[];
  /** Normalized <loc> set from sitemap.xml — the analyzer diffs against this. */
  sitemapUrls: Set<string>;
  robotsAccessible: boolean;
}

/**
 * Build the authoritative URL set. Discovery is driven by the DB (reusing the
 * same models the sitemap is generated from) + sitemap.xml + a fixed list of
 * important static routes — NOT by crawl-following alone, because prerendered
 * list/home pages ship with few links in their static HTML.
 */
export async function buildInventory(): Promise<Inventory> {
  const base = seoConfig.baseUrl;
  const urlSet = new Set<string>();
  const add = (path: string) => urlSet.add(normalizeUrl(`${base}${path}`));

  // 1) Important static routes (always audited).
  for (const p of seoConfig.importantStaticPaths) add(p);

  // 2) DB-driven canonical URLs (trailing slash, matching the sitemap).
  const [products, categories, pages, blogs] = await Promise.all([
    Product.find({ status: 'active' }).select('slug').lean().exec(),
    Category.find({ isActive: true }).select('slug').lean().exec(),
    Page.find({ status: 'published' }).select('slug').lean().exec(),
    Blog.find({ status: 'published' }).select('slug').lean().exec(),
  ]);
  for (const p of products) if (p.slug) add(`/product/${p.slug}/`);
  for (const c of categories) if (c.slug) add(`/catalog/${c.slug}/`);
  for (const p of pages) if (p.slug) add(`/page/${p.slug}/`);
  for (const b of blogs) if (b.slug) add(`/blog/${b.slug}/`);

  // 3) Sitemap URLs — both to audit and to power sitemap-consistency checks.
  const sitemapUrls = new Set<string>();
  let robotsAccessible = false;
  try {
    const sm = await fetchRaw(`${base}/sitemap.xml`);
    if (sm.status === 200 && sm.body) {
      for (const loc of parseSitemapLocs(sm.body, base)) {
        sitemapUrls.add(loc);
        urlSet.add(loc);
      }
    } else {
      logger.warn({ status: sm.status }, 'SEO: sitemap.xml not 200 during inventory');
    }
  } catch (err) {
    logger.warn({ err }, 'SEO: failed to fetch sitemap.xml during inventory');
  }

  // 4) robots.txt accessibility (a check + evidence).
  try {
    const robots = await fetchRaw(`${base}/robots.txt`);
    robotsAccessible = robots.status === 200;
  } catch {
    robotsAccessible = false;
  }

  return { urls: Array.from(urlSet), sitemapUrls, robotsAccessible };
}
