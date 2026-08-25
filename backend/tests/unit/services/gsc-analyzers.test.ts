// =============================================================================
// UNIT TESTS — GSC (Phase 4a) analyzers, scoring, confidence, credential safety
// Pure over metric fixtures. No DB, no network, no credentials.
// =============================================================================

import {
  expectedCtr,
  positionBucket,
  confidence,
  analyzeHighImpressionLowCtr,
  analyzeStrikingDistance,
  analyzeCannibalization,
  analyzeTrends,
  analyzeContentGaps,
} from '../../../src/modules/seo/services/gsc.analyzers';
import { demandBonus, liftPriority, opportunityPriority } from '../../../src/modules/seo/services/gsc.opportunity.service';
import { sanitizeGscError, trendWindows } from '../../../src/modules/seo/gsc.util';
import { QueryPageMetric, PageWindowMetric, SeoJoinFacts } from '../../../src/modules/seo/gsc.types';

const WIN = { start: '2026-08-01', end: '2026-08-28' };
const PREV = { start: '2026-07-04', end: '2026-07-31' };
const emptySeo = new Map<string, SeoJoinFacts>();
const ctx = { window: WIN, seo: emptySeo };

const qp = (over: Partial<QueryPageMetric>): QueryPageMetric => ({
  query: 'assam tea', page: 'https://rajhanstea.com/products/', normalizedUrl: 'https://rajhanstea.com/products/',
  clicks: 0, impressions: 0, ctr: 0, position: 10, ...over,
});
const pw = (over: Partial<PageWindowMetric>): PageWindowMetric => ({
  normalizedUrl: 'https://rajhanstea.com/blog/x/', clicks: 0, impressions: 0, ctr: 0, position: 10, ...over,
});

// -----------------------------------------------------------------------------
describe('expectedCtr curve + buckets', () => {
  it('is monotonically decreasing with position', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(3));
    expect(expectedCtr(3)).toBeGreaterThan(expectedCtr(10));
    expect(expectedCtr(10)).toBeGreaterThan(expectedCtr(20));
  });
  it('clamps outside the table', () => {
    expect(expectedCtr(0.5)).toBe(expectedCtr(1));
    expect(expectedCtr(500)).toBe(expectedCtr(100));
  });
  it('buckets positions', () => {
    expect(positionBucket(2)).toBe('1-3');
    expect(positionBucket(7)).toBe('4-10');
    expect(positionBucket(15)).toBe('11-20');
    expect(positionBucket(40)).toBe('21+');
  });
});

// -----------------------------------------------------------------------------
describe('confidence', () => {
  it('is low for small samples, high for large + supported', () => {
    expect(confidence({ impressions: 20, floor: 100 })).toBe('low');
    expect(confidence({ impressions: 400, floor: 100 })).toBe('medium'); // 3× floor
    expect(confidence({ impressions: 2000, floor: 100, hasClicks: true })).toBe('high'); // 10× + clicks
    expect(confidence({ impressions: 300, floor: 100, hasHistory: true, multiSignal: true })).toBe('high');
  });
});

// -----------------------------------------------------------------------------
describe('analyzeHighImpressionLowCtr', () => {
  it('flags high impressions with CTR well below expected', () => {
    const rows = [qp({ impressions: 500, ctr: 0.005, position: 5 })]; // expected ~5.5% ≫ 0.5%
    const out = analyzeHighImpressionLowCtr(rows, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('high-impression-low-ctr');
    expect(out[0].evidence.expectedCtr).toBeGreaterThan(out[0].evidence.ctr!);
    expect(out[0].evidence.scoreComponents).toBeDefined();
  });
  it('ignores low-impression rows and healthy CTR', () => {
    expect(analyzeHighImpressionLowCtr([qp({ impressions: 50, ctr: 0.001 })], ctx)).toHaveLength(0);
    expect(analyzeHighImpressionLowCtr([qp({ impressions: 500, ctr: 0.06, position: 5 })], ctx)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('analyzeStrikingDistance', () => {
  it('flags positions 4–20 with enough impressions', () => {
    const out = analyzeStrikingDistance([qp({ impressions: 100, ctr: 0.02, position: 8 })], ctx);
    expect(out).toHaveLength(1);
    expect(out[0].evidence.positionBucket).toBe('4-10');
  });
  it('excludes top-3 and beyond-20 and thin impressions', () => {
    expect(analyzeStrikingDistance([qp({ impressions: 100, position: 2 })], ctx)).toHaveLength(0);
    expect(analyzeStrikingDistance([qp({ impressions: 100, position: 25 })], ctx)).toHaveLength(0);
    expect(analyzeStrikingDistance([qp({ impressions: 10, position: 8 })], ctx)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('analyzeCannibalization', () => {
  it('flags only MEANINGFUL repeated competition (share + floor), never trivial secondaries', () => {
    const rows = [
      qp({ query: 'ctc chai', normalizedUrl: 'https://rajhanstea.com/products/', impressions: 300, position: 6 }),
      qp({ query: 'ctc chai', normalizedUrl: 'https://rajhanstea.com/catalog/kadak-and-strong/', impressions: 200, position: 9 }),
      qp({ query: 'ctc chai', normalizedUrl: 'https://rajhanstea.com/blog/x/', impressions: 5, position: 40 }), // trivial → ignored
    ];
    const out = analyzeCannibalization(rows, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('suspected-query-cannibalization');
    expect(out[0].evidence.competingUrls).toHaveLength(2); // the trivial one is excluded
    expect((out[0].evidence.competingUrls || []).every((c) => c.share >= 0.2)).toBe(true);
  });
  it('does not flag a single dominant page with a trivial secondary', () => {
    const rows = [
      qp({ query: 'q', normalizedUrl: 'https://rajhanstea.com/a/', impressions: 500, position: 3 }),
      qp({ query: 'q', normalizedUrl: 'https://rajhanstea.com/b/', impressions: 3, position: 50 }),
    ];
    expect(analyzeCannibalization(rows, ctx)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('analyzeTrends (equal complete windows)', () => {
  const tctx = { ...ctx, previousWindow: PREV };
  it('flags a declining page and a growing page', () => {
    const decline = analyzeTrends([pw({ normalizedUrl: 'https://rajhanstea.com/p/', impressions: 40, position: 12 })], [pw({ normalizedUrl: 'https://rajhanstea.com/p/', impressions: 100, position: 8 })], tctx);
    expect(decline.find((o) => o.type === 'declining-page')).toBeDefined();
    expect(decline[0].evidence.trend).toBe('down');
    expect(decline[0].evidence.previousImpressions).toBe(100);

    const grow = analyzeTrends([pw({ normalizedUrl: 'https://rajhanstea.com/g/', impressions: 200, position: 6 })], [pw({ normalizedUrl: 'https://rajhanstea.com/g/', impressions: 100, position: 6 })], tctx);
    expect(grow.find((o) => o.type === 'growing-query')).toBeDefined();
  });
  it('requires BOTH windows (no phantom trend from a new page) and a combined-impressions floor', () => {
    expect(analyzeTrends([pw({ normalizedUrl: 'https://x/new/', impressions: 500 })], [], tctx)).toHaveLength(0);
    expect(analyzeTrends([pw({ normalizedUrl: 'https://x/p/', impressions: 5 })], [pw({ normalizedUrl: 'https://x/p/', impressions: 5 })], tctx)).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('analyzeContentGaps', () => {
  const hubs = new Set(['https://rajhanstea.com/', 'https://rajhanstea.com/products/', 'https://rajhanstea.com/blog/']);
  it('flags a demandful query that only ranks via a hub', () => {
    const rows = [qp({ query: 'how to brew assam tea', normalizedUrl: 'https://rajhanstea.com/blog/', page: 'https://rajhanstea.com/blog/', impressions: 120, position: 14 })];
    const out = analyzeContentGaps(rows, { ...ctx, hubNormalizedUrls: hubs });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('content-gap');
  });
  it('does NOT flag when a dedicated page already ranks', () => {
    const rows = [qp({ query: 'assam tea', normalizedUrl: 'https://rajhanstea.com/catalog/kadak-and-strong/', page: 'https://rajhanstea.com/catalog/kadak-and-strong/', impressions: 200, position: 5 })];
    expect(analyzeContentGaps(rows, { ...ctx, hubNormalizedUrls: hubs })).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('demand boost (capped, distinct from severity)', () => {
  it('scales with impressions but is capped', () => {
    expect(demandBonus(0)).toBe(0);
    expect(demandBonus(1000000)).toBeLessThanOrEqual(20); // capped at maxBonus
    expect(demandBonus(500)).toBeGreaterThan(0);
  });
  it('lifts priority at most one level and never fabricates a critical jump', () => {
    const big = demandBonus(1000000);
    expect(liftPriority('low', big).priority).not.toBe('high'); // ≤ 1 level lift (low→medium)
    expect(liftPriority('low', 0).lifted).toBe(false);
  });
  it('maps score+confidence to priority; low confidence never presents as high', () => {
    expect(opportunityPriority(80, 'high').priority).toBe('high');
    expect(opportunityPriority(80, 'low').priority).toBe('medium'); // downgraded
    expect(opportunityPriority(10, 'high').priority).toBe('low');
  });
});

// -----------------------------------------------------------------------------
describe('credential safety + trend windows', () => {
  it('sanitizeGscError strips private keys, JWTs, and tokens', () => {
    const s = sanitizeGscError(new Error('fail -----BEGIN PRIVATE KEY-----abcDEF-----END PRIVATE KEY----- jwt=eyAAAAAAAA.bbbbbbbb.cccccc tok=ya29.SECRETTOKEN'));
    expect(s).not.toContain('PRIVATE KEY-----ab');
    expect(s).toContain('[REDACTED_PRIVATE_KEY]');
    expect(s).toContain('[REDACTED_JWT]');
    expect(s).toContain('[REDACTED_TOKEN]');
    expect(s).not.toContain('SECRETTOKEN');
  });
  it('trend windows are equal-length, adjacent, and complete', () => {
    const w = trendWindows(28, new Date('2026-08-31T00:00:00Z'));
    expect(w.latest.end < '2026-08-31').toBe(true); // respects the final-data lag
    expect(new Date(w.latest.start) > new Date(w.previous.end)).toBe(true); // adjacent, non-overlapping
    const len = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
    expect(len(w.previous.start, w.previous.end)).toBe(len(w.latest.start, w.latest.end)); // equal length
  });
});
