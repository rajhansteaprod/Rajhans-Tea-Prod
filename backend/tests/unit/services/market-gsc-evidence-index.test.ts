function chain(result: unknown) {
  return { select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(result) }) }) };
}

let rows: { query: string; page: string; clicks: number; impressions: number; position: number }[] = [];
jest.mock('../../../src/modules/seo/models/gsc-query-page-metric.model', () => ({
  GscQueryPageMetric: { find: jest.fn(() => chain(rows)) },
}));

import { loadGscEvidenceIndex } from '../../../src/modules/seo/market/services/gsc-evidence-index';

const CANONICAL = 'https://rajhanstea.com/product/royal-assam/';
const OTHER = 'https://rajhanstea.com/product/royal-nilgiri/';
const canonicalSet = new Set([CANONICAL, OTHER]);

beforeEach(() => {
  rows = [];
});

describe('loadGscEvidenceIndex', () => {
  it('returns UNKNOWN for a candidate with no matching rows', async () => {
    const index = await loadGscEvidenceIndex(canonicalSet);
    const evidence = index.getCandidateEvidence(['assam tea'], CANONICAL);
    expect(evidence.state).toBe('UNKNOWN');
    expect(evidence.evidenceKnown).toBe(false);
  });

  it('aggregates real rows for the matching candidate URL, canonicalized via resolveGscUrl', async () => {
    rows = [
      { query: 'assam tea', page: CANONICAL, clicks: 5, impressions: 60, position: 2 },
      { query: 'assam tea', page: CANONICAL, clicks: 2, impressions: 40, position: 4 },
    ];
    const index = await loadGscEvidenceIndex(canonicalSet);
    const evidence = index.getCandidateEvidence(['assam tea'], CANONICAL);
    expect(evidence.evidenceKnown).toBe(true);
    expect(evidence.impressions).toBe(100);
    expect(evidence.avgPosition).toBeCloseTo((2 * 60 + 4 * 40) / 100, 5);
    expect(evidence.state).toBe('WINNING');
  });

  it('does not leak rows from a different canonical URL onto this candidate', async () => {
    rows = [{ query: 'nilgiri tea', page: OTHER, clicks: 1, impressions: 200, position: 1 }];
    const index = await loadGscEvidenceIndex(canonicalSet);
    const forWrongCandidate = index.getCandidateEvidence(['nilgiri tea'], CANONICAL);
    expect(forWrongCandidate.evidenceKnown).toBe(false);
    const forRightCandidate = index.getCandidateEvidence(['nilgiri tea'], OTHER);
    expect(forRightCandidate.evidenceKnown).toBe(true);
  });

  it('classifies EMERGING when impressions are below the strong-evidence floor even at a good position', async () => {
    rows = [{ query: 'assam tea', page: CANONICAL, clicks: 1, impressions: 10, position: 1 }];
    const index = await loadGscEvidenceIndex(canonicalSet);
    const evidence = index.getCandidateEvidence(['assam tea'], CANONICAL);
    expect(evidence.state).toBe('EMERGING');
  });

  it('classifies STRIKING_DISTANCE for position in [4,20] with enough impressions', async () => {
    rows = [{ query: 'assam tea', page: CANONICAL, clicks: 1, impressions: 60, position: 10 }];
    const index = await loadGscEvidenceIndex(canonicalSet);
    expect(index.getCandidateEvidence(['assam tea'], CANONICAL).state).toBe('STRIKING_DISTANCE');
  });

  it('cluster-wide demand evidence aggregates across ALL canonical URLs, not one candidate', async () => {
    rows = [
      { query: 'assam tea', page: CANONICAL, clicks: 1, impressions: 30, position: 5 },
      { query: 'assam tea', page: OTHER, clicks: 1, impressions: 20, position: 6 },
    ];
    const index = await loadGscEvidenceIndex(canonicalSet);
    const demand = index.getClusterDemandEvidence(['assam tea']);
    expect(demand.evidenceKnown).toBe(true);
    expect(demand.impressions).toBe(50);
  });

  it('cluster-wide demand evidence is UNKNOWN with no matching rows', async () => {
    const index = await loadGscEvidenceIndex(canonicalSet);
    expect(index.getClusterDemandEvidence(['no such query']).evidenceKnown).toBe(false);
  });

  it('ignores rows that do not resolve to any canonical URL', async () => {
    rows = [{ query: 'assam tea', page: 'https://rajhanstea.com/checkout/', clicks: 1, impressions: 500, position: 1 }];
    const index = await loadGscEvidenceIndex(canonicalSet);
    expect(index.getClusterDemandEvidence(['assam tea']).evidenceKnown).toBe(false);
  });
});
