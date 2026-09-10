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
});
