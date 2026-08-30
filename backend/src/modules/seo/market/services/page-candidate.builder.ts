import { Product } from '../../../catalog/models/product.model';
import { Category } from '../../../catalog/models/category.model';
import { Page } from '../../../cms/models/page.model';
import { Blog } from '../../../cms/models/blog.model';
import { SeoIssue } from '../../models/seo-issue.model';
import { buildSeoContext } from '../../services/gsc.sync.service';
import { canonicalPageSlug } from '../../../cms/page-slug.util';
import { normalizeUrl } from '../../seo.util';
import { seoConfig } from '../../seo.config';
import { PageCandidate, PageHealth, PageType } from '../market.types';
import { RelevanceTaxonomy, anchorTermsOf } from '../relevance.taxonomy';
import { normalizeKeyword } from './keyword-normalize';
import { marketConfig } from '../market.config';

/**
 * The ONLY 4b.4 file (besides gsc-evidence-index.ts) that touches Mongo for
 * mapping candidates. `url-mapper.ts` and `cannibalization-guard.ts` stay pure,
 * receiving `PageCandidate[]` built here.
 *
 * Collections are DELIBERATELY excluded (confirmed: `CollectionsPageComponent`'s
 * route is commented out in app.routes.ts — no live public/indexable Collection
 * page exists). A collection-anchored cluster with no matching page becomes
 * D_NEW_LANDING, never a mapping to a non-existent URL. `inventory.service.ts`
 * / `buildInventory()` is not touched or called — this builder runs its own
 * read-only queries because it needs `name`/`title` (for anchors), which
 * `buildInventory()`'s flattened `{urls}` return shape cannot supply.
 *
 * `pageHealth` is derived ONCE here (not re-derived by the pure mapper) so the
 * mapper never reinterprets raw audit state.
 */

interface RawSource {
  slug: string;
  name: string | null;
  path: string;
  pageType: PageType;
}

async function loadRawCandidates(): Promise<RawSource[]> {
  const [products, categories, blogs, pages] = await Promise.all([
    Product.find({ status: 'active' }).select('slug name').lean().exec(),
    Category.find({ isActive: true }).select('slug name').lean().exec(),
    Blog.find({ status: 'published' }).select('slug title').lean().exec(),
    Page.find({ status: 'published' }).select('slug title').lean().exec(),
  ]);

  const out: RawSource[] = [];
  for (const p of products) if (p.slug) out.push({ slug: p.slug, name: p.name ?? null, path: `/product/${p.slug}/`, pageType: 'product' });
  for (const c of categories) if (c.slug) out.push({ slug: c.slug, name: c.name ?? null, path: `/catalog/${c.slug}/`, pageType: 'category' });
  for (const b of blogs) if (b.slug) out.push({ slug: b.slug, name: b.title ?? null, path: `/blog/${b.slug}/`, pageType: 'blog' });

  // Same legacy-slug dedup discipline as inventory.service.ts's buildInventory()
  // (that loop isn't exported, so it's re-expressed here — a ~5-line filter, not
  // a duplication of business logic).
  const emittedPageSlugs = new Set<string>();
  for (const p of pages) {
    if (!p.slug) continue;
    const slug = canonicalPageSlug(p.slug);
    if (emittedPageSlugs.has(slug)) continue;
    emittedPageSlugs.add(slug);
    out.push({ slug, name: p.title ?? null, path: `/page/${slug}/`, pageType: 'static' });
  }

  out.push({ slug: '', name: null, path: '/', pageType: 'home' });
  return out;
}

function derivePageHealth(
  facts: { inSnapshot: boolean; title: string | null; wordCount: number } | undefined,
  openCriticalIssueCount: number,
): { pageHealth: PageHealth; reasons: string[] } {
  if (!facts || !facts.inSnapshot) {
    return { pageHealth: 'UNKNOWN', reasons: ['no snapshot found for this URL in the latest audit run'] };
  }
  const reasons: string[] = [];
  const wordCountOk = facts.wordCount >= marketConfig.mapping.minHealthyWordCount;
  reasons.push(wordCountOk ? `wordCount ${facts.wordCount} >= ${marketConfig.mapping.minHealthyWordCount}` : `wordCount ${facts.wordCount} < ${marketConfig.mapping.minHealthyWordCount}`);
  if (openCriticalIssueCount > 0) reasons.push(`${openCriticalIssueCount} open critical issue(s)`);
  else reasons.push('no open critical issue');
  const pageHealth: PageHealth = wordCountOk && openCriticalIssueCount === 0 ? 'GOOD' : 'NEEDS_OPT';
  return { pageHealth, reasons };
}

/**
 * Build all mapping candidates. `taxonomy` MUST be the SAME enriched instance
 * (via `buildRelevanceModel()`) used for cluster/member anchor extraction and
 * `scoreBusinessRelevance()` elsewhere in the run — passed in, never defaulted
 * here, so every 4b.4 component provably agrees on what a "specific anchor" is.
 */
export async function buildPageCandidates(taxonomy: RelevanceTaxonomy): Promise<PageCandidate[]> {
  const raw = await loadRawCandidates();
  const { canonicalSet, facts } = await buildSeoContext();

  const urls = raw.map((r) => normalizeUrl(`${seoConfig.baseUrl}${r.path}`));
  const criticalIssueCounts = new Map<string, number>();
  if (urls.length) {
    const issues = await SeoIssue.find({ status: 'open', severity: 'critical', normalizedUrl: { $in: urls } })
      .select('normalizedUrl')
      .lean()
      .exec();
    for (const i of issues) criticalIssueCounts.set(i.normalizedUrl, (criticalIssueCounts.get(i.normalizedUrl) ?? 0) + 1);
  }

  return raw.map((r, i) => {
    const url = urls[i];
    const canonicalUrl = canonicalSet.has(url) ? url : url; // no alternate-form resolution needed here — this URL IS the canonical form we just built
    const indexable = canonicalSet.has(url);
    const nameForText = r.name ?? r.slug;
    const anchors = [...anchorTermsOf(nameForText, taxonomy)].sort();
    const normalizedTerms = [...new Set(normalizeKeyword(nameForText).split(/\s+/).filter(Boolean))].sort();
    const { pageHealth, reasons } = derivePageHealth(facts.get(url), criticalIssueCounts.get(url) ?? 0);

    const candidate: PageCandidate = {
      url,
      canonicalUrl,
      pageType: r.pageType,
      title: r.name,
      slug: r.slug,
      indexable,
      anchors,
      normalizedTerms,
      pageHealth,
      healthReasons: reasons,
      qualityFacts: {
        wordCount: facts.get(url)?.wordCount ?? null,
        hasSnapshot: !!facts.get(url)?.inSnapshot,
        openCriticalIssueCount: criticalIssueCounts.get(url) ?? 0,
      },
    };
    return candidate;
  });
}
