import { mapClusterToUrl } from '../../../src/modules/seo/market/services/url-mapper';
import { applyCannibalizationGuard, CannibalizationEntry } from '../../../src/modules/seo/market/services/cannibalization-guard';
import { GscEvidenceIndex } from '../../../src/modules/seo/market/services/gsc-evidence-index';
import { buildRelevanceModel, scoreBusinessRelevance } from '../../../src/modules/seo/market/relevance.taxonomy';
import { ClusterResult } from '../../../src/modules/seo/market/services/clustering.engine';
import { Intent, MappingKeywordEvidence, PageCandidate } from '../../../src/modules/seo/market/market.types';

const taxonomy = buildRelevanceModel([{ name: 'Rajhans Royal Assam' }]);
const emptyIndex = new GscEvidenceIndex();

function member(keywordId: string, keyword: string) {
  return { keywordId, keyword, normalizedKeyword: keyword, membershipScore: 1, reasons: [] };
}
function cluster(label: string, primaryIntent: Intent | null, keywords: string[]): ClusterResult {
  return {
    label,
    medoidKeywordId: '0',
    primaryIntent,
    intents: primaryIntent ? [{ intent: primaryIntent, confidence: 0.8, reasons: [] }] : [],
    clusterReasons: [],
    members: keywords.map((k, i) => member(String(i), k)),
    serpOverlapEvidence: null,
  };
}
function evidenceFor(c: ClusterResult): MappingKeywordEvidence[] {
  return c.members.map((m) => ({ keywordId: m.keywordId, keyword: m.keyword, normalizedKeyword: m.normalizedKeyword, businessRelevance: scoreBusinessRelevance(m.keyword, taxonomy), demand: null }));
}
function candidate(overrides: Partial<PageCandidate> = {}): PageCandidate {
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
    healthReasons: [],
    qualityFacts: { wordCount: 1200, hasSnapshot: true, openCriticalIssueCount: 0 },
    ...overrides,
  };
}
function entry(c: ClusterResult, mapping: ReturnType<typeof mapClusterToUrl>): CannibalizationEntry {
  return { cluster: c, taxonomy, mapping };
}
function mapping(c: ClusterResult, candidates: PageCandidate[]) {
  return mapClusterToUrl({ cluster: c, memberEvidence: evidenceFor(c), taxonomy }, candidates, emptyIndex);
}

describe('applyCannibalizationGuard — true G', () => {
  it('assigns G when families/type/anchor coverage all agree and no modifier conflict', () => {
    // Both resolve to A/B on the SAME product page (single shared anchor "assam",
    // both with no commercial/informational modifier evidence) — a genuine
    // redundant-cluster scenario, exactly what G exists to catch.
    const clusterA = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const clusterB = cluster('assam', 'CATEGORY', ['assam']);
    // A simple single-anchor/single-token page so both clusters' coverage score
    // clears gCoverageMinScore (0.70) comfortably, not just matchMinScore (0.55).
    const page = candidate({ anchors: ['assam'], normalizedTerms: ['assam'] });
    const mapA = mapping(clusterA, [page]);
    const mapB = mapping(clusterB, [page]);
    expect(['A_EXISTING_GOOD', 'B_EXISTING_NEEDS_OPT']).toContain(mapA.bucket);
    expect(['A_EXISTING_GOOD', 'B_EXISTING_NEEDS_OPT']).toContain(mapB.bucket);
    const results = applyCannibalizationGuard([entry(clusterA, mapA), entry(clusterB, mapB)], [page]);
    expect(results.some((r) => r.bucket === 'G_ALREADY_COVERED')).toBe(true);
  });
});

describe('applyCannibalizationGuard — false G (must not collapse)', () => {
  it('"assam tea retail" vs "bulk assam tea supplier": modifier mismatch blocks G', () => {
    const retail = cluster('assam tea retail', 'CATEGORY', ['assam tea retail']);
    const bulk = cluster('bulk assam tea supplier', 'TRANSACTIONAL', ['bulk assam tea supplier']);
    // A candidate page whose anchors are broad enough that BOTH clusters clear
    // matchMinScore on their own (a prerequisite for cannibalization to even be
    // considered) — the point under test is the modifier-conflict gate, not
    // whether either individually matches.
    const page = candidate({ anchors: ['assam', 'tea supplier', 'rajhans royal assam'] });
    const retailMapping = mapping(retail, [page]);
    const bulkMapping = mapping(bulk, [page]);
    expect(['A_EXISTING_GOOD', 'B_EXISTING_NEEDS_OPT']).toContain(retailMapping.bucket);
    expect(['A_EXISTING_GOOD', 'B_EXISTING_NEEDS_OPT']).toContain(bulkMapping.bucket);
    const results = applyCannibalizationGuard([entry(retail, retailMapping), entry(bulk, bulkMapping)], [page]);
    expect(results.every((r) => r.bucket !== 'G_ALREADY_COVERED')).toBe(true);
    expect(results.some((r) => r.possibleCannibalizationRisk)).toBe(true);
    const risk = results.find((r) => r.possibleCannibalizationRisk)?.possibleCannibalizationRisk;
    expect(risk?.reason).toContain('modifier');
  });

  it('commercial vs informational collision on the same page: A + C, never A + G', () => {
    const commercial = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const informational = cluster('what is assam tea', 'INFORMATIONAL', ['what is assam tea']);
    const page = candidate();
    const commercialMapping = mapping(commercial, [page]);
    const informationalMapping = mapping(informational, [page]);
    expect(commercialMapping.bucket).toBe('A_EXISTING_GOOD');
    expect(informationalMapping.bucket).toBe('C_CONTENT_SUPPORT');
    const results = applyCannibalizationGuard([entry(commercial, commercialMapping), entry(informational, informationalMapping)], [page]);
    expect(results[0].bucket).toBe('A_EXISTING_GOOD');
    expect(results[1].bucket).toBe('C_CONTENT_SUPPORT');
  });
});

describe('applyCannibalizationGuard — F is never touched', () => {
  it('an F_NOT_RELEVANT cluster is passed through unchanged even if it shares a URL group key', () => {
    const irrelevant = cluster('coffee beans online', null, ['coffee beans online']);
    const mappingResult = mapping(irrelevant, []);
    const results = applyCannibalizationGuard([entry(irrelevant, mappingResult)], []);
    expect(results[0].bucket).toBe('F_NOT_RELEVANT');
  });
});

describe('applyCannibalizationGuard — determinism', () => {
  it('is independent of input array order (bucket per cluster label matches either way)', () => {
    const strong = cluster('assam tea', 'CATEGORY', ['assam tea', 'assam ctc tea']);
    const weak = cluster('assam ctc tea', 'CATEGORY', ['assam ctc tea']);
    const page = candidate();
    const strongMapping = mapping(strong, [page]);
    const weakMapping = mapping(weak, [page]);

    const forward = applyCannibalizationGuard([entry(strong, strongMapping), entry(weak, weakMapping)], [page]);
    const reversed = applyCannibalizationGuard([entry(weak, weakMapping), entry(strong, strongMapping)], [page]);

    const forwardByLabel = new Map([[strong.label, forward[0].bucket], [weak.label, forward[1].bucket]]);
    const reversedByLabel = new Map([[weak.label, reversed[0].bucket], [strong.label, reversed[1].bucket]]);
    expect(forwardByLabel.get(strong.label)).toBe(reversedByLabel.get(strong.label));
    expect(forwardByLabel.get(weak.label)).toBe(reversedByLabel.get(weak.label));
  });
});
