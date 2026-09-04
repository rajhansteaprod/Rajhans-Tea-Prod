// =============================================================================
// UNIT TESTS — SEO Phase 6.1 determinism & provenance
//
// inputsHash is the load-bearing property of the whole phase: identical
// evidence must hash identically no matter when it was analysed, or the
// persisted artifact is a diary entry rather than a Phase 8 baseline.
// =============================================================================

import {
  buildEvidenceWindowKey,
  computeInputsHash,
} from '../../../src/modules/seo/content/services/page-analysis.service';
import { ANALYZER_VERSION } from '../../../src/modules/seo/content/content.config';
import { EXTRACTOR_VERSION } from '../../../src/modules/seo/services/parser.service';

const WINDOW_KEY = 'run:abc|gsc:2026-08-28|market:2026-08-01';

function hashInput(over: Record<string, unknown> = {}) {
  return {
    normalizedUrl: 'https://rajhanstea.com/product/assam-ctc/',
    analyzerVersion: ANALYZER_VERSION,
    extractorVersion: EXTRACTOR_VERSION,
    evidenceWindowKey: WINDOW_KEY,
    currentState: { title: 'Assam CTC', wordCount: 800, h2: ['Brewing', 'Sourcing'] },
    searchPerformance: { known: true, totals: { impressions: 412, clicks: 4 } },
    marketEvidence: { known: false, keywords: [] },
    existingWork: { openIssueCheckIds: [], openRecommendations: [] },
    topicCoverage: [{ term: 'assam', covered: true }],
    ...over,
  };
}

describe('computeInputsHash', () => {
  it('is stable across calls for identical evidence', () => {
    expect(computeInputsHash(hashInput())).toBe(computeInputsHash(hashInput()));
  });

  it('does not depend on object key ordering', () => {
    const a = computeInputsHash(hashInput({ currentState: { title: 'Assam CTC', wordCount: 800, h2: ['Brewing', 'Sourcing'] } }));
    const b = computeInputsHash(hashInput({ currentState: { h2: ['Brewing', 'Sourcing'], wordCount: 800, title: 'Assam CTC' } }));
    expect(b).toBe(a);
  });

  it('does not depend on the clock — no analyzedAt is part of the input', () => {
    // The signature has no timestamp field at all: a hash that could drift with
    // wall-clock time would make cross-run comparison meaningless.
    expect(Object.keys(hashInput())).not.toContain('analyzedAt');
  });

  it('changes when the page state genuinely changes', () => {
    const before = computeInputsHash(hashInput());
    const after = computeInputsHash(hashInput({ currentState: { title: 'Assam CTC', wordCount: 120, h2: [] } }));
    expect(after).not.toBe(before);
  });

  it('changes when search performance changes', () => {
    const after = computeInputsHash(hashInput({ searchPerformance: { known: true, totals: { impressions: 900, clicks: 4 } } }));
    expect(after).not.toBe(computeInputsHash(hashInput()));
  });

  it('changes when the analyzer version is bumped, so history is never rewritten', () => {
    const after = computeInputsHash(hashInput({ analyzerVersion: '6.1.1-content-v2' }));
    expect(after).not.toBe(computeInputsHash(hashInput()));
  });

  it('changes when the extractor version changes, since the inputs were captured differently', () => {
    const after = computeInputsHash(hashInput({ extractorVersion: null }));
    expect(after).not.toBe(computeInputsHash(hashInput()));
  });

  it('preserves array order, which carries meaning for headings', () => {
    const a = computeInputsHash(hashInput({ currentState: { h2: ['Brewing', 'Sourcing'] } }));
    const b = computeInputsHash(hashInput({ currentState: { h2: ['Sourcing', 'Brewing'] } }));
    expect(b).not.toBe(a);
  });
});

describe('buildEvidenceWindowKey', () => {
  it('is identical for the same audit run, GSC period and market day', () => {
    const key = buildEvidenceWindowKey({
      auditRunId: 'abc',
      gscPeriodEnd: '2026-08-28',
      marketEvidenceAt: new Date('2026-08-01T09:15:00Z'),
    });
    // Same day, different time of day ⇒ same window ⇒ upsert, not a new row.
    expect(
      buildEvidenceWindowKey({
        auditRunId: 'abc',
        gscPeriodEnd: '2026-08-28',
        marketEvidenceAt: new Date('2026-08-01T23:59:00Z'),
      }),
    ).toBe(key);
  });

  it('changes when the audit run moves, so a new run gets its own history row', () => {
    const a = buildEvidenceWindowKey({ auditRunId: 'abc', gscPeriodEnd: '2026-08-28', marketEvidenceAt: null });
    const b = buildEvidenceWindowKey({ auditRunId: 'def', gscPeriodEnd: '2026-08-28', marketEvidenceAt: null });
    expect(b).not.toBe(a);
  });

  it('changes when the GSC period moves', () => {
    const a = buildEvidenceWindowKey({ auditRunId: 'abc', gscPeriodEnd: '2026-08-28', marketEvidenceAt: null });
    const b = buildEvidenceWindowKey({ auditRunId: 'abc', gscPeriodEnd: '2026-09-25', marketEvidenceAt: null });
    expect(b).not.toBe(a);
  });

  it('records absent evidence explicitly rather than collapsing it', () => {
    expect(buildEvidenceWindowKey({ auditRunId: null, gscPeriodEnd: null, marketEvidenceAt: null })).toBe(
      'run:none|gsc:none|market:none',
    );
  });
});
