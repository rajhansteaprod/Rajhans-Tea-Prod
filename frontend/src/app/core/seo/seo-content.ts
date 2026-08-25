/**
 * Centralized SEO copy + structured-data helpers.
 *
 * Curated titles/descriptions live here (not in components) so they are easy to
 * review and, later, migrate to DB-driven CMS fields. Nothing here changes
 * production behaviour beyond the <title>, meta description and additive JSON-LD.
 */

const BASE = 'https://rajhanstea.com';

export interface PageSeo {
  title: string;
  description: string;
}

/** Per-category SEO copy (title + meta description), keyed by catalog slug. */
export const CATALOG_SEO: Record<string, PageSeo> = {
  'balanced-flavourful': {
    title: 'Balanced & Flavourful Teas — Everyday CTC Chai | Rajhans Tea',
    description:
      "Explore Rajhans balanced, flavourful CTC teas — smooth yet full-bodied everyday chai from India's finest gardens.",
  },
  'kadak-and-strong': {
    title: 'Kadak & Strong Teas — Bold CTC Chai | Rajhans Tea',
    description:
      'Shop Rajhans kadak, strong CTC teas for a bold, full-bodied cup that holds up to milk and sugar.',
  },
  'smooth-aromatic': {
    title: 'Smooth & Aromatic Teas — Fragrant Chai | Rajhans Tea',
    description:
      'Discover Rajhans smooth, aromatic teas — fragrant, easy-drinking chai with a clean colour and delicate character.',
  },
};

/**
 * Curated product meta-description overrides. A generic sanitizer handles length
 * for every product; this map only supplies hand-written copy where the source
 * content is unsuitable (e.g. malformed/over-long). Prefer moving these to a
 * product CMS field long-term.
 */
export const PRODUCT_META_OVERRIDE: Record<string, string> = {
  'rajhans-premium-nilgiri':
    'Rajhans Premium Nilgiri — smooth, fragrant CTC chai from the Blue Mountains. Bright, clean cup; ~400 cups per kg. Great with milk or without.',
};

/**
 * Normalize a meta description: collapse whitespace and truncate to a
 * snippet-friendly length at a word boundary (Google shows ~155–160 chars).
 */
export function sanitizeMetaDescription(text: string, max = 158): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '') + '…';
}

export interface Crumb {
  name: string;
  url: string;
}

/** Build a schema.org BreadcrumbList JSON-LD object from an ordered crumb list. */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${BASE}${c.url}`,
    })),
  };
}

/**
 * Inject or replace a JSON-LD <script> block by id. Additive — it never touches
 * any other structured-data block (Product, Organization, etc.).
 */
export function injectJsonLd(document: Document, id: string, data: Record<string, unknown>): void {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}
