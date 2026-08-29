import { normalizeKeyword, dedupeKeywords } from '../../../src/modules/seo/market/services/keyword-normalize';

describe('normalizeKeyword', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeKeyword('  Assam   Tea  ')).toBe('assam tea');
  });

  it('strips diacritics', () => {
    expect(normalizeKeyword('café tea')).toBe('cafe tea');
  });

  it('preserves intent-bearing modifiers as distinct keys', () => {
    expect(normalizeKeyword('assam tea')).not.toBe(normalizeKeyword('assam ctc tea'));
    expect(normalizeKeyword('assam tea')).not.toBe(normalizeKeyword('assam tea benefits'));
    expect(normalizeKeyword('assam tea')).not.toBe(normalizeKeyword('buy assam tea'));
    expect(normalizeKeyword('assam tea')).not.toBe(normalizeKeyword('assam tea vs darjeeling'));
  });

  it('returns empty string for empty/whitespace-only input', () => {
    expect(normalizeKeyword('')).toBe('');
    expect(normalizeKeyword('   ')).toBe('');
  });
});

describe('dedupeKeywords', () => {
  it('groups case/whitespace variants under one identity, keeping first surface form', () => {
    const out = dedupeKeywords(['Assam Tea', 'assam tea', '  ASSAM TEA  ']);
    expect(out).toHaveLength(1);
    expect(out[0].keyword).toBe('Assam Tea');
    expect(out[0].normalizedKeyword).toBe('assam tea');
    expect(out[0].variants).toEqual(['Assam Tea', 'assam tea', 'ASSAM TEA']);
  });

  it('keeps distinct-intent keywords separate', () => {
    const out = dedupeKeywords(['assam tea', 'assam ctc tea', 'buy assam tea']);
    expect(out).toHaveLength(3);
  });

  it('skips blank entries', () => {
    const out = dedupeKeywords(['', '   ', 'chai']);
    expect(out).toHaveLength(1);
    expect(out[0].keyword).toBe('chai');
  });
});
