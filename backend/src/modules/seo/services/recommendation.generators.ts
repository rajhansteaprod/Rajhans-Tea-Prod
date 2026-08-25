import { DetectedIssue, PageObservation, RecommendationDraft } from '../seo.types';
import { isIndexableHtml, selfUrl } from './crosspage.service';

/**
 * Phase 3A recommendation generators. Each is a pure function over the run's
 * audit output (detected issues + page snapshots + the inbound-link graph) and
 * emits zero or more RecommendationDrafts. No copy is generated and nothing is
 * mutated — drafts only describe WHAT to do and WHY.
 */
export interface RecoContext {
  baseUrl: string;
  detected: DetectedIssue[];
  observations: PageObservation[];
  inbound: Map<string, number>; // normalized URL → inbound internal link count
}

// ── Config: paths excluded from thin-content, and the topical entity list ──
export const recoConfig = {
  thinContentWordCount: Number(process.env.SEO_THIN_WORDS ?? 250),
  lowInboundThreshold: Number(process.env.SEO_LOW_INBOUND ?? 1), // ≤ this (but > 0) = low
  // Pages that are legitimately short / not article content — never "thin".
  thinContentExcludePatterns: [
    /^\/$/, // homepage
    /^\/products\/?$/, // listing pages
    /^\/blog\/?$/,
    /^\/catalog\//,
    /^\/contact\//,
    /^\/tea-finder\//,
    /^\/track-order\//,
    /^\/(error|404)\/?$/,
    /^\/page\/(shipping-policy|terms-and-conditions|return-refund-policy|privacy-policy|faq|contact-us|reseller)\//,
  ],
  // Topical-authority tea entities (configurable). Matched case-insensitively
  // against product titles/slugs (what the store sells) and blog titles/slugs.
  topicalEntities: (process.env.SEO_TOPICAL_ENTITIES ?? 'Assam,Nilgiri,Darjeeling,Dooars,CTC,Green Tea,Masala Chai')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

const issuesOf = (ctx: RecoContext, checkId: string) => ctx.detected.filter((i) => i.checkId === checkId);
const path = (url: string, base: string): string => {
  try {
    return new URL(url, base).pathname;
  } catch {
    return url;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) Duplicate metadata → one grouped recommendation
// ─────────────────────────────────────────────────────────────────────────────
export function recommendDuplicateMetadata(ctx: RecoContext): RecommendationDraft[] {
  const titles = issuesOf(ctx, 'duplicate-title');
  const descs = issuesOf(ctx, 'duplicate-description');
  if (!titles.length && !descs.length) return [];

  const urls = Array.from(new Set([...titles, ...descs].map((i) => i.normalizedUrl))).sort();
  const titleGroups = groupSharedValues(titles);
  const descGroups = groupSharedValues(descs);

  return [
    {
      recommendationId: 'duplicate-metadata',
      category: 'metadata',
      title: `${urls.length} page${urls.length === 1 ? '' : 's'} share duplicate title/description metadata`,
      why:
        'Duplicate <title>/meta description text weakens keyword targeting and click-through: ' +
        'search engines cannot tell the pages apart and may collapse or under-rank them.',
      affectedUrls: urls,
      evidence: {
        duplicateTitleUrls: titles.map((i) => i.normalizedUrl),
        duplicateDescriptionUrls: descs.map((i) => i.normalizedUrl),
        sharedTitles: titleGroups,
        sharedDescriptions: descGroups,
      },
      suggestedFix:
        'Write a unique, intent-aligned title and meta description for each page describing its specific ' +
        'purpose/search intent. (Do not auto-generate — draft manually and review.)',
      estimatedEffort: 'medium',
      signals: { isDuplicateMetadata: true },
      relatedCheckIds: ['duplicate-title', 'duplicate-description'],
    },
  ];
}

function groupSharedValues(issues: DetectedIssue[]): { value: unknown; urls: string[] }[] {
  const byValue = new Map<string, { value: unknown; urls: string[] }>();
  for (const i of issues) {
    const val = (i.evidence.extra?.sharedValue as string) ?? String(i.evidence.actual ?? '');
    const g = byValue.get(val) || { value: i.evidence.actual, urls: [] };
    g.urls.push(i.normalizedUrl);
    byValue.set(val, g);
  }
  return Array.from(byValue.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Internal linking → orphan / redirecting-links / low-inbound
// ─────────────────────────────────────────────────────────────────────────────
export function recommendInternalLinking(ctx: RecoContext): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];

  const orphans = issuesOf(ctx, 'orphan-page');
  if (orphans.length) {
    const urls = orphans.map((i) => i.normalizedUrl).sort();
    out.push({
      recommendationId: 'link-orphan-pages',
      category: 'internal-linking',
      title: `Add internal links to ${urls.length} orphaned page${urls.length === 1 ? '' : 's'}`,
      why:
        'Pages with no inbound internal links receive little crawl priority and almost no link equity, ' +
        'so they rank poorly regardless of content quality.',
      affectedUrls: urls,
      evidence: { orphanUrls: urls },
      suggestedFix:
        'Add contextual internal links to each page from relevant hubs (nav, related content, category pages).',
      estimatedEffort: 'small',
      signals: {},
      relatedCheckIds: ['orphan-page'],
    });
  }

  const redirects = issuesOf(ctx, 'internal-link-to-redirect');
  if (redirects.length) {
    const targets = redirects.map((i) => i.normalizedUrl).sort();
    const affectedLinks = redirects.reduce((n, i) => n + Number(i.evidence.extra?.affectedLinks ?? 0), 0);
    out.push({
      recommendationId: 'fix-redirecting-links',
      category: 'internal-linking',
      title: `Replace ${affectedLinks} internal link${affectedLinks === 1 ? '' : 's'} that hit a redirect`,
      why:
        'Internal links pointing at non-canonical URLs waste crawl budget and dilute link equity through the ' +
        '301 hop; linking directly to the canonical URL passes full value and is faster for users.',
      affectedUrls: targets,
      evidence: {
        redirectTargets: redirects.map((i) => ({
          canonical: i.normalizedUrl,
          affectedLinks: i.evidence.extra?.affectedLinks,
          sourcePages: i.evidence.extra?.affectedSourcePages,
        })),
        totalAffectedLinks: affectedLinks,
      },
      suggestedFix:
        'Update the source links (or the URL generator) to point at the canonical trailing-slash URL directly.',
      estimatedEffort: 'small',
      signals: {},
      relatedCheckIds: ['internal-link-to-redirect'],
    });
  }

  // Low (but non-zero) inbound links among indexable pages, excluding orphans/homepage.
  const orphanSet = new Set(orphans.map((i) => i.normalizedUrl));
  const lowInbound = ctx.observations
    .filter((o) => isIndexableHtml(o, ctx.baseUrl))
    .map((o) => ({ url: selfUrl(o, ctx.baseUrl), count: ctx.inbound.get(selfUrl(o, ctx.baseUrl)) ?? 0 }))
    .filter((x) => x.count > 0 && x.count <= recoConfig.lowInboundThreshold && !orphanSet.has(x.url) && path(x.url, ctx.baseUrl) !== '/')
    .sort((a, b) => a.count - b.count);
  if (lowInbound.length) {
    out.push({
      recommendationId: 'boost-low-inbound-pages',
      category: 'internal-linking',
      title: `Strengthen internal links to ${lowInbound.length} weakly-linked page${lowInbound.length === 1 ? '' : 's'}`,
      why:
        'Pages with only one inbound internal link have thin link equity and shallow crawl depth; adding a ' +
        'few more contextual links improves their ranking potential.',
      affectedUrls: lowInbound.map((x) => x.url),
      evidence: { pages: lowInbound, threshold: recoConfig.lowInboundThreshold },
      suggestedFix: 'Add 2–3 contextual internal links to each page from topically-related pages.',
      estimatedEffort: 'small',
      signals: {},
      relatedCheckIds: ['orphan-page'],
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Thin content → expand
// ─────────────────────────────────────────────────────────────────────────────
export function recommendThinContent(ctx: RecoContext): RecommendationDraft[] {
  const thin = ctx.observations
    .filter((o) => isIndexableHtml(o, ctx.baseUrl))
    .filter((o) => {
      const p = path(selfUrl(o, ctx.baseUrl), ctx.baseUrl);
      if (recoConfig.thinContentExcludePatterns.some((re) => re.test(p))) return false;
      return o.wordCount < recoConfig.thinContentWordCount;
    })
    .map((o) => ({ url: selfUrl(o, ctx.baseUrl), wordCount: o.wordCount, hasH1: o.h1.length > 0 }));

  if (!thin.length) return [];
  const urls = thin.map((t) => t.url).sort();
  return [
    {
      recommendationId: 'thin-content',
      category: 'content',
      title: `Expand thin content on ${urls.length} page${urls.length === 1 ? '' : 's'}`,
      why:
        'Pages with very little unique text give search engines few relevance signals and rarely rank for ' +
        'competitive queries. Richer, useful content improves topical relevance and dwell time.',
      affectedUrls: urls,
      evidence: { pages: thin, wordCountThreshold: recoConfig.thinContentWordCount },
      suggestedFix:
        'Add substantive, genuinely useful copy (usage, sourcing, brewing, FAQs) to each page — original, not padding.',
      estimatedEffort: 'large',
      signals: {},
      relatedCheckIds: [], // snapshot-derived (word count), not from a specific audit check
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Missing schema → per gap
// ─────────────────────────────────────────────────────────────────────────────
export function recommendMissingSchema(ctx: RecoContext): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  const indexable = ctx.observations.filter((o) => isIndexableHtml(o, ctx.baseUrl));
  const has = (o: PageObservation, ...types: string[]) =>
    o.structuredDataTypes.some((t) => types.map((x) => x.toLowerCase()).includes(t.toLowerCase()));
  const byType = (kind: 'homepage' | 'product' | 'category' | 'blog' | 'faq') =>
    indexable.filter((o) => {
      const p = path(selfUrl(o, ctx.baseUrl), ctx.baseUrl);
      if (kind === 'homepage') return p === '/';
      if (kind === 'product') return p.startsWith('/product/');
      if (kind === 'category') return p.startsWith('/catalog/');
      if (kind === 'blog') return /^\/blog\/[^/]+\/?$/.test(p);
      if (kind === 'faq') return p === '/page/faq/';
      return false;
    });

  const push = (
    id: string,
    title: string,
    why: string,
    fix: string,
    pages: PageObservation[],
    bonus = 0,
  ) => {
    if (!pages.length) return;
    out.push({
      recommendationId: id,
      category: 'schema',
      title,
      why,
      affectedUrls: pages.map((o) => selfUrl(o, ctx.baseUrl)).sort(),
      evidence: { pages: pages.map((o) => ({ url: selfUrl(o, ctx.baseUrl), schemaTypes: o.structuredDataTypes })) },
      suggestedFix: fix,
      estimatedEffort: 'medium',
      signals: { bonus },
      relatedCheckIds: [],
    });
  };

  push(
    'add-organization-schema',
    'Add Organization structured data to the homepage',
    'Organization schema (name, logo, sameAs) helps Google build a Knowledge Panel and brand entity.',
    'Add an Organization JSON-LD block (name, url, logo, social profiles) to the homepage.',
    byType('homepage').filter((o) => !has(o, 'Organization')),
    30,
  );
  push(
    'add-breadcrumb-schema',
    'Add BreadcrumbList structured data to product & category pages',
    'BreadcrumbList schema produces breadcrumb rich results and clarifies site hierarchy to crawlers.',
    'Emit BreadcrumbList JSON-LD reflecting the Home → Category → Product path.',
    [...byType('product'), ...byType('category')].filter((o) => !has(o, 'BreadcrumbList')),
  );
  push(
    'add-article-schema',
    'Add Article/BlogPosting structured data to blog posts',
    'Article schema (headline, author, datePublished, image) makes posts eligible for richer results.',
    'Add Article/BlogPosting JSON-LD to each blog post.',
    byType('blog').filter((o) => !has(o, 'Article', 'BlogPosting', 'NewsArticle')),
  );
  push(
    'add-faq-schema',
    'Add FAQPage structured data to the FAQ page',
    'FAQPage schema can surface expandable Q&A directly in search results, increasing SERP real estate.',
    'Mark up the FAQ Q&A pairs with FAQPage JSON-LD.',
    byType('faq').filter((o) => !has(o, 'FAQPage')),
  );
  push(
    'product-schema-completeness',
    'Complete Product structured data on product pages',
    'Product schema with offers, price, availability and aggregateRating unlocks price/review rich results.',
    'Ensure each product emits Product JSON-LD with offers (price, availability) and, where available, aggregateRating.',
    byType('product').filter((o) => !has(o, 'Product')),
    20,
  );

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Indexability → one recommendation per page with MULTIPLE indexing risks
// ─────────────────────────────────────────────────────────────────────────────
const INDEXABILITY_CHECKS = new Set([
  'canonical-missing',
  'canonical-not-self',
  'canonical-target-redirect',
  'noindex-on-indexable',
  'sitemap-canonical-mismatch',
  'sitemap-url-non-200',
  'redirect-in-sitemap',
  'important-url-missing-from-sitemap',
  'orphan-page',
  'broken-url',
  'robots-txt-unreachable',
]);

export function recommendIndexability(ctx: RecoContext): RecommendationDraft[] {
  const byUrl = new Map<string, DetectedIssue[]>();
  for (const i of ctx.detected) {
    if (!INDEXABILITY_CHECKS.has(i.checkId)) continue;
    (byUrl.get(i.normalizedUrl) || byUrl.set(i.normalizedUrl, []).get(i.normalizedUrl)!).push(i);
  }
  const out: RecommendationDraft[] = [];
  for (const [url, issues] of byUrl) {
    if (issues.length < 2) continue; // only when a page has MULTIPLE indexing risks
    const checks = issues.map((i) => i.checkId);
    out.push({
      recommendationId: 'indexability',
      discriminator: url,
      category: 'indexability',
      title: `Resolve ${issues.length} indexing risks on one page`,
      why:
        'This page trips several indexing signals at once (canonical / sitemap / robots / orphan). Combined, ' +
        'they can keep it out of the index or split its ranking signals.',
      affectedUrls: [url],
      evidence: { checks, issues: issues.map((i) => ({ checkId: i.checkId, actual: i.evidence.actual, expected: i.evidence.expected })) },
      suggestedFix:
        'Align the page’s canonical, sitemap presence, robots directives and internal links so they all point ' +
        'the same, indexable way.',
      estimatedEffort: 'medium',
      signals: { isIndexability: true },
      relatedCheckIds: checks,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Topical authority (starter) → inventory-only content-gap detection
// ─────────────────────────────────────────────────────────────────────────────
export function recommendTopicalAuthority(ctx: RecoContext): RecommendationDraft[] {
  const indexable = ctx.observations.filter((o) => isIndexableHtml(o, ctx.baseUrl));
  const productText = (o: PageObservation) => `${o.title ?? ''} ${path(selfUrl(o, ctx.baseUrl), ctx.baseUrl)}`.toLowerCase();
  const products = indexable.filter((o) => path(selfUrl(o, ctx.baseUrl), ctx.baseUrl).startsWith('/product/'));
  const categories = indexable.filter((o) => path(selfUrl(o, ctx.baseUrl), ctx.baseUrl).startsWith('/catalog/'));
  const blogs = indexable.filter((o) => /^\/blog\/[^/]+\/?$/.test(path(selfUrl(o, ctx.baseUrl), ctx.baseUrl)));

  const out: RecommendationDraft[] = [];
  for (const entity of recoConfig.topicalEntities) {
    const needle = entity.toLowerCase();
    // Does the store SELL this? (mentioned in a product or category)
    const sells =
      products.some((o) => productText(o).includes(needle)) ||
      categories.some((o) => productText(o).includes(needle));
    if (!sells) continue;
    // How many blog articles cover it?
    const articleCount = blogs.filter((o) => `${o.title ?? ''} ${path(selfUrl(o, ctx.baseUrl), ctx.baseUrl)}`.toLowerCase().includes(needle)).length;
    if (articleCount > 1) continue; // adequately covered

    const relatedProducts = products.filter((o) => productText(o).includes(needle)).map((o) => selfUrl(o, ctx.baseUrl));
    out.push({
      recommendationId: 'topical-authority-gap',
      discriminator: entity.toLowerCase().replace(/\s+/g, '-'),
      category: 'topical-authority',
      title:
        articleCount === 0
          ? `No educational content exists for ${entity} tea`
          : `Only one article exists for ${entity} tea`,
      why:
        `The store sells ${entity} products but has ${articleCount === 0 ? 'no' : 'only one'} supporting ` +
        'article. Educational/buying-guide content builds topical authority and captures top-of-funnel search demand.',
      affectedUrls: relatedProducts,
      evidence: { entity, articleCount, relatedProducts },
      suggestedFix:
        `Publish an educational article or buying guide about ${entity} tea (origin, flavour, brewing, how to choose) ` +
        'and link it to the relevant products/category.',
      estimatedEffort: 'large',
      signals: { bonus: 10 },
      relatedCheckIds: [],
    });
  }
  return out;
}

/** Run every generator and return the combined drafts. */
export function generateDrafts(ctx: RecoContext): RecommendationDraft[] {
  return [
    ...recommendDuplicateMetadata(ctx),
    ...recommendInternalLinking(ctx),
    ...recommendThinContent(ctx),
    ...recommendMissingSchema(ctx),
    ...recommendIndexability(ctx),
    ...recommendTopicalAuthority(ctx),
  ];
}
