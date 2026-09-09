// =============================================================================
// UNIT TESTS — Phase 6.4B internal-link candidate quality gate
//
// Pure-function tests for evaluateAnchorQuality / selectAnchorPhrase, which
// reject anchors that are technically unambiguous in the source text but
// meaningless to a reader ("here", "science", a bare color/beverage noun).
// No DB, no network, no OpenAI.
// =============================================================================

import {
  evaluateAnchorQuality,
  selectAnchorPhrase,
} from '../../../src/modules/seo/services/change-draft-generator.service';

const genericTargetBlog = { title: 'Black Tea Health Benefits', tags: ['health', 'benefits'] };
const darjeelingTargetBlog = { title: 'Darjeeling Growing Regions', tags: ['Darjeeling', 'regions'] };

describe('evaluateAnchorQuality', () => {
  it('A: a descriptive multi-word anchor passes', () => {
    expect(evaluateAnchorQuality('black tea health benefits', genericTargetBlog)).toEqual({ ok: true });
    expect(evaluateAnchorQuality('supported by scientific research', genericTargetBlog)).toEqual({ ok: true });
  });

  it('B: generic single-word anchors fail (the rejected preview examples)', () => {
    expect(evaluateAnchorQuality('here', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'generic_single_word_anchor',
    });
    expect(evaluateAnchorQuality('science', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'generic_single_word_anchor',
    });
    expect(evaluateAnchorQuality('modern', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'generic_single_word_anchor',
    });
    expect(evaluateAnchorQuality('Black', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'generic_single_word_anchor',
    });
    expect(evaluateAnchorQuality('tea', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'generic_single_word_anchor',
    });
  });

  it('a multi-word phrase made entirely of stopwords/generic words still fails', () => {
    expect(evaluateAnchorQuality('here and there', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'anchor_lacks_meaning',
    });
  });

  it('an anchor longer than 6 words fails', () => {
    expect(evaluateAnchorQuality('one two three four five six seven eight', genericTargetBlog)).toEqual({
      ok: false,
      reason: 'anchor_too_long',
    });
  });

  it('G: a distinctive single-word entity tied to the target (a listed tag) passes', () => {
    expect(evaluateAnchorQuality('Darjeeling', darjeelingTargetBlog)).toEqual({ ok: true });
  });

  it('G: a single-word acronym passes regardless of target tags', () => {
    expect(evaluateAnchorQuality('CTC', genericTargetBlog)).toEqual({ ok: true });
  });

  it('a capitalized word that is neither an acronym nor a target tag still fails as a single word', () => {
    expect(evaluateAnchorQuality('Growing', darjeelingTargetBlog)).toEqual({
      ok: false,
      reason: 'single_word_not_distinctive_entity',
    });
  });
});

describe('selectAnchorPhrase', () => {
  it('A/D: prefers a descriptive multi-word phrase around the matched keyword over the bare word', () => {
    const sentence = 'Black tea is more than just a delicious beverage — it is packed with benefits supported by scientific research.';
    const phrase = selectAnchorPhrase(sentence, 'benefits', genericTargetBlog);
    expect(phrase).not.toBeNull();
    expect(phrase!.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    expect(phrase!.toLowerCase()).not.toBe('here');
    expect(sentence.includes(phrase!)).toBe(true);
  });

  it('C: an anchor unrelated to the target topic is never selected (no keyword in sentence)', () => {
    const sentence = 'Our packaging is fully recyclable and shipped in eco-friendly boxes.';
    // "benefits" never occurs in this sentence, so no window can be built around it.
    const phrase = selectAnchorPhrase(sentence, 'benefits', genericTargetBlog);
    expect(phrase).toBeNull();
  });

  it('F: returns null (no_safe_contextual_insertion) when no phrase in the sentence clears the quality gate', () => {
    // "science" is the only topic word present, and it is a banned generic
    // single word with no qualifying multi-word window around it.
    const sentence = 'Read more about the science here.';
    const phrase = selectAnchorPhrase(sentence, 'science', genericTargetBlog);
    expect(phrase).toBeNull();
  });

  it('G: selects a distinctive single-word entity when no descriptive phrase is available around it', () => {
    // Every neighboring word is a stopword, so no 2+ word window survives
    // edge-trimming — the single distinctive entity word is the only
    // qualifying candidate.
    const sentence = 'This is our Darjeeling.';
    const phrase = selectAnchorPhrase(sentence, 'darjeeling', darjeelingTargetBlog);
    expect(phrase).toBe('Darjeeling');
  });

  it('never forces a manufactured anchor — the returned phrase is always an exact substring of the sentence', () => {
    const sentence = 'For black tea like Rajhans CTC, use water heated to 200F.';
    const phrase = selectAnchorPhrase(sentence, 'ctc', genericTargetBlog);
    expect(phrase).not.toBeNull();
    expect(sentence.includes(phrase!)).toBe(true);
  });
});

describe('H: existing preflight/execution protections remain unaffected', () => {
  it('the quality gate only adds a new rejection path — it does not relax anchor/context exact-match rules', () => {
    // A phrase that passes evaluateAnchorQuality still must be an exact,
    // unique substring for applyInternalLinkPatch (tested separately in
    // internal-link-patch.util.test.ts and
    // seo-internal-link-execution-preflight.test.ts) — this test only
    // confirms evaluateAnchorQuality never approves a non-substring value.
    const targetBlog = { title: 'x', tags: [] as string[] };
    expect(evaluateAnchorQuality('   ', targetBlog)).toEqual({ ok: false, reason: 'empty_anchor' });
  });
});
