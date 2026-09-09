// =============================================================================
// UNIT TESTS — Phase 6.4C destination-intent relevance gate
//
// Topic/entity overlap between a candidate sentence and a target page is not
// sufficient to justify an internal link: the sentence must also describe
// or naturally imply the target's actual PURPOSE (brewing guide, sourcing
// story, health-benefits article, recipe page, ...). Pure-function tests
// only — no DB, no network, no OpenAI.
// =============================================================================

import {
  textIntentCategories,
  blogIntentCategories,
} from '../../../src/modules/seo/services/change-draft-generator.service';

describe('textIntentCategories', () => {
  it('classifies brewing-intent language', () => {
    expect(textIntentCategories('Steep the leaves for three minutes at the right temperature.')).toEqual(
      new Set(['brewing']),
    );
  });

  it('classifies sourcing/harvest-intent language', () => {
    expect(textIntentCategories('Our tea is harvested by hand on the estate every season.')).toEqual(
      new Set(['sourcing']),
    );
  });

  it('classifies health-benefit-intent language', () => {
    expect(textIntentCategories('This tea is rich in antioxidants and supports digestion.')).toEqual(
      new Set(['health']),
    );
  });

  it('classifies recipe/preparation-intent language', () => {
    expect(textIntentCategories('Try this chai recipe with warming spices and a cardamom blend.')).toEqual(
      new Set(['recipe']),
    );
  });

  it('returns an empty set for text with no classifiable purpose', () => {
    expect(textIntentCategories('We deliver across Pan India with tracked, insured shipping.')).toEqual(new Set());
  });

  it('can classify more than one intent when a sentence genuinely spans categories', () => {
    const cats = textIntentCategories('Harvested from our gardens, this tea is then steeped to bring out its antioxidants.');
    expect(cats.has('sourcing')).toBe(true);
    expect(cats.has('brewing')).toBe(true);
    expect(cats.has('health')).toBe(true);
  });
});

describe('blogIntentCategories', () => {
  it('derives a brewing-guide target purpose from its own title/content', () => {
    const blog = {
      title: 'The Art of Perfect Tea Brewing',
      content: '<p>Steep your tea at the right water temperature for the best flavor.</p>',
    };
    expect(blogIntentCategories(blog).has('brewing')).toBe(true);
  });

  it('derives a sourcing-story target purpose from its own title/content', () => {
    const blog = {
      title: 'From Garden to Cup: Our Tea Journey',
      content: '<p>Our tea comes from the finest gardens in Assam, harvested by expert hands.</p>',
    };
    expect(blogIntentCategories(blog).has('sourcing')).toBe(true);
  });

  it('derives a health-benefits target purpose from its own title/content', () => {
    const blog = {
      title: 'Black Tea Health Benefits',
      content: '<p>Black tea is packed with antioxidants that support your health.</p>',
    };
    expect(blogIntentCategories(blog).has('health')).toBe(true);
  });

  it('derives a recipe-page target purpose from its own title/content', () => {
    const blog = {
      title: 'Modern Chai Recipes',
      content: '<p>Try these chai recipes with your favorite spice blend.</p>',
    };
    expect(blogIntentCategories(blog).has('recipe')).toBe(true);
  });

  it('returns an empty set when the post has no classifiable destination purpose', () => {
    const blog = { title: 'Our Shipping Policy', content: '<p>We deliver across Pan India with tracked shipping.</p>' };
    expect(blogIntentCategories(blog)).toEqual(new Set());
  });
});

describe('destination-intent gate — topic overlap without intent overlap must not pass', () => {
  it('a sourcing sentence about CTC gardens does not satisfy a brewing-guide target, despite sharing the CTC entity', () => {
    const brewingTarget = {
      title: 'The Art of Perfect Tea Brewing',
      content: '<p>For black tea like Rajhans CTC, use water heated to 200-212°F.</p>',
    };
    const sourcingSentence = 'Our tea comes from the finest CTC (Crush-Tear-Curl) gardens in Assam.';

    const targetIntents = blogIntentCategories(brewingTarget);
    const sentenceIntents = textIntentCategories(sourcingSentence);
    const sharesIntent = [...sentenceIntents].some((c) => targetIntents.has(c));

    expect(targetIntents.has('brewing')).toBe(true);
    expect(sentenceIntents.has('sourcing')).toBe(true);
    expect(sharesIntent).toBe(false);
  });

  it('a brewing sentence about Rajhans CTC does not satisfy a sourcing-story target, despite sharing the CTC entity', () => {
    const sourcingTarget = {
      title: 'From Garden to Cup: Our Tea Journey',
      content: '<p>Our tea comes from the finest CTC gardens in Assam.</p>',
    };
    const brewingSentence = 'For black tea like Rajhans CTC, steep at the right water temperature for best flavor.';

    const targetIntents = blogIntentCategories(sourcingTarget);
    const sentenceIntents = textIntentCategories(brewingSentence);
    const sharesIntent = [...sentenceIntents].some((c) => targetIntents.has(c));

    expect(targetIntents.has('sourcing')).toBe(true);
    expect(sentenceIntents.has('brewing')).toBe(true);
    expect(sharesIntent).toBe(false);
  });

  it('a sentence that genuinely carries the target destination intent does pass', () => {
    const brewingTarget = { title: 'The Art of Perfect Tea Brewing', content: '<p>Steep your tea well.</p>' };
    const matchingSentence = 'Steeping black tea for the right amount of time brings out its best flavor.';

    const targetIntents = blogIntentCategories(brewingTarget);
    const sentenceIntents = textIntentCategories(matchingSentence);
    const sharesIntent = [...sentenceIntents].some((c) => targetIntents.has(c));

    expect(sharesIntent).toBe(true);
  });
});
