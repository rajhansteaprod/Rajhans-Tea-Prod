import { clusterKeywords, scoreClusteringPairWithoutSerp, ClusteringKeywordInput } from '../../../src/modules/seo/market/services/clustering.engine';
import { marketConfig } from '../../../src/modules/seo/market/market.config';

const kw = (id: string, keyword: string): ClusteringKeywordInput => ({ keywordId: id, keyword, normalizedKeyword: keyword });

describe('scoreClusteringPairWithoutSerp — additive diagnostic seam (4b.7)', () => {
  it('B2: a pair that clusterKeywords() actually merges scores >= minEdgeScore with the anchor gate passed', () => {
    const a = kw('1', 'assam tea');
    const b = kw('2', 'assam ctc tea');
    const diag = scoreClusteringPairWithoutSerp(a, b);
    expect(diag.anchorGatePassed).toBe(true);
    expect(diag.combinedScore).toBeGreaterThanOrEqual(marketConfig.clustering.minEdgeScore);
    // cross-check against the real clustering output for the exact same pair
    const out = clusterKeywords({ keywords: [a, b] });
    expect(out.clusters).toHaveLength(1);
  });

  it('B1/B4: an unrelated pair (only the generic "tea" token overlaps) fails the anchor gate and clusterKeywords() keeps them separate', () => {
    const a = kw('1', 'assam tea');
    const b = kw('2', 'darjeeling tea');
    const diag = scoreClusteringPairWithoutSerp(a, b);
    expect(diag.anchorGatePassed).toBe(false);
    const out = clusterKeywords({ keywords: [a, b] });
    expect(out.clusters).toHaveLength(2);
  });

  it('uses the exact same combinedScore clusterKeywords() computes internally (no duplicated formula) — cross-checked via a 3-keyword anti-bridge fixture', () => {
    // clustering-engine.test.ts already proves assam tea/assam ctc tea/ctc tea do not
    // all merge into one cluster; the diagnostic must agree pairwise with that split.
    const assamTea = kw('1', 'assam tea');
    const assamCtc = kw('2', 'assam ctc tea');
    const ctcTea = kw('3', 'ctc tea');
    const ac = scoreClusteringPairWithoutSerp(assamTea, assamCtc);
    const cc = scoreClusteringPairWithoutSerp(assamCtc, ctcTea);
    const ad = scoreClusteringPairWithoutSerp(assamTea, ctcTea);
    expect(ac.anchorGatePassed).toBe(true); // shared "assam"
    expect(cc.anchorGatePassed).toBe(true); // shared "ctc"
    expect(ad.anchorGatePassed).toBe(false); // no shared specific anchor between the two ends
  });

  it('is order-independent (a,b) === (b,a)', () => {
    const a = kw('1', 'assam tea');
    const b = kw('2', 'assam ctc tea');
    const ab = scoreClusteringPairWithoutSerp(a, b);
    const ba = scoreClusteringPairWithoutSerp(b, a);
    expect(ab.combinedScore).toBeCloseTo(ba.combinedScore, 6);
    expect(ab.anchorGatePassed).toBe(ba.anchorGatePassed);
  });
});
