import { marketConfig } from '../market.config';
import { Market } from '../market.types';
import { SeedType } from '../models/search-seed.model';
import { normalizeKeyword } from './keyword-normalize';

/**
 * Seed engine — produces a bounded, curated set of discovery SEEDS from real
 * Rajhans business assets + a small curated facet lexicon. It does NOT explode
 * word combinations (that is the keyword-demand provider's job in 4b.2, gated by
 * real search evidence) and it only seeds legitimate, indexable business assets
 * (refinement 5): products, categories, and curated tea/chai facets. Auth,
 * checkout, track-order, admin, policy/legal, noindex, soft-404, and redirect
 * aliases are never seeded — inventory entities come from active products /
 * active categories only, and CMS/blog entities (added later) must pass the
 * existing canonical/indexable SEO context filter.
 */

export interface InventoryEntity {
  name: string;
  type: 'product' | 'category';
  slug?: string;
  id?: string;
}

export interface SeedDraft {
  term: string;
  normalizedTerm: string;
  type: SeedType;
  sourceRef: { kind: 'product' | 'category' | 'facet'; id?: string; slug?: string } | null;
}

/** Curated facet lexicon (not a blind cross-product). */
const FACET_SEEDS: { term: string; type: SeedType }[] = [
  // regions
  { term: 'assam tea', type: 'region' }, { term: 'darjeeling tea', type: 'region' },
  { term: 'nilgiri tea', type: 'region' }, { term: 'dooars tea', type: 'region' },
  // processing / product type
  { term: 'ctc tea', type: 'processing' }, { term: 'loose leaf tea', type: 'processing' },
  { term: 'orthodox tea', type: 'processing' }, { term: 'black tea', type: 'processing' },
  { term: 'chai patti', type: 'processing' },
  // consumption / use
  { term: 'kadak chai', type: 'consumption' }, { term: 'milk chai', type: 'consumption' },
  { term: 'strong tea', type: 'consumption' }, { term: 'tea for milk chai', type: 'consumption' },
  { term: 'masala chai', type: 'consumption' },
  // commercial channel
  { term: 'buy tea online', type: 'commercial' }, { term: 'bulk tea', type: 'commercial' },
  { term: 'wholesale tea', type: 'commercial' }, { term: 'tea supplier', type: 'commercial' },
  // brand
  { term: 'rajhans tea', type: 'brand' },
];

/**
 * Pure: build a deduped, bounded seed set from curated facets + inventory entities.
 * Inventory product/category names are first-class seeds (refinement 3).
 */
export function buildSeeds(inventory: InventoryEntity[], _market: Market): SeedDraft[] {
  const byNorm = new Map<string, SeedDraft>();
  const add = (term: string, type: SeedType, sourceRef: SeedDraft['sourceRef']) => {
    const t = term.trim();
    if (!t) return;
    const n = normalizeKeyword(t);
    if (!n || byNorm.has(n)) return;
    byNorm.set(n, { term: t, normalizedTerm: n, type, sourceRef });
  };

  for (const f of FACET_SEEDS) add(f.term, f.type, { kind: 'facet' });
  for (const e of inventory) {
    add(e.name, e.type === 'product' ? 'product' : 'category', { kind: e.type, id: e.id, slug: e.slug });
  }

  const seeds = [...byNorm.values()];
  return seeds.slice(0, Math.max(0, marketConfig.seeds.maxSeedsPerRun)); // bound per run
}

/**
 * Load seedable inventory entities from the DB (active products + active
 * categories only — inherently indexable business assets). Read-only. Kept thin
 * so buildSeeds stays pure/testable. (No external calls.)
 */
export async function loadInventoryEntities(): Promise<InventoryEntity[]> {
  // Imported lazily to keep the pure path import-free and avoid load-time coupling.
  const { Product } = await import('../../../catalog/models/product.model');
  const { Category } = await import('../../../catalog/models/category.model');
  const [products, categories] = await Promise.all([
    Product.find({ status: 'active' }).select('name slug').lean().exec(),
    Category.find({ isActive: true }).select('name slug').lean().exec(),
  ]);
  const out: InventoryEntity[] = [];
  for (const p of products) if (p.name) out.push({ name: p.name, type: 'product', slug: p.slug, id: String(p._id) });
  for (const c of categories) if (c.name) out.push({ name: c.name, type: 'category', slug: c.slug, id: String(c._id) });
  return out;
}

/** Orchestrate: load inventory → build bounded seeds (does NOT persist here). */
export async function generateSeeds(market: Market = marketConfig.defaultMarket): Promise<SeedDraft[]> {
  const inventory = await loadInventoryEntities();
  return buildSeeds(inventory, market);
}
