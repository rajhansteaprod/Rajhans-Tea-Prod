import {
  scoreBusinessRelevance,
  scoreCommercialIntent,
  classifyKeyword,
  buildRelevanceModel,
  BASE_TAXONOMY,
} from '../../../src/modules/seo/market/relevance.taxonomy';

describe('scoreBusinessRelevance', () => {
  it('scores a strong multi-dimension core match highly with high confidence', () => {
    const r = scoreBusinessRelevance('assam ctc tea');
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.band).toBe('high');
    expect(r.confidence).toBe('high');
    expect(r.components.length).toBeGreaterThanOrEqual(2);
  });

  it('scores a consumption-only core match highly (kadak chai patti)', () => {
    const r = scoreBusinessRelevance('kadak chai patti');
    expect(r.score).toBeGreaterThan(0.8);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('does not let commercial modifiers alone inflate relevance without a servable entity, but recognizes the paired tea entity', () => {
    const r = scoreBusinessRelevance('buy assam tea online');
    expect(r.band).not.toBe('low');
    // relevance comes from "assam"/"tea", not from "buy"/"online"
    expect(r.components.some((c) => c.dimension === 'region' && c.term === 'assam')).toBe(true);
  });

  it('scores informational core-entity queries as relevant regardless of intent wording', () => {
    const r = scoreBusinessRelevance('what is ctc tea');
    expect(r.components.some((c) => c.term === 'ctc')).toBe(true);
    expect(r.band).not.toBe('low');
  });

  it('scores "darjeeling tea benefits" as relevant via region+productType', () => {
    const r = scoreBusinessRelevance('darjeeling tea benefits');
    expect(r.components.some((c) => c.dimension === 'region' && c.term === 'darjeeling')).toBe(true);
  });

  it('does not treat pure commercial-channel queries with no tea entity as highly relevant', () => {
    const r = scoreBusinessRelevance('bulk tea supplier');
    // "tea" alone matches productType at low weight (0.6) -> capped low/medium, never "high"
    expect(r.band).not.toBe('high');
  });

  it('hard-negates unrelated queries (coffee)', () => {
    const r = scoreBusinessRelevance('coffee beans online');
    expect(r.band).toBe('low');
    expect(r.score).toBeLessThan(0.1);
    expect(r.reasons[0]).toContain('hard-negative');
  });

  it('scores an exact Rajhans product entity as high relevance with inventory-sourced confidence', () => {
    const model = buildRelevanceModel([{ name: 'Rajhans Royal Assam' }]);
    const r = scoreBusinessRelevance('rajhans royal assam', model);
    expect(r.band).toBe('high');
    expect(r.confidence).toBe('high');
    expect(r.components.some((c) => c.source === 'inventory')).toBe(true);
  });

  it('distinguishes insufficient evidence from low-but-evidenced score', () => {
    const noEvidence = scoreBusinessRelevance('random unrelated phrase xyz');
    expect(noEvidence.confidence).toBe('insufficient');

    const weakEvidence = scoreBusinessRelevance('smooth aromatic');
    expect(weakEvidence.confidence).toBe('low');
    expect(weakEvidence.confidence).not.toBe('insufficient');
  });

  it('does not naively sum repeated synonyms within the same dimension', () => {
    const single = scoreBusinessRelevance('chai');
    const repeated = scoreBusinessRelevance('chai chai chai');
    expect(repeated.score).toBe(single.score);
  });
});

describe('scoreCommercialIntent', () => {
  it('is independent of business relevance for a commercial, non-tea-specific query', () => {
    const relevance = scoreBusinessRelevance('bulk tea supplier');
    const commercial = scoreCommercialIntent('bulk tea supplier');
    expect(commercial.score).toBeGreaterThan(relevance.score);
  });

  it('dampens commercial score for informational modifiers', () => {
    const commercial = scoreCommercialIntent('what is bulk tea price');
    const plain = scoreCommercialIntent('bulk tea price');
    expect(commercial.score).toBeLessThan(plain.score);
  });

  it('scores zero for a purely informational query', () => {
    const commercial = scoreCommercialIntent('darjeeling tea benefits');
    expect(commercial.score).toBe(0);
  });
});

describe('classifyKeyword', () => {
  it('does not hard-negate competitor brand terms; flags them for review instead', () => {
    const taxonomy = { ...BASE_TAXONOMY, competitorBrands: ['brandx tea'] };
    const c = classifyKeyword('brandx tea price', taxonomy);
    expect(c.hardNegative).toBe(false);
    expect(c.competitorBranded).toBe(true);
    expect(c.targetingPolicy).toBe('review');
  });

  it('marks competitor + comparison wording as comparison-potential', () => {
    const taxonomy = { ...BASE_TAXONOMY, competitorBrands: ['brandx tea'] };
    const c = classifyKeyword('brandx tea vs rajhans tea', taxonomy);
    expect(c.targetingPolicy).toBe('comparison-potential');
  });

  it('still hard-negates spam/adult/unrelated terms', () => {
    const c = classifyKeyword('coffee beans online');
    expect(c.hardNegative).toBe(true);
    expect(c.hardNegativeReason).toContain('coffee');
  });
});
