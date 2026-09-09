import {
  applyInternalLinkPatch,
  contentAlreadyLinksTo,
  countOccurrences,
} from '../../../src/modules/seo/services/internal-link-patch.util';

describe('countOccurrences', () => {
  it('counts non-overlapping substring occurrences', () => {
    expect(countOccurrences('a cat sat on a mat', 'at')).toBe(3);
  });

  it('returns 0 for an empty needle or no match', () => {
    expect(countOccurrences('hello', '')).toBe(0);
    expect(countOccurrences('hello', 'xyz')).toBe(0);
  });
});

describe('applyInternalLinkPatch', () => {
  const before = 'The Art of Perfect Tea Brewing. For black tea like Rajhans CTC, use water heated to 200F.';

  it('A: inserts the link when context/anchor are exact and unambiguous', () => {
    const result = applyInternalLinkPatch(
      before,
      'For black tea like Rajhans CTC, use water heated to 200F.',
      'Rajhans CTC',
      'https://rajhanstea.com/blog/garden-to-cup-tea-journey/',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.afterContent).toBe(
        'The Art of Perfect Tea Brewing. For black tea like <a href="https://rajhanstea.com/blog/garden-to-cup-tea-journey/">Rajhans CTC</a>, use water heated to 200F.',
      );
      // Nothing outside the linked span changed.
      expect(result.afterContent.replace('<a href="https://rajhanstea.com/blog/garden-to-cup-tea-journey/">Rajhans CTC</a>', 'Rajhans CTC')).toBe(before);
    }
  });

  it('C: fails when the context is not present in the source content', () => {
    const result = applyInternalLinkPatch(before, 'This sentence does not exist anywhere.', 'CTC', 'https://rajhanstea.com/blog/x/');
    expect(result).toEqual({ ok: false, reason: 'context_not_found' });
  });

  it('C: fails when the anchor text is not present inside the given context', () => {
    const result = applyInternalLinkPatch(
      before,
      'For black tea like Rajhans CTC, use water heated to 200F.',
      'Darjeeling',
      'https://rajhanstea.com/blog/x/',
    );
    expect(result).toEqual({ ok: false, reason: 'anchor_not_in_context' });
  });

  it('D: fails when the context occurs more than once in the source content', () => {
    const repeated = 'Steep the tea. Steep the tea again for good measure.';
    const result = applyInternalLinkPatch(repeated, 'Steep the tea', 'Steep', 'https://rajhanstea.com/blog/x/');
    expect(result).toEqual({ ok: false, reason: 'context_ambiguous' });
  });

  it('D: fails when the anchor occurs more than once inside the (unique) context', () => {
    const result = applyInternalLinkPatch(
      'CTC leaves make CTC tea, a strong brew.',
      'CTC leaves make CTC tea, a strong brew.',
      'CTC',
      'https://rajhanstea.com/blog/x/',
    );
    expect(result).toEqual({ ok: false, reason: 'anchor_ambiguous_in_context' });
  });

  it('rejects anchor text containing characters that would break the HTML', () => {
    const result = applyInternalLinkPatch(before, before, '<script>', 'https://rajhanstea.com/blog/x/');
    expect(result).toEqual({ ok: false, reason: 'malformed_anchor_text' });
  });

  it('rejects a target URL containing a double-quote (attribute breakout)', () => {
    const result = applyInternalLinkPatch(before, before, 'CTC', 'https://rajhanstea.com/blog/x/"onmouseover=alert(1)');
    expect(result).toEqual({ ok: false, reason: 'malformed_target_url' });
  });
});

describe('contentAlreadyLinksTo (E: existing source→target link)', () => {
  it('detects an existing link to the exact target, trailing-slash tolerant', () => {
    const content = 'See <a href="https://rajhanstea.com/blog/garden-to-cup-tea-journey">here</a> for more.';
    expect(contentAlreadyLinksTo(content, 'https://rajhanstea.com/blog/garden-to-cup-tea-journey/')).toBe(true);
  });

  it('does not false-positive on a link to a different page', () => {
    const content = 'See <a href="https://rajhanstea.com/blog/other-post/">here</a> for more.';
    expect(contentAlreadyLinksTo(content, 'https://rajhanstea.com/blog/garden-to-cup-tea-journey/')).toBe(false);
  });

  it('returns false when there is no link at all', () => {
    expect(contentAlreadyLinksTo('Plain text, no links here.', 'https://rajhanstea.com/blog/x/')).toBe(false);
  });
});
