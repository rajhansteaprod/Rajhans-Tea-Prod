import { planArticleAngle } from '../../../src/modules/seo/ai/blog-content-planner';
import { BlogContentEvidence } from '../../../src/modules/seo/ai/blog-ai.types';

const BASE_URL = 'https://rajhanstea.com';

function makeEvidence(overrides: Partial<BlogContentEvidence> = {}): BlogContentEvidence {
  return {
    product: {
      productId: 'p1',
      name: 'Rajhans Royal Darjeeling',
      slug: 'rajhans-royal-darjeeling',
      region: 'Darjeeling',
      description: 'Rajhans Royal Darjeeling is a light, aromatic black tea.',
      shortDescription: 'Light and aromatic.',
      bestTakenFor: ['Evening'],
      packOptions: [{ label: '250 gm' }],
      url: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
    },
    opportunity: {
      recommendationId: 'topical-authority-gap',
      recommendationType: 'topical-authority',
      entity: 'Darjeeling',
      targetUrl: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
      rationale: 'No educational content exists for Darjeeling tea.',
    },
    existingCorpus: [
      {
        title: 'The Art of Perfect Tea Brewing',
        slug: 'art-of-perfect-tea-brewing',
        url: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`,
        tags: ['brewing'],
        topicSummary: 'Making the perfect cup of tea is an art form that combines science.',
        keyIntents: ['brewing'],
      },
      {
        title: 'From Garden to Cup: Our Tea Journey',
        slug: 'garden-to-cup-tea-journey',
        url: `${BASE_URL}/blog/garden-to-cup-tea-journey/`,
        tags: ['story', 'assam'],
        topicSummary: 'Our tea comes from the finest CTC gardens in Assam.',
        keyIntents: ['sourcing'],
      },
      {
        title: 'Why Black Tea? Health Benefits Explained',
        slug: 'black-tea-health-benefits',
        url: `${BASE_URL}/blog/black-tea-health-benefits/`,
        tags: ['health'],
        topicSummary: 'Black tea is packed with benefits.',
        keyIntents: ['health'],
      },
    ],
    siteFacts: { baseUrl: BASE_URL },
    ...overrides,
  };
}

describe('planArticleAngle', () => {
  it('M: finds a distinct informational angle for Darjeeling (no existing post covers it)', () => {
    const result = planArticleAngle(makeEvidence());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.primaryQuestion).toBe('What is Darjeeling tea?');
      // The generic brewing guide is allowed...
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('art-of-perfect-tea-brewing'))).toBe(true);
      // ...but the Assam-specific sourcing story is NOT, since it doesn't mention Darjeeling.
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('garden-to-cup-tea-journey'))).toBe(false);
      // Health content is explicitly out of scope.
      expect(result.plan.topicsToAvoid.some((t) => t.topic.includes('health'))).toBe(true);
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('black-tea-health-benefits'))).toBe(false);
      // The product page is always allowed.
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('rajhans-royal-darjeeling'))).toBe(true);
    }
  });

  it('N: returns no_material_content_opportunity when an existing post already covers the entity as a primary subject', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        ...makeEvidence().existingCorpus,
        {
          title: 'Darjeeling Tea: The Complete Guide',
          slug: 'darjeeling-tea-complete-guide',
          url: `${BASE_URL}/blog/darjeeling-tea-complete-guide/`,
          tags: ['darjeeling'],
          topicSummary: 'Everything about Darjeeling tea.',
          keyIntents: [],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_material_content_opportunity');
      expect(result.details.join(' ')).toContain('darjeeling-tea-complete-guide');
    }
  });

  it('returns no_material_content_opportunity when there is no product evidence', () => {
    const result = planArticleAngle(makeEvidence({ product: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_material_content_opportunity');
  });

  it('returns no_material_content_opportunity when there is no entity', () => {
    const evidence = makeEvidence();
    evidence.opportunity.entity = '';
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(false);
  });

  it('a sourcing post that DOES mention the entity is allowed as a link target', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'From Garden to Cup: Our Tea Journey',
          slug: 'garden-to-cup-tea-journey',
          url: `${BASE_URL}/blog/garden-to-cup-tea-journey/`,
          tags: ['story'],
          topicSummary: 'Our tea comes from the hills of Darjeeling and the valleys of Assam.',
          keyIntents: ['sourcing'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('garden-to-cup-tea-journey'))).toBe(true);
    }
  });

  // ---------------------------------------------------------------------
  // Part C — tightened internal-link planning: "mentions brewing" is not
  // the same as "is a generic brewing guide".
  // ---------------------------------------------------------------------

  it('E: an Assam category/region article ("What Is Assam Tea?") is NOT classified as a generic Darjeeling brewing target', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'What Is Assam Tea?',
          slug: 'assam-tea-guide',
          url: `${BASE_URL}/blog/assam-tea-guide/`,
          tags: ['assam', 'guide', 'tea-tips'],
          topicSummary: 'Rajhans Royal Assam is a strong, malty black tea. Because of this strength, three-quarters of a spoon makes one full-strength cup.',
          keyIntents: ['brewing'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('assam-tea-guide'))).toBe(false);
    }
  });

  it('F: a recipe article is NOT classified as a generic brewing target even though it mentions brewing terms', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'Chai Beyond Tradition: Modern Tea Recipes',
          slug: 'modern-chai-recipes',
          url: `${BASE_URL}/blog/modern-chai-recipes/`,
          tags: ['recipes', 'modern', 'creative'],
          topicSummary: 'Steep Rajhans Tea in cold water overnight for a smooth iced tea. Brew strong tea and combine with milk and spices.',
          keyIntents: ['brewing', 'recipe'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('modern-chai-recipes'))).toBe(false);
      expect(result.plan.topicsToAvoid.some((t) => t.reason.includes('modern-chai-recipes') === false)).toBe(true);
    }
  });

  it('G: a genuine, single-purpose generic brewing article IS allowed', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'The Art of Perfect Tea Brewing',
          slug: 'art-of-perfect-tea-brewing',
          url: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`,
          tags: ['brewing', 'tea-tips', 'guide'],
          topicSummary: 'Making the perfect cup of tea is an art form. Water temperature is crucial.',
          keyIntents: ['brewing'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('art-of-perfect-tea-brewing'))).toBe(true);
    }
  });

  it('H: a sourcing article for a DIFFERENT, unrelated entity is excluded (and never silently reused)', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'From Garden to Cup: Our Tea Journey',
          slug: 'garden-to-cup-tea-journey',
          url: `${BASE_URL}/blog/garden-to-cup-tea-journey/`,
          tags: ['story', 'assam'],
          topicSummary: 'Our tea comes from the finest CTC gardens in Assam. These gardens benefit from the region\'s unique climate.',
          keyIntents: ['sourcing'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('garden-to-cup-tea-journey'))).toBe(false);
      expect(result.plan.topicsToAvoid.some((t) => t.topic.includes('sourcing') || t.topic.includes('estate'))).toBe(true);
    }
  });

  it('I: no minimum link count is forced — a single genuine brewing link plus the product link is a valid, complete plan', () => {
    const evidence = makeEvidence({
      existingCorpus: [
        {
          title: 'The Art of Perfect Tea Brewing',
          slug: 'art-of-perfect-tea-brewing',
          url: `${BASE_URL}/blog/art-of-perfect-tea-brewing/`,
          tags: ['brewing', 'tea-tips', 'guide'],
          topicSummary: 'Making the perfect cup of tea is an art form.',
          keyIntents: ['brewing'],
        },
        {
          title: 'What Is Assam Tea?',
          slug: 'assam-tea-guide',
          url: `${BASE_URL}/blog/assam-tea-guide/`,
          tags: ['assam', 'guide'],
          topicSummary: 'Rajhans Royal Assam is a strong, malty black tea.',
          keyIntents: ['brewing'],
        },
        {
          title: 'Chai Beyond Tradition: Modern Tea Recipes',
          slug: 'modern-chai-recipes',
          url: `${BASE_URL}/blog/modern-chai-recipes/`,
          tags: ['recipes'],
          topicSummary: 'Creative ways to enjoy Rajhans Tea.',
          keyIntents: ['brewing', 'recipe'],
        },
        {
          title: 'From Garden to Cup: Our Tea Journey',
          slug: 'garden-to-cup-tea-journey',
          url: `${BASE_URL}/blog/garden-to-cup-tea-journey/`,
          tags: ['story', 'assam'],
          topicSummary: 'Our tea comes from the finest CTC gardens in Assam.',
          keyIntents: ['sourcing'],
        },
      ],
    });
    const result = planArticleAngle(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only the product page + the one genuine brewing guide — exactly
      // the small, honest link universe Part C expects for Darjeeling.
      expect(result.plan.allowedLinkTargets).toHaveLength(2);
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('rajhans-royal-darjeeling'))).toBe(true);
      expect(result.plan.allowedLinkTargets.some((l) => l.href.includes('art-of-perfect-tea-brewing'))).toBe(true);
    }
  });
});
