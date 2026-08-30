import { buildMappingKeywordEvidence, buildClusterGscDemandEvidence, buildMatchedPageGscEvidence } from '../../../src/modules/seo/market/services/market-evidence-assembler';
import { GscEvidenceIndex } from '../../../src/modules/seo/market/services/gsc-evidence-index';
import { BASE_TAXONOMY } from '../../../src/modules/seo/market/relevance.taxonomy';
import { ClusterResult } from '../../../src/modules/seo/market/services/clustering.engine';
import { UrlMapping } from '../../../src/modules/seo/market/market.types';
import { ISearchKeywordMetricDoc } from '../../../src/modules/seo/market/models/search-keyword-metric.model';

const NOW = new Date('2026-08-30T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

function metric(overrides: Partial<ISearchKeywordMetricDoc> = {}): ISearchKeywordMetricDoc {
  return { provider: 'dataforseo', capturedAt: daysAgo(5), searchVolume: 500, ...overrides } as ISearchKeywordMetricDoc;
}

function kw(id: string, keyword: string) {
  return { keywordId: id, keyword, normalizedKeyword: keyword };
}

describe('buildMappingKeywordEvidence — demand freshness (frozen policy)', () => {
  it('fresh <=30d metric: metricsKnown=true, no degradation', () => {
    const metrics = new Map([['k1', metric({ capturedAt: daysAgo(10), searchVolume: 800 })]]);
    const { evidence, degradationReasons } = buildMappingKeywordEvidence([kw('k1', 'assam tea')], metrics, BASE_TAXONOMY, NOW);
    expect(evidence[0].demand).toEqual({ searchVolume: 800, metricsKnown: true, source: 'dataforseo', capturedAt: daysAgo(10).toISOString() });
    expect(degradationReasons).toHaveLength(0);
  });

  it('45d stale-but-usable metric: metricsKnown=true, ALWAYS degrades (Z)', () => {
    const metrics = new Map([['k1', metric({ capturedAt: daysAgo(45), searchVolume: 300 })]]);
    const { evidence, degradationReasons } = buildMappingKeywordEvidence([kw('k1', 'assam tea')], metrics, BASE_TAXONOMY, NOW);
    expect(evidence[0].demand?.metricsKnown).toBe(true);
    expect(evidence[0].demand?.searchVolume).toBe(300);
    expect(degradationReasons.some((r) => r.includes('stale-keyword-demand'))).toBe(true);
  });

  it('>90d metric: demand=null, UNKNOWN, no degradation from age alone', () => {
    const metrics = new Map([['k1', metric({ capturedAt: daysAgo(100) })]]);
    const { evidence, degradationReasons } = buildMappingKeywordEvidence([kw('k1', 'assam tea')], metrics, BASE_TAXONOMY, NOW);
    expect(evidence[0].demand).toBeNull();
    expect(degradationReasons).toHaveLength(0);
  });

  it('no metric at all: demand=null, never zero', () => {
    const { evidence } = buildMappingKeywordEvidence([kw('k1', 'assam tea')], new Map(), BASE_TAXONOMY, NOW);
    expect(evidence[0].demand).toBeNull();
  });

  it('businessRelevance is always freshly computed via scoreBusinessRelevance, never a persisted field', () => {
    const { evidence } = buildMappingKeywordEvidence([kw('k1', 'assam tea')], new Map(), BASE_TAXONOMY, NOW);
    expect(evidence[0].businessRelevance.band).toBe('high');
  });
});

describe('cluster/matched-page GSC evidence wiring', () => {
  const cluster: ClusterResult = {
    label: 'assam tea',
    medoidKeywordId: 'k1',
    primaryIntent: 'CATEGORY',
    intents: [],
    clusterReasons: [],
    members: [{ keywordId: 'k1', keyword: 'assam tea', normalizedKeyword: 'assam tea', membershipScore: 1, reasons: [] }],
    serpOverlapEvidence: null,
  };

  it('cluster demand evidence uses the full unfiltered member set', () => {
    const index = new GscEvidenceIndex();
    index.add('assam tea', 'https://site.com/assam', 40, 2, 5);
    const evidence = buildClusterGscDemandEvidence(cluster, index);
    expect(evidence.evidenceKnown).toBe(true);
    expect(evidence.impressions).toBe(40);
  });

  it('matchedPageGscEvidence is null when there is no matchedUrl', () => {
    const index = new GscEvidenceIndex();
    const mapping: UrlMapping = { bucket: 'D_NEW_LANDING', matchedUrl: null, matchedPageType: null, matchScore: 0, confidence: 0, reasons: [], actionable: true, evidenceStatus: 'sufficient', alternativeCandidates: [] };
    expect(buildMatchedPageGscEvidence(cluster, mapping, index)).toBeNull();
  });

  it('matchedPageGscEvidence is recomputed for exactly the matchedUrl, never an alternative', () => {
    const index = new GscEvidenceIndex();
    index.add('assam tea', 'https://site.com/assam', 60, 5, 3);
    index.add('assam tea', 'https://site.com/other', 999, 90, 1); // must NOT be picked
    const mapping: UrlMapping = { bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://site.com/assam', matchedPageType: 'category', matchScore: 0.8, confidence: 0.8, reasons: [], actionable: true, evidenceStatus: 'sufficient', alternativeCandidates: [] };
    const evidence = buildMatchedPageGscEvidence(cluster, mapping, index);
    expect(evidence?.impressions).toBe(60);
  });
});
