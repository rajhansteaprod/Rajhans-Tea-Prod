import { scoreOpportunity, eligibleForRecommendation, buildOpportunityKeywordEvidence, OpportunityInput } from '../../../src/modules/seo/market/services/opportunity-scoring';
import { buildRelevanceModel, scoreBusinessRelevance } from '../../../src/modules/seo/market/relevance.taxonomy';
import { ClusterResult } from '../../../src/modules/seo/market/services/clustering.engine';
import { CandidateGscEvidence, ClusterGscDemandEvidence, Intent, MappingKeywordEvidence, UrlMapping, UrlMappingAlternative } from '../../../src/modules/seo/market/market.types';

const taxonomy = buildRelevanceModel([{ name: 'Rajhans Royal Assam' }]);

function cluster(label: string, primaryIntent: Intent | null, keywords: string[]): ClusterResult {
  return {
    label,
    medoidKeywordId: '0',
    primaryIntent,
    intents: primaryIntent ? [{ intent: primaryIntent, confidence: 0.8, reasons: [] }] : [],
    clusterReasons: [],
    members: keywords.map((k, i) => ({ keywordId: String(i), keyword: k, normalizedKeyword: k, membershipScore: 1, reasons: [] })),
    serpOverlapEvidence: null,
  };
}
function mapEv(keyword: string, volume: number | null): MappingKeywordEvidence {
  return {
    keywordId: keyword,
    keyword,
    normalizedKeyword: keyword,
    businessRelevance: scoreBusinessRelevance(keyword, taxonomy),
    demand: volume === null ? null : { searchVolume: volume, metricsKnown: true, source: 'dataforseo', capturedAt: null },
  };
}
function mapping(overrides: Partial<UrlMapping>): UrlMapping {
  return {
    bucket: 'B_EXISTING_NEEDS_OPT',
    matchedUrl: null,
    matchedPageType: null,
    matchScore: 0,
    confidence: 0.5,
    reasons: [],
    actionable: true,
    evidenceStatus: 'not-applicable',
    alternativeCandidates: [] as UrlMappingAlternative[],
    ...overrides,
  };
}
const noGsc: ClusterGscDemandEvidence = { impressions: null, evidenceKnown: false, matchedKeywords: [] };
const noPageGsc: CandidateGscEvidence | null = null;

describe('eligibleForRecommendation', () => {
  it('excludes A, F, G, navigational, and non-actionable', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('assam tea', 500)], taxonomy);
    for (const bucket of ['A_EXISTING_GOOD', 'F_NOT_RELEVANT', 'G_ALREADY_COVERED'] as const) {
      const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: noPageGsc, taxonomy };
      expect(eligibleForRecommendation(input).eligible).toBe(false);
    }
    const navCluster = cluster('rajhans tea', 'NAVIGATIONAL', ['rajhans tea']);
    const navInput: OpportunityInput = { cluster: navCluster, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence: buildOpportunityKeywordEvidence([mapEv('rajhans tea', 500)], taxonomy), clusterGscDemand: noGsc, matchedPageGsc: noPageGsc, taxonomy };
    expect(eligibleForRecommendation(navInput).eligible).toBe(false);
    const notActionable: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING', actionable: false }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: noPageGsc, taxonomy };
    expect(eligibleForRecommendation(notActionable).eligible).toBe(false);
  });

  it('B with page weakness but NO market-demand evidence is excluded, not persisted', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('assam tea', null)], taxonomy); // no demand known at all
    const input: OpportunityInput = {
      cluster: c,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://rajhanstea.com/product/royal-assam/', matchScore: 0.8 }),
      memberEvidence,
      clusterGscDemand: noGsc, // no GSC either
      matchedPageGsc: null,
      taxonomy,
    };
    const result = eligibleForRecommendation(input);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('market-demand');
    expect(scoreOpportunity(input)).toBeNull();
  });

  it('requires at least one eligible growth member', () => {
    const c = cluster('coffee beans online', null, ['coffee beans online']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('coffee beans online', 500)], taxonomy);
    // hard-negative -> businessRelevance.band === 'low'
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    expect(eligibleForRecommendation(input).eligible).toBe(false);
  });
});

describe('branded/navigational member exclusion (not whole-cluster)', () => {
  it('excludes a branded member from growth-demand aggregation without killing the cluster', () => {
    const c = cluster('assam tea', 'CATEGORY', ['assam tea', 'rajhans royal assam']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('assam tea', 300), mapEv('rajhans royal assam', 5000)], taxonomy);
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    const draft = scoreOpportunity(input)!;
    expect(draft).not.toBeNull();
    // the branded member's huge volume (5000) must NOT be used — maxKnownVolume must come from the non-branded member (300)
    expect(draft.evidence.demand.maxKnownVolume).toBe(300);
    expect(draft.evidence.eligibleGrowthMemberKeywords).toEqual(['assam tea']);
  });

  it('excludes a TRANSACTIONAL branded query ("buy rajhans tea online") even though it is not NAVIGATIONAL', () => {
    const evidence = buildOpportunityKeywordEvidence([mapEv('buy rajhans tea online', 1000)], taxonomy)[0];
    expect(evidence.isBranded).toBe(true);
    // Confirm the underlying classifier actually calls this TRANSACTIONAL, not NAVIGATIONAL —
    // proving isBranded (not isNavigational) is what excludes it.
    expect(evidence.isNavigational).toBe(false);
  });

  it('whole cluster is excluded when its OWN primary intent is NAVIGATIONAL', () => {
    const c = cluster('rajhans tea', 'NAVIGATIONAL', ['rajhans tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('rajhans tea', 5000)], taxonomy);
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    expect(scoreOpportunity(input)).toBeNull();
  });
});

describe('representative fixtures', () => {
  it('B: darjeeling tea weak page, matchScore 0.70', () => {
    const c = cluster('darjeeling tea', 'CATEGORY', ['darjeeling tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('darjeeling tea', 500)], taxonomy);
    const input: OpportunityInput = {
      cluster: c,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://rajhanstea.com/product/royal-darjeeling/', matchScore: 0.7 }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: { state: 'STRIKING_DISTANCE', impressions: 100, clicks: 5, avgPosition: 15, matchedKeywords: ['darjeeling tea'], evidenceKnown: true },
      taxonomy,
    };
    const draft = scoreOpportunity(input)!;
    expect(draft.category).toBe('existing-page-optimization');
    expect(draft.evidence.scoreComponents.existingPageFit).toEqual({ value: 0.7, available: true });
    expect(draft.evidence.scoreComponents.contentGapStrength.available).toBe(false); // inapplicable for B
    expect(draft.confidence).toBe('high');
  });

  it('B sensitivity: higher matchScore produces a higher opportunity score', () => {
    const c = cluster('darjeeling tea', 'CATEGORY', ['darjeeling tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('darjeeling tea', 500)], taxonomy);
    const build = (matchScore: number) => ({
      cluster: c,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT' as const, matchedUrl: 'https://rajhanstea.com/product/royal-darjeeling/', matchScore }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: { state: 'STRIKING_DISTANCE' as const, impressions: 100, clicks: 5, avgPosition: 15, matchedKeywords: ['darjeeling tea'], evidenceKnown: true },
      taxonomy,
    });
    const high = scoreOpportunity(build(0.9))!;
    const low = scoreOpportunity(build(0.62))!;
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.evidence.scoreComponents.existingPageFit.value).toBe(0.9);
    expect(low.evidence.scoreComponents.existingPageFit.value).toBe(0.62);
  });

  it('C: what is assam tea — supporting guide, related page from alternativeCandidates', () => {
    const c = cluster('what is assam tea', 'INFORMATIONAL', ['what is assam tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('what is assam tea', 150)], taxonomy);
    const input: OpportunityInput = {
      cluster: c,
      mapping: mapping({ bucket: 'C_CONTENT_SUPPORT', matchedUrl: null, alternativeCandidates: [{ url: 'https://rajhanstea.com/product/royal-assam/', pageType: 'product', score: 0.6, reason: '1 shared anchor(s)' }] }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: null,
      taxonomy,
    };
    const draft = scoreOpportunity(input)!;
    expect(draft.category).toBe('new-guide');
    expect(draft.affectedUrls).toEqual(['https://rajhanstea.com/product/royal-assam/']);
    expect(draft.evidence.scoreComponents.contentGapStrength).toEqual({ value: 1, available: true });
    expect(draft.evidence.scoreComponents.existingPageFit.available).toBe(false);
  });

  it('D: ctc tea — GSC UNKNOWN renormalizes over remaining weights (68-pool)', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('ctc tea', 900)], taxonomy);
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    const draft = scoreOpportunity(input)!;
    expect(draft.category).toBe('new-landing-page');
    expect(draft.evidence.scoreComponents.gscVisibilityGap.available).toBe(false);
    expect(draft.evidence.scoreComponents.rankingProximity.available).toBe(false);
    expect(Number.isFinite(draft.score)).toBe(true);
    expect(draft.score).toBeGreaterThan(0);
  });

  it('D: ctc tea — KNOWN cluster GSC uses the 82-weight pool and changes the score', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('ctc tea', 900)], taxonomy);
    const unknown = scoreOpportunity({ cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy })!;
    const known = scoreOpportunity({
      cluster: c,
      mapping: mapping({ bucket: 'D_NEW_LANDING' }),
      memberEvidence,
      clusterGscDemand: { impressions: 300, evidenceKnown: true, matchedKeywords: ['ctc tea'] },
      matchedPageGsc: null,
      taxonomy,
    })!;
    expect(known.evidence.scoreComponents.gscVisibilityGap.available).toBe(true);
    expect(known.evidence.scoreComponents.gscVisibilityGap.value).toBeCloseTo(0.6667, 3);
    expect(known.score).not.toBe(unknown.score);
    expect(known.evidence.scoreComponents.rankingProximity.available).toBe(false); // never applicable for D/E regardless of GSC
  });

  it('E: what is ctc tea — informational, no anchor-matched page', () => {
    const c = cluster('what is ctc tea', 'INFORMATIONAL', ['what is ctc tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('what is ctc tea', 200)], taxonomy);
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'E_NEW_ARTICLE' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    const draft = scoreOpportunity(input)!;
    expect(draft.category).toBe('new-guide');
    expect(draft.affectedUrls).toEqual([]);
  });

  it('D: bulk tea supplier — medium relevance caps confidence at medium', () => {
    const c = cluster('bulk tea supplier', 'TRANSACTIONAL', ['bulk tea supplier']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('bulk tea supplier', 150)], taxonomy);
    const input: OpportunityInput = { cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy };
    const draft = scoreOpportunity(input)!;
    expect(draft.category).toBe('commercial-opportunity'); // TRANSACTIONAL intent
    if (draft.evidence.businessRelevanceScore !== null && draft.evidence.businessRelevanceScore < 0.75) {
      expect(draft.confidence).not.toBe('high');
    }
  });
});

describe('UNKNOWN != 0 discipline', () => {
  it('a component with no evidence is excluded (available:false), never scored as 0', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('ctc tea', 900)], taxonomy);
    const draft = scoreOpportunity({ cluster: c, mapping: mapping({ bucket: 'D_NEW_LANDING' }), memberEvidence, clusterGscDemand: noGsc, matchedPageGsc: null, taxonomy })!;
    expect(draft.evidence.scoreComponents.gscVisibilityGap.available).toBe(false);
    // an excluded component's `value` (0) must never have been folded into the weighted sum —
    // verified indirectly by confirming the score is still a sensible positive number, not
    // artificially crushed toward 0 by a phantom "gscVisibilityGap=0" contribution.
    expect(draft.score).toBeGreaterThan(40);
  });

  it('candidate-specific GSC (matchedPageGsc) is never read for C/D/E even if erroneously supplied', () => {
    const c = cluster('ctc tea', 'CATEGORY', ['ctc tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('ctc tea', 900)], taxonomy);
    const draft = scoreOpportunity({
      cluster: c,
      mapping: mapping({ bucket: 'D_NEW_LANDING' }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: { state: 'WINNING', impressions: 99999, clicks: 500, avgPosition: 1, matchedKeywords: ['ctc tea'], evidenceKnown: true }, // from a DIFFERENT URL, should be ignored for D
      taxonomy,
    })!;
    expect(draft.evidence.scoreComponents.rankingProximity.available).toBe(false);
    expect(draft.evidence.scoreComponents.gscVisibilityGap.available).toBe(false); // clusterGscDemand still unknown
  });
});

describe('recommendation identity — distinct semantic keys', () => {
  it('two distinct non-G clusters sharing the same matchedUrl produce different discriminators', () => {
    const retail = cluster('assam tea retail', 'CATEGORY', ['assam tea retail']);
    const bulk = cluster('bulk assam tea supplier', 'TRANSACTIONAL', ['bulk assam tea supplier']);
    const url = 'https://rajhanstea.com/product/royal-assam/';
    const retailDraft = scoreOpportunity({
      cluster: retail,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: url, matchScore: 0.6 }),
      memberEvidence: buildOpportunityKeywordEvidence([mapEv('assam tea retail', 200)], taxonomy),
      clusterGscDemand: noGsc,
      matchedPageGsc: null,
      taxonomy,
    })!;
    const bulkDraft = scoreOpportunity({
      cluster: bulk,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: url, matchScore: 0.6 }),
      memberEvidence: buildOpportunityKeywordEvidence([mapEv('bulk assam tea supplier', 200)], taxonomy),
      clusterGscDemand: noGsc,
      matchedPageGsc: null,
      taxonomy,
    })!;
    expect(retailDraft).not.toBeNull();
    expect(bulkDraft).not.toBeNull();
    expect(retailDraft.discriminator).not.toBe(bulkDraft.discriminator);
    expect(retailDraft.affectedUrls).toEqual(bulkDraft.affectedUrls); // same URL
  });

  it('the same semantic recommendation (same cluster/mapping) is idempotent — identical discriminator', () => {
    const c = cluster('darjeeling tea', 'CATEGORY', ['darjeeling tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('darjeeling tea', 500)], taxonomy);
    const input: OpportunityInput = {
      cluster: c,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://rajhanstea.com/product/royal-darjeeling/', matchScore: 0.7 }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: null,
      taxonomy,
    };
    const a = scoreOpportunity(input)!;
    const b = scoreOpportunity(input)!;
    expect(a.discriminator).toBe(b.discriminator);
    expect(a.recommendationId).toBe(b.recommendationId);
  });
});

describe('finite/0..1 score-component guards', () => {
  it('every available component value is finite and within 0..1; final score within 0..100', () => {
    const c = cluster('darjeeling tea', 'CATEGORY', ['darjeeling tea']);
    const memberEvidence = buildOpportunityKeywordEvidence([mapEv('darjeeling tea', 500)], taxonomy);
    const draft = scoreOpportunity({
      cluster: c,
      mapping: mapping({ bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'https://rajhanstea.com/product/royal-darjeeling/', matchScore: 0.7 }),
      memberEvidence,
      clusterGscDemand: noGsc,
      matchedPageGsc: { state: 'STRIKING_DISTANCE', impressions: 100, clicks: 5, avgPosition: 15, matchedKeywords: ['darjeeling tea'], evidenceKnown: true },
      taxonomy,
    })!;
    for (const comp of Object.values(draft.evidence.scoreComponents)) {
      if (!comp.available) continue;
      expect(Number.isFinite(comp.value)).toBe(true);
      expect(comp.value).toBeGreaterThanOrEqual(0);
      expect(comp.value).toBeLessThanOrEqual(1);
    }
    expect(draft.score).toBeGreaterThanOrEqual(0);
    expect(draft.score).toBeLessThanOrEqual(100);
  });
});
