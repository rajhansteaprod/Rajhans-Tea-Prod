import { computeResolutionCoverage, allOpenRecommendationsCovered } from '../../../src/modules/seo/market/services/resolution-coverage';
import { MemberCoverageStatus } from '../../../src/modules/seo/market/services/active-keyword-universe';

describe('computeResolutionCoverage', () => {
  it('AB: mixed members (one participated, one now hard-negative) -> reevaluated', () => {
    const verdicts = new Map<string, MemberCoverageStatus>([
      ['assam tea', 'participated'],
      ['coffee beans', 'explicitly-ineligible'],
    ]);
    const result = computeResolutionCoverage([{ fingerprint: 'fp1', memberKeywords: ['assam tea', 'coffee beans'] }], verdicts);
    expect(result[0].status).toBe('reevaluated');
  });

  it('AC: all members now ineligible -> explicitly-ineligible', () => {
    const verdicts = new Map<string, MemberCoverageStatus>([
      ['coffee beans', 'explicitly-ineligible'],
      ['random phrase', 'explicitly-ineligible'],
    ]);
    const result = computeResolutionCoverage([{ fingerprint: 'fp1', memberKeywords: ['coffee beans', 'random phrase'] }], verdicts);
    expect(result[0].status).toBe('explicitly-ineligible');
  });

  it('AG: missing/empty memberKeywords -> unresolved-coverage', () => {
    const result = computeResolutionCoverage([{ fingerprint: 'fp1', memberKeywords: [] }, { fingerprint: 'fp2', memberKeywords: null }], new Map());
    expect(result[0].status).toBe('unresolved-coverage');
    expect(result[1].status).toBe('unresolved-coverage');
  });

  it('any unresolved member forces unresolved-coverage even if others participated', () => {
    const verdicts = new Map<string, MemberCoverageStatus>([['assam tea', 'participated']]);
    const result = computeResolutionCoverage([{ fingerprint: 'fp1', memberKeywords: ['assam tea', 'never evaluated'] }], verdicts);
    expect(result[0].status).toBe('unresolved-coverage');
  });
});

describe('allOpenRecommendationsCovered', () => {
  it('false when any recommendation is unresolved-coverage', () => {
    expect(allOpenRecommendationsCovered([
      { fingerprint: 'a', status: 'reevaluated', reason: '' },
      { fingerprint: 'b', status: 'unresolved-coverage', reason: '' },
    ])).toBe(false);
  });
  it('true when every recommendation is reevaluated or explicitly-ineligible', () => {
    expect(allOpenRecommendationsCovered([
      { fingerprint: 'a', status: 'reevaluated', reason: '' },
      { fingerprint: 'b', status: 'explicitly-ineligible', reason: '' },
    ])).toBe(true);
  });
  it('true (vacuously) when there are zero open recommendations', () => {
    expect(allOpenRecommendationsCovered([])).toBe(true);
  });
});
