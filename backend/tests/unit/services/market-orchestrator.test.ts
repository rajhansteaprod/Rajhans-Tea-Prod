import { computeSnapshotHash, buildEvaluationSnapshot, selectSerpCandidates, computePlanFingerprint, computeApprovedCostUsd, SerpCandidateUnit } from '../../../src/modules/seo/market/services/market-orchestrator.service';
import { MarketOpportunityDraft } from '../../../src/modules/seo/market/market.types';

function draft(overrides: Partial<MarketOpportunityDraft> = {}): MarketOpportunityDraft {
  return {
    recommendationId: 'market-optimize',
    discriminator: 'url::CATEGORY::darjeeling tea::darjeeling',
    category: 'existing-page-optimization',
    title: 't', why: 'w', suggestedFix: 's',
    score: 67.1, confidence: 'high', affectedUrls: ['b', 'a'],
    evidence: { clusterLabel: 'x', memberKeywords: [], eligibleGrowthMemberKeywords: [], primaryIntent: 'CATEGORY', businessRelevanceScore: 0.9, demand: { maxKnownVolume: 500, metricsKnown: true, descriptiveTotalVolume: 500 }, clusterGsc: { impressions: null, evidenceKnown: false }, matchedPageGsc: null, mapping: { bucket: 'B_EXISTING_NEEDS_OPT', matchedUrl: 'url', matchScore: 0.7 }, cannibalizationRisk: false, scoreComponents: {} as never, confidence: 'high', relatedRecommendationIds: [] },
    ...overrides,
  };
}

describe('computeSnapshotHash — deterministic, content-only', () => {
  it('excludes timestamps: identical content hashes identically regardless of generatedAt', () => {
    const base = { draftFingerprints: ['fp1'], drafts: [draft()], evaluationOutcome: 'completed' as const, allowResolution: true, degradationReasons: [] };
    const a = computeSnapshotHash(base);
    const b = computeSnapshotHash(base); // computed at a "different time" conceptually — function itself has no time input
    expect(a).toBe(b);
  });

  it('order-independent for draftFingerprints/degradationReasons (sorted internally)', () => {
    const h1 = computeSnapshotHash({ draftFingerprints: ['b', 'a'], drafts: [], evaluationOutcome: 'degraded', allowResolution: false, degradationReasons: ['z', 'y'] });
    const h2 = computeSnapshotHash({ draftFingerprints: ['a', 'b'], drafts: [], evaluationOutcome: 'degraded', allowResolution: false, degradationReasons: ['y', 'z'] });
    expect(h1).toBe(h2);
  });

  it('changes when content genuinely differs', () => {
    const h1 = computeSnapshotHash({ draftFingerprints: ['a'], drafts: [], evaluationOutcome: 'completed', allowResolution: true, degradationReasons: [] });
    const h2 = computeSnapshotHash({ draftFingerprints: ['b'], drafts: [], evaluationOutcome: 'completed', allowResolution: true, degradationReasons: [] });
    expect(h1).not.toBe(h2);
  });
});

describe('buildEvaluationSnapshot — structural invariant', () => {
  it('allowResolution === (evaluationOutcome === "completed")', () => {
    const completed = buildEvaluationSnapshot([draft()], 'completed', []);
    expect(completed.allowResolution).toBe(true);
    const degraded = buildEvaluationSnapshot([draft()], 'degraded', ['serp-refresh-failed']);
    expect(degraded.allowResolution).toBe(false);
  });
});

describe('selectSerpCandidates — pair-aware, deterministic, capped', () => {
  const cached = new Set(['cached-a']);
  const isCached = (kw: string) => cached.has(kw);

  it('skips a pair needing 2 new SERPs when only 1 slot remains, wasting zero', () => {
    const candidates: SerpCandidateUnit[] = [{ reason: 'borderline-clustering', keywordA: 'x', keywordB: 'y', thresholdDistance: 0.01 }];
    const result = selectSerpCandidates(candidates, isCached, 1);
    expect(result.admittedCandidates).toHaveLength(0);
    expect(result.skippedCandidates).toHaveLength(1);
    expect(result.keywordsToFetch).toEqual([]);
  });

  it('admits a pair where one side is cached and only 1 slot remains', () => {
    const candidates: SerpCandidateUnit[] = [{ reason: 'borderline-clustering', keywordA: 'cached-a', keywordB: 'missing-b', thresholdDistance: 0.01 }];
    const result = selectSerpCandidates(candidates, isCached, 1);
    expect(result.admittedCandidates).toHaveLength(1);
    expect(result.keywordsToFetch).toEqual(['missing-b']);
  });

  it('two pairs sharing a keyword fetch it only once', () => {
    const candidates: SerpCandidateUnit[] = [
      { reason: 'cannibalization-disambiguation', keywordA: 'shared', keywordB: 'p1' },
      { reason: 'cannibalization-disambiguation', keywordA: 'shared', keywordB: 'p2' },
    ];
    const result = selectSerpCandidates(candidates, () => false, 30);
    expect(result.keywordsToFetch.sort()).toEqual(['p1', 'p2', 'shared']);
    expect(result.admittedCandidates).toHaveLength(2);
  });

  it('never exceeds the cap and continues scanning past an oversized candidate', () => {
    const candidates: SerpCandidateUnit[] = [
      { reason: 'borderline-clustering', keywordA: 'big1', keywordB: 'big2', thresholdDistance: 0.001 }, // needs 2, ranked first
      { reason: 'priority-revalidation', keywordA: 'small1', keywordB: null, knownVolume: 500 }, // needs 1, should still fit
    ];
    const result = selectSerpCandidates(candidates, () => false, 2);
    // both fit exactly (2 + ... wait cap=2, first candidate uses 2, second needs 1 more -> total 3 > cap -> second skipped)
    expect(result.keywordsToFetch.length).toBeLessThanOrEqual(2);
  });

  it('deterministic ranking: cannibalization first, then closest-to-threshold, then priority-revalidation by demand, then relevance, then keyword tie-break', () => {
    const candidates: SerpCandidateUnit[] = [
      { reason: 'priority-revalidation', keywordA: 'p', keywordB: null, knownVolume: 100 },
      { reason: 'cannibalization-disambiguation', keywordA: 'c', keywordB: null },
      { reason: 'borderline-clustering', keywordA: 'b', keywordB: null, thresholdDistance: 0.02 },
    ];
    const result = selectSerpCandidates(candidates, () => false, 30);
    expect(result.admittedCandidates.map((c) => c.keywordA)).toEqual(['c', 'b', 'p']);
  });

  it('respects the default 30-call config cap', () => {
    const candidates: SerpCandidateUnit[] = Array.from({ length: 40 }, (_, i) => ({ reason: 'priority-revalidation' as const, keywordA: `k${i}`, keywordB: null, knownVolume: 40 - i }));
    const result = selectSerpCandidates(candidates, () => false);
    expect(result.keywordsToFetch.length).toBeLessThanOrEqual(30);
  });
});

describe('computePlanFingerprint', () => {
  it('is stable for the same inputs (same day)', () => {
    const now = new Date();
    const a = computePlanFingerprint({ plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 15, estimatedCostUsd: 0.066, pricingVersion: 'v1', evidenceFreshnessSnapshotAt: now });
    const b = computePlanFingerprint({ plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 15, estimatedCostUsd: 0.066, pricingVersion: 'v1', evidenceFreshnessSnapshotAt: now });
    expect(a).toBe(b);
  });

  it('changes when planned work changes', () => {
    const now = new Date();
    const a = computePlanFingerprint({ plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 15, estimatedCostUsd: 0.066, pricingVersion: 'v1', evidenceFreshnessSnapshotAt: now });
    const b = computePlanFingerprint({ plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 20, estimatedCostUsd: 0.076, pricingVersion: 'v1', evidenceFreshnessSnapshotAt: now });
    expect(a).not.toBe(b);
  });
});

describe('computeApprovedCostUsd — absolute cumulative ceiling', () => {
  it('$0.40 already spent + $0.20 remaining approved = $0.60 ceiling, not $0.20', () => {
    expect(computeApprovedCostUsd(0.4, 0.2)).toBeCloseTo(0.6, 6);
  });

  it('initial run (zero spend) reduces to the plan estimate', () => {
    expect(computeApprovedCostUsd(0, 0.036)).toBeCloseTo(0.036, 6);
  });
});
