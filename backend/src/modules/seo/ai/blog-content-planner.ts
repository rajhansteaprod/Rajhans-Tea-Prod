import { ArticlePlan, ArticlePlanResult, BlogContentEvidence, ProposedInternalLink } from './blog-ai.types';

/**
 * Phase 6.7A Part C — deterministic (no OpenAI, no DataForSEO) article
 * planning: decides WHETHER a genuinely distinct informational angle exists
 * before any writer call, and WHICH existing pages are safe/relevant to link
 * to. Pure function over `BlogContentEvidence` — every field it reads was
 * itself deterministically assembled from DB content (see
 * change-draft-generator.service.ts), so the plan can be fully explained
 * without a network call.
 */
/**
 * True for a title shaped like this system's OWN region/category-guide
 * template ("What Is X Tea?") — a self-consistent, deterministic signal
 * that a post's real identity is "the guide for entity X", not a generic
 * cross-entity resource, regardless of what topic words its body happens
 * to also touch on.
 */
function isRegionOrCategoryGuideTitle(title: string): boolean {
  return /^what is .+ tea\??$/i.test(title.trim());
}

export function planArticleAngle(evidence: BlogContentEvidence): ArticlePlanResult {
  const details: string[] = [];
  const entity = evidence.opportunity.entity?.trim();

  if (!entity) {
    return { ok: false, reason: 'no_material_content_opportunity', details: ['Recommendation evidence has no entity to write about'] };
  }
  if (!evidence.product) {
    return {
      ok: false,
      reason: 'no_material_content_opportunity',
      details: [`No grounded product evidence is available for "${entity}" — an article cannot be written without a factual authority`],
    };
  }

  const entityLower = entity.toLowerCase();

  // Cannibalization gate: does any existing post already have this entity as
  // its PRIMARY subject (title or tag match)? A post merely MENTIONING the
  // entity in passing does not count — only a clear primary-subject match.
  const primaryCollision = evidence.existingCorpus.find((post) => {
    const titleLower = post.title.toLowerCase();
    const tagsLower = post.tags.map((t) => t.toLowerCase());
    return titleLower.includes(entityLower) || tagsLower.includes(entityLower);
  });
  if (primaryCollision) {
    return {
      ok: false,
      reason: 'no_material_content_opportunity',
      details: [`Existing post "${primaryCollision.slug}" already covers "${entity}" as a primary subject (title/tag match) — writing another would cannibalize it`],
    };
  }

  const topicsToAvoid: { topic: string; reason: string }[] = [];
  const allowedLinkTargets: ProposedInternalLink[] = [];
  const seenHrefs = new Set<string>();

  const addLink = (href: string, anchor: string) => {
    if (seenHrefs.has(href)) return;
    seenHrefs.add(href);
    allowedLinkTargets.push({ href, anchor });
  };

  // The commercial product page is always a natural, allowed link — but see
  // the writer/quality-gate rules: it may appear at most once/twice, never
  // repeatedly, and must read as informational context, not a sales pitch.
  addLink(evidence.product.url, `${evidence.product.name} product page`);

  for (const post of evidence.existingCorpus) {
    const postMentionsEntity = post.topicSummary.toLowerCase().includes(entityLower) || post.title.toLowerCase().includes(entityLower);

    if (post.keyIntents.includes('brewing')) {
      // Phase 6.7B — "mentions brewing" is NOT the same as "IS a generic
      // brewing guide". A post whose PRIMARY purpose is genuinely brewing
      // mechanics (water temperature, steeping, ratio) — and NOTHING else,
      // and which isn't itself a region/category guide for a different
      // entity — is safe to link from any region guide. Everything else
      // that merely mentions brewing terms (a recipe post, another
      // region's own "What Is X Tea?" guide) is excluded: it would either
      // misdirect the reader to unrelated content or implicitly borrow
      // another entity's identity for this one.
      const isPrimaryBrewingGuide = post.keyIntents.length === 1 && post.keyIntents[0] === 'brewing' && !isRegionOrCategoryGuideTitle(post.title);
      if (isPrimaryBrewingGuide && !postMentionsEntity) {
        addLink(post.url, 'brewing guide');
      }
      topicsToAvoid.push({
        topic: 'detailed brewing mechanics (water temperature, steeping time, leaf-to-water ratio)',
        reason: `already covered in "${post.title}" — link to it rather than restating`,
      });
    }

    if (post.keyIntents.includes('sourcing')) {
      if (postMentionsEntity) {
        // The sourcing story genuinely discusses OUR entity — safe & relevant.
        addLink(post.url, 'sourcing story');
      } else {
        // The sourcing story is about a DIFFERENT region/entity — linking it
        // here, or reusing its garden/harvest/processing claims, would
        // misrepresent this entity's own sourcing as identical to another's.
        topicsToAvoid.push({
          topic: 'garden/estate/harvest/processing sourcing narrative',
          reason: `"${post.title}" already tells that story for a different subject — do not imply the same specific sourcing details apply here without evidence`,
        });
      }
    }

    if (post.keyIntents.includes('health')) {
      topicsToAvoid.push({ topic: 'health/wellbeing benefits', reason: `out of this article's grounding scope; see "${post.title}" separately` });
    }

    if (post.keyIntents.includes('recipe')) {
      topicsToAvoid.push({ topic: 'recipe variations / preparation styles', reason: `already covered in "${post.title}"` });
    }
  }

  const plan: ArticlePlan = {
    primaryQuestion: `What is ${entity} tea?`,
    scope: [
      'origin/region (grounded only in Product.region / Product.description)',
      'flavour and strength (grounded only in Product.description / Product.shortDescription)',
      'how much to use per cup, if a concentration/ratio fact exists in evidence',
      'when to enjoy it (grounded only in Product.bestTakenFor, stated as a recommendation, never an exclusivity claim)',
      'available pack sizes (grounded only in Product.packOptions)',
    ],
    topicsAllowed: ['Facts drawn ONLY from Product.description, Product.shortDescription, Product.region, Product.bestTakenFor, and Product.packOptions for this entity.'],
    topicsToAvoid,
    allowedLinkTargets,
    cannibalizationNotes: [...details, `No existing post has "${entity}" as its primary title/tag subject — a distinct informational angle exists.`],
  };

  return { ok: true, plan };
}
