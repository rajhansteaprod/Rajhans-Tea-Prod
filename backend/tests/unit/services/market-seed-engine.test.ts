import { buildSeeds, InventoryEntity } from '../../../src/modules/seo/market/services/seed.engine';
import { marketConfig } from '../../../src/modules/seo/market/market.config';

const market = marketConfig.defaultMarket;

describe('buildSeeds', () => {
  it('includes the curated facet lexicon', () => {
    const seeds = buildSeeds([], market);
    const terms = seeds.map((s) => s.term);
    expect(terms).toContain('assam tea');
    expect(terms).toContain('kadak chai');
    expect(terms).toContain('buy tea online');
    expect(terms).toContain('rajhans tea');
  });

  it('adds inventory products/categories as first-class seeds with provenance', () => {
    const inventory: InventoryEntity[] = [
      { name: 'Rajhans Royal Assam', type: 'product', slug: 'royal-assam', id: 'p1' },
      { name: 'Kadak & Strong', type: 'category', slug: 'kadak-strong', id: 'c1' },
    ];
    const seeds = buildSeeds(inventory, market);
    const product = seeds.find((s) => s.term === 'Rajhans Royal Assam');
    expect(product).toBeDefined();
    expect(product?.type).toBe('product');
    expect(product?.sourceRef).toEqual({ kind: 'product', id: 'p1', slug: 'royal-assam' });

    const category = seeds.find((s) => s.term === 'Kadak & Strong');
    expect(category?.type).toBe('category');
    expect(category?.sourceRef).toEqual({ kind: 'category', id: 'c1', slug: 'kadak-strong' });
  });

  it('dedupes by normalized identity between facets and inventory', () => {
    const inventory: InventoryEntity[] = [{ name: 'Assam Tea', type: 'product', id: 'dup1' }];
    const seeds = buildSeeds(inventory, market);
    const matches = seeds.filter((s) => s.normalizedTerm === 'assam tea');
    expect(matches).toHaveLength(1);
    // facet entry (first inserted) wins
    expect(matches[0].type).toBe('region');
  });

  it('does not blindly cross-product facets (bounded curated list, not combinatorial)', () => {
    const seeds = buildSeeds([], market);
    expect(seeds.length).toBeLessThan(50);
  });

  it('bounds total seeds to marketConfig.seeds.maxSeedsPerRun', () => {
    const inventory: InventoryEntity[] = Array.from({ length: marketConfig.seeds.maxSeedsPerRun + 50 }, (_, i) => ({
      name: `Unique Product ${i}`,
      type: 'product' as const,
      id: String(i),
    }));
    const seeds = buildSeeds(inventory, market);
    expect(seeds.length).toBe(marketConfig.seeds.maxSeedsPerRun);
  });

  it('ignores blank inventory names', () => {
    const inventory: InventoryEntity[] = [{ name: '   ', type: 'product', id: 'blank' }];
    const seeds = buildSeeds(inventory, market);
    expect(seeds.find((s) => s.sourceRef?.id === 'blank')).toBeUndefined();
  });
});
