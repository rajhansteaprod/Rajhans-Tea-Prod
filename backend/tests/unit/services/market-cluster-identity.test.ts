import { matchClustersToStableIds } from '../../../src/modules/seo/market/services/cluster-identity.service';

function old(id: string, stableClusterId: string, keywords: string[]) {
  return { id, stableClusterId, normalizedKeywords: keywords };
}
function next(id: string, keywords: string[]) {
  return { id, normalizedKeywords: keywords };
}

describe('matchClustersToStableIds — exact Jaccard threshold, one-to-one', () => {
  it('inherits stableClusterId when Jaccard >= 0.5', () => {
    const oldClusters = [old('o1', 'stable-assam', ['assam tea', 'assam ctc tea'])];
    const newClusters = [next('n1', ['assam tea', 'assam ctc tea', 'buy assam tea online'])]; // jaccard = 2/3 = 0.667
    const result = matchClustersToStableIds(oldClusters, newClusters, 0.5);
    expect(result[0].stableClusterId).toBe('stable-assam');
    expect(result[0].matchedOldClusterId).toBe('o1');
  });

  it('does not match below threshold — assigns a fresh stableClusterId', () => {
    const oldClusters = [old('o1', 'stable-assam', ['assam tea'])];
    const newClusters = [next('n1', ['darjeeling tea'])];
    const result = matchClustersToStableIds(oldClusters, newClusters, 0.5);
    expect(result[0].matchedOldClusterId).toBeNull();
    expect(result[0].stableClusterId).not.toBe('stable-assam');
  });

  it('one-to-one: two new clusters cannot both inherit the same old identity (split)', () => {
    const oldClusters = [old('o1', 'stable-assam', ['assam tea', 'assam ctc tea'])];
    const newClusters = [next('n1', ['assam tea', 'assam ctc tea']), next('n2', ['assam tea'])]; // n1 has higher overlap
    const result = matchClustersToStableIds(oldClusters, newClusters, 0.5);
    const inherited = result.filter((r) => r.stableClusterId === 'stable-assam');
    expect(inherited).toHaveLength(1);
    expect(inherited[0].newClusterId).toBe('n1'); // the higher-overlap child wins
  });

  it('one-to-one: two old clusters cannot both match the same new cluster (merge) — only the best survives', () => {
    const oldClusters = [old('o1', 'stable-a', ['assam tea', 'assam ctc tea']), old('o2', 'stable-b', ['assam ctc tea'])];
    const newClusters = [next('n1', ['assam tea', 'assam ctc tea'])];
    const result = matchClustersToStableIds(oldClusters, newClusters, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0].stableClusterId).toBe('stable-a'); // higher Jaccard (2/2=1.0 vs 1/2=0.5... both qualify, o1 has strictly higher score)
  });

  it('deterministic tie-break: old stableClusterId ascending when scores tie exactly', () => {
    const oldClusters = [old('o2', 'stable-z', ['x', 'y']), old('o1', 'stable-a', ['x', 'y'])];
    const newClusters = [next('n1', ['x', 'y'])];
    const result = matchClustersToStableIds(oldClusters, newClusters, 0.5);
    expect(result[0].stableClusterId).toBe('stable-a'); // alphabetically first old id wins the tie
  });

  it('no old clusters at all — every new cluster gets a fresh id', () => {
    const result = matchClustersToStableIds([], [next('n1', ['a']), next('n2', ['b'])], 0.5);
    expect(result.every((r) => r.matchedOldClusterId === null)).toBe(true);
    expect(new Set(result.map((r) => r.stableClusterId)).size).toBe(2); // distinct
  });
});
