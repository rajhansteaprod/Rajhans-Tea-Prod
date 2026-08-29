import { finalizeIntents } from '../../../src/modules/seo/market/services/intent-classifier';

describe('finalizeIntents', () => {
  it('classifies a bare category query as CATEGORY', () => {
    expect(finalizeIntents('assam tea')[0]).toMatchObject({ intent: 'CATEGORY' });
    expect(finalizeIntents('darjeeling tea')[0]).toMatchObject({ intent: 'CATEGORY' });
  });

  it('classifies a commercial query as TRANSACTIONAL, with CATEGORY as secondary when a core entity is present', () => {
    const intents = finalizeIntents('buy assam tea online');
    expect(intents[0].intent).toBe('TRANSACTIONAL');
    expect(intents.some((i) => i.intent === 'CATEGORY')).toBe(true);
  });

  it('classifies "what is X" as INFORMATIONAL', () => {
    expect(finalizeIntents('what is ctc tea')[0].intent).toBe('INFORMATIONAL');
    expect(finalizeIntents('ctc tea benefits')[0].intent).toBe('INFORMATIONAL');
  });

  it('classifies how-to/recipe queries as HOW_TO', () => {
    expect(finalizeIntents('how to make kadak chai')[0].intent).toBe('HOW_TO');
  });

  it('classifies comparison queries as COMPARISON', () => {
    expect(finalizeIntents('assam tea vs darjeeling tea')[0].intent).toBe('COMPARISON');
  });

  it('classifies a pure businessChannel query as TRANSACTIONAL', () => {
    expect(finalizeIntents('bulk tea supplier')[0].intent).toBe('TRANSACTIONAL');
  });

  it('classifies a brand-only query as NAVIGATIONAL', () => {
    expect(finalizeIntents('rajhans')[0].intent).toBe('NAVIGATIONAL');
  });

  it('always returns at least one intent, even with no strong signal', () => {
    const intents = finalizeIntents('random unrelated phrase xyz');
    expect(intents.length).toBeGreaterThanOrEqual(1);
    expect(intents[0].confidence).toBeLessThan(0.5);
  });

  it('every confidence is finite and within 0..1', () => {
    for (const phrase of ['assam tea', 'buy assam tea online', 'what is ctc tea', 'random xyz']) {
      for (const i of finalizeIntents(phrase)) {
        expect(Number.isFinite(i.confidence)).toBe(true);
        expect(i.confidence).toBeGreaterThanOrEqual(0);
        expect(i.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
