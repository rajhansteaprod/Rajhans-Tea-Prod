import { clusterKeywords, ClusteringKeywordInput } from '../../../src/modules/seo/market/services/clustering.engine';
import { SerpOverlapProvider } from '../../../src/modules/seo/market/market.types';

const kw = (id: string, keyword: string): ClusteringKeywordInput => ({ keywordId: id, keyword, normalizedKeyword: keyword });

function clusterOf(keyword: string, out: ReturnType<typeof clusterKeywords>) {
  return out.clusters.find((c) => c.members.some((m) => m.keyword === keyword));
}

describe('clusterKeywords — must-merge fixtures', () => {
  it('assam tea + assam ctc tea merge (shared specific anchor "assam")', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea')] });
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].members.map((m) => m.keyword).sort()).toEqual(['assam ctc tea', 'assam tea']);
  });

  it('kadak chai + kadak chai patti merge', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'kadak chai'), kw('2', 'kadak chai patti')] });
    expect(out.clusters).toHaveLength(1);
  });

  it('buy assam tea online + assam tea price merge (shared "assam", both commercial)', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'buy assam tea online'), kw('2', 'assam tea price')] });
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].primaryIntent).toBe('TRANSACTIONAL');
  });

  it('what is ctc tea + ctc tea benefits merge (shared "ctc", both informational)', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'what is ctc tea'), kw('2', 'ctc tea benefits')] });
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].primaryIntent).toBe('INFORMATIONAL');
  });

  it('bulk tea + bulk tea supplier merge via businessChannel anchor (no region needed)', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'bulk tea'), kw('2', 'bulk tea supplier')] });
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].clusterReasons.join(' ')).toContain('bulk tea');
  });
});

describe('clusterKeywords — must-NOT-merge fixtures', () => {
  it('assam tea and darjeeling tea stay separate (only generic "tea" overlaps)', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'darjeeling tea')] });
    expect(out.clusters).toHaveLength(2);
    expect(out.clusters.every((c) => c.members.length === 1)).toBe(true);
  });

  it('buy assam tea online and what is ctc tea stay separate (different anchors AND different intents)', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'buy assam tea online'), kw('2', 'what is ctc tea')] });
    expect(out.clusters).toHaveLength(2);
  });
});

describe('clusterKeywords — anti-bridge coherence (assam tea / assam ctc tea / ctc tea)', () => {
  it('does not chain all three into one cluster; splits deterministically', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea'), kw('3', 'ctc tea')] });
    expect(out.clusters).toHaveLength(2);
    const assamCluster = clusterOf('assam tea', out)!;
    const ctcCluster = clusterOf('ctc tea', out)!;
    expect(assamCluster).not.toBe(ctcCluster);
    expect(assamCluster.members.map((m) => m.keyword).sort()).toEqual(['assam ctc tea', 'assam tea']);
    expect(ctcCluster.members).toHaveLength(1);
    // every non-singleton cluster retains a common anchor across ALL members
    expect(assamCluster.clusterReasons.some((r) => r.includes('assam'))).toBe(true);
  });

  it('is order-independent: reversing input order yields the same clusters', () => {
    const forward = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea'), kw('3', 'ctc tea')] });
    const reversed = clusterKeywords({ keywords: [kw('3', 'ctc tea'), kw('2', 'assam ctc tea'), kw('1', 'assam tea')] });
    const shape = (out: typeof forward) => out.clusters.map((c) => c.members.map((m) => m.keyword).sort()).sort((a, b) => a.join().localeCompare(b.join()));
    expect(shape(forward)).toEqual(shape(reversed));
  });
});

describe('clusterKeywords — hard negatives', () => {
  it('excludes hard negatives from clustering and reports them separately', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'coffee beans online')] });
    expect(out.excludedKeywords).toEqual([{ keywordId: '2', keyword: 'coffee beans online', reason: 'hard_negative' }]);
    expect(out.clusters.some((c) => c.members.some((m) => m.keyword === 'coffee beans online'))).toBe(false);
  });
});

describe('clusterKeywords — missing-signal semantics', () => {
  it('excludes the modifier signal (renormalizes) when neither keyword has modifier evidence', () => {
    // assam tea / assam ctc tea: no commercial/informational modifiers on either side.
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea')] });
    const member = out.clusters[0].members.find((m) => m.keyword === 'assam ctc tea')!;
    expect(member.reasons.some((r) => r.signal === 'modifier')).toBe(false); // excluded, not scored 0
  });

  it('includes modifier as a real (low) score when both sides have evidence but disagree', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'buy assam tea online'), kw('2', 'assam tea price')] });
    const nonMedoid = out.clusters[0].members.find((m) => m.keyword !== out.clusters[0].label)!;
    const modifierReason = nonMedoid.reasons.find((r) => r.signal === 'modifier');
    expect(modifierReason).toBeDefined();
    expect(modifierReason!.score).toBe(0);
  });

  it('never fabricates a SERP signal when no provider is supplied', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea')] });
    for (const c of out.clusters) for (const m of c.members) expect(m.reasons.some((r) => r.signal === 'serp')).toBe(false);
    expect(out.clusters[0].serpOverlapEvidence).toBeNull();
  });

  it('marks SERP unavailable (not 0-fabricated) when a provider returns null for a pair, and available when it returns real evidence', () => {
    const isAssamPair = (a: string, b: string) => new Set([a, b]).size === 2 && [a, b].every((x) => x === 'assam tea' || x === 'assam ctc tea');
    const serpOverlap: SerpOverlapProvider = {
      getPairEvidence: (a, b) => (isAssamPair(a, b) ? { score: 0.9, reasons: ['shared top domain'] } : null),
    };
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea'), kw('3', 'ctc tea')], serpOverlap });
    const assamCluster = clusterOf('assam tea', out)!;
    const nonMedoid = assamCluster.members.find((m) => m.keyword !== assamCluster.label)!;
    const serpReason = nonMedoid.reasons.find((r) => r.signal === 'serp');
    expect(serpReason).toBeDefined();
    expect(serpReason!.score).toBeCloseTo(0.9, 5);
  });

  it('the anchor gate is required even when SERP evidence is present (SERP never bypasses it in 4b.3)', () => {
    // High SERP score between "assam tea" and "darjeeling tea" must NOT force a merge — no shared anchor.
    const serpOverlap: SerpOverlapProvider = { getPairEvidence: () => ({ score: 1, reasons: ['identical top 10'] }) };
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'darjeeling tea')], serpOverlap });
    expect(out.clusters).toHaveLength(2);
  });
});

describe('clusterKeywords — score guards', () => {
  it('every membershipScore and signal score is finite and within 0..1', () => {
    const out = clusterKeywords({
      keywords: [
        kw('1', 'assam tea'), kw('2', 'assam ctc tea'), kw('3', 'ctc tea'), kw('4', 'kadak chai'),
        kw('5', 'kadak chai patti'), kw('6', 'buy assam tea online'), kw('7', 'assam tea price'),
        kw('8', 'what is ctc tea'), kw('9', 'ctc tea benefits'), kw('10', 'bulk tea'), kw('11', 'bulk tea supplier'),
      ],
    });
    for (const c of out.clusters) {
      for (const m of c.members) {
        expect(Number.isFinite(m.membershipScore)).toBe(true);
        expect(m.membershipScore).toBeGreaterThanOrEqual(0);
        expect(m.membershipScore).toBeLessThanOrEqual(1);
        for (const r of m.reasons) {
          expect(Number.isFinite(r.score)).toBe(true);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(1);
        }
      }
      for (const i of c.intents) {
        expect(Number.isFinite(i.confidence)).toBe(true);
        expect(i.confidence).toBeGreaterThanOrEqual(0);
        expect(i.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('handles a single keyword (no pairs) without NaN/crash', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea')] });
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].members[0].membershipScore).toBe(1);
  });

  it('handles an empty input without crashing', () => {
    const out = clusterKeywords({ keywords: [] });
    expect(out.clusters).toEqual([]);
    expect(out.excludedKeywords).toEqual([]);
  });
});

describe('clusterKeywords — deterministic label/medoid', () => {
  it('picks a stable medoid/label regardless of input order', () => {
    const a = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea')] });
    const b = clusterKeywords({ keywords: [kw('2', 'assam ctc tea'), kw('1', 'assam tea')] });
    expect(a.clusters[0].label).toBe(b.clusters[0].label);
  });
});

describe('clusterKeywords — multi-intent aggregation', () => {
  it('aggregates cluster-level intent confidence as sum(member confidence)/memberCount', () => {
    const out = clusterKeywords({ keywords: [kw('1', 'assam tea'), kw('2', 'assam ctc tea')] });
    // Both members classify as CATEGORY at confidence 0.8 each -> cluster confidence (0.8+0.8)/2 = 0.8
    const categoryIntent = out.clusters[0].intents.find((i) => i.intent === 'CATEGORY');
    expect(categoryIntent).toBeDefined();
    expect(categoryIntent!.confidence).toBeCloseTo(0.8, 5);
  });
});
