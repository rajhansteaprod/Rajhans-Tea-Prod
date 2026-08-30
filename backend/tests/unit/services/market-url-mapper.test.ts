import { mapClusterToUrl } from '../../../src/modules/seo/market/services/url-mapper';
import { GscEvidenceIndex } from '../../../src/modules/seo/market/services/gsc-evidence-index';
import { buildRelevanceModel, scoreBusinessRelevance } from '../../../src/modules/seo/market/relevance.taxonomy';
import { ClusterResult } from '../../../src/modules/seo/market/services/clustering.engine';
import { Intent, MappingKeywordEvidence, PageCandidate } from '../../../src/modules/seo/market/market.types';

const taxonomy = buildRelevanceModel([{ name: 'Rajhans Royal Assam' }]);

function member(keywordId: string, keyword: string) {
  return { keywordId, keyword, normalizedKeyword: keyword, membershipScore: 1, reasons: [] };
}
function cluster(label: string, primaryIntent: Intent | null, keywords: string[]): ClusterResult {
  const members = keywords.map((k, i) => member(String(i), k));
  return {
    label,
    medoidKeywordId: '0',
    primaryIntent,
    intents: primaryIntent ? [{ intent: primaryIntent, confidence: 0.8, reasons: [] }] : [],
    clusterReasons: [],
    members,
    serpOverlapEvidence: null,
  };
}
function evidenceFor(cluster: ClusterResult, demand: MappingKeywordEvidence['demand'] = null): MappingKeywordEvidence[] {
  return cluster.members.map((m) => ({
    keywordId: m.keywordId,
    keyword: m.keyword,
    normalizedKeyword: m.normalizedKeyword,
    businessRelevance: scoreBusinessRelevance(m.keyword, taxonomy),
    demand,
  }));
}
function candidate(overrides: Partial<PageCandidate>): PageCandidate {
  return {
    url: 'https://rajhanstea.com/product/royal-assam/',
    canonicalUrl: 'https://rajhanstea.com/product/royal-assam/',
    pageType: 'product',
    title: 'Rajhans Royal Assam',
    slug: 'royal-assam',
    indexable: true,
    anchors: ['assam', 'rajhans royal assam'],
    normalizedTerms: ['rajhans', 'royal', 'assam'],
    pageHealth: 'GOOD',
    healthReasons: ['wordCount 1200 >= 300', 'no open critical issue'],
    qualityFacts: { wordCount: 1200, hasSnapshot: true, openCriticalIssueCount: 0 },
    ...overrides,
  };
}
const emptyIndex = new GscEvidenceIndex();

describe('mapClusterToUrl — A/B/UNKNOWN health', () => {
  it('healthy matched product page -> A', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea', 'assam ctc tea']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [candidate({})], emptyIndex);
    expect(result.bucket).toBe('A_EXISTING_GOOD');
    expect(result.matchedUrl).toBe('https://rajhanstea.com/product/royal-assam/');
    expect(result.actionable).toBe(true);
  });

  it('thin/unhealthy matched page -> B', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const page = candidate({ pageHealth: 'NEEDS_OPT', healthReasons: ['wordCount 50 < 300'] });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [page], emptyIndex);
    expect(result.bucket).toBe('B_EXISTING_NEEDS_OPT');
    expect(result.actionable).toBe(true);
  });

  it('pageHealth UNKNOWN -> B shape, actionable:false, evidenceStatus insufficient', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const page = candidate({ pageHealth: 'UNKNOWN', healthReasons: ['no snapshot found'] });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [page], emptyIndex);
    expect(result.bucket).toBe('B_EXISTING_NEEDS_OPT');
    expect(result.actionable).toBe(false);
    expect(result.evidenceStatus).toBe('insufficient');
  });
});

describe('mapClusterToUrl — C vs E (informational)', () => {
  it('informational query + healthy product page (type-incompatible) + no guide -> C', () => {
    const c = cluster('what is assam tea', 'INFORMATIONAL', ['what is assam tea']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [candidate({})], emptyIndex);
    expect(result.bucket).toBe('C_CONTENT_SUPPORT');
    expect(result.whyExistingPageInsufficient).toBeDefined();
  });

  it('C + UNKNOWN demand/GSC -> actionable:false', () => {
    const c = cluster('what is assam tea', 'INFORMATIONAL', ['what is assam tea']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c, null), taxonomy }, [candidate({})], emptyIndex);
    expect(result.bucket).toBe('C_CONTENT_SUPPORT');
    expect(result.actionable).toBe(false);
    expect(result.evidenceStatus).toBe('insufficient');
  });

  it('C + known meaningful demand -> actionable:true', () => {
    const c = cluster('what is assam tea', 'INFORMATIONAL', ['what is assam tea']);
    const ev = evidenceFor(c, { searchVolume: 150, metricsKnown: true, source: 'dataforseo', capturedAt: null });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: ev, taxonomy }, [candidate({})], emptyIndex);
    expect(result.bucket).toBe('C_CONTENT_SUPPORT');
    expect(result.actionable).toBe(true);
  });

  it('informational query with NO anchor-matched page at all -> E', () => {
    const c = cluster('what is ctc tea', 'INFORMATIONAL', ['what is ctc tea']);
    const ev = evidenceFor(c, { searchVolume: 200, metricsKnown: true, source: 'dataforseo', capturedAt: null });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: ev, taxonomy }, [], emptyIndex);
    expect(result.bucket).toBe('E_NEW_ARTICLE');
    expect(result.actionable).toBe(true);
  });
});

describe('mapClusterToUrl — D (commercial, no page)', () => {
  it('known meaningful demand, no compatible page -> D actionable:true', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const ev = evidenceFor(c, { searchVolume: 900, metricsKnown: true, source: 'dataforseo', capturedAt: null });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: ev, taxonomy }, [], emptyIndex);
    expect(result.bucket).toBe('D_NEW_LANDING');
    expect(result.actionable).toBe(true);
  });

  it('UNKNOWN demand/GSC, no compatible page -> D actionable:false (insufficient evidence, not F)', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c, null), taxonomy }, [], emptyIndex);
    expect(result.bucket).toBe('D_NEW_LANDING');
    expect(result.actionable).toBe(false);
    expect(result.evidenceStatus).toBe('insufficient');
  });
});

describe('mapClusterToUrl — F', () => {
  it('low business relevance -> F, never D/E', () => {
    const c = cluster('coffee beans online', null, ['coffee beans online']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [], emptyIndex);
    expect(result.bucket).toBe('F_NOT_RELEVANT');
    expect(result.actionable).toBe(false);
  });
});

describe('mapClusterToUrl — navigational home vs product', () => {
  it('brand-only "rajhans tea" -> home', () => {
    const c = cluster('rajhans tea', 'NAVIGATIONAL', ['rajhans tea']);
    const home = candidate({ url: 'https://rajhanstea.com/', canonicalUrl: 'https://rajhanstea.com/', pageType: 'home', title: null, slug: '', anchors: ['rajhans'], normalizedTerms: ['rajhans'] });
    const product = candidate({});
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [home, product], emptyIndex);
    expect(result.matchedPageType).toBe('home');
  });

  it('product-specific "rajhans royal assam" -> exact product page', () => {
    const c = cluster('rajhans royal assam', 'NAVIGATIONAL', ['rajhans royal assam']);
    const home = candidate({ url: 'https://rajhanstea.com/', canonicalUrl: 'https://rajhanstea.com/', pageType: 'home', title: null, slug: '', anchors: ['rajhans'], normalizedTerms: ['rajhans'] });
    const product = candidate({});
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [home, product], emptyIndex);
    expect(result.matchedPageType).toBe('product');
  });
});

describe('mapClusterToUrl — indexability hard gate', () => {
  it('a non-indexable candidate can never become the matched URL', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const nonIndexable = candidate({ indexable: false });
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [nonIndexable], emptyIndex);
    expect(result.bucket).not.toBe('A_EXISTING_GOOD');
    expect(result.bucket).not.toBe('B_EXISTING_NEEDS_OPT');
  });
});

describe('mapClusterToUrl — all scores finite and 0..1', () => {
  it('guards matchScore/confidence', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const result = mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, [candidate({})], emptyIndex);
    expect(Number.isFinite(result.matchScore)).toBe(true);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(1);
    expect(Number.isFinite(result.confidence)).toBe(true);
  });
});
