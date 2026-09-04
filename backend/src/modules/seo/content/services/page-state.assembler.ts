import mongoose from 'mongoose';
import { SeoAuditRun } from '../../models/seo-audit-run.model';
import { SeoPageSnapshot } from '../../models/seo-page-snapshot.model';
import { SeoIssue } from '../../models/seo-issue.model';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { Product } from '../../../catalog/models/product.model';
import { Category } from '../../../catalog/models/category.model';
import { Page } from '../../../cms/models/page.model';
import { Blog } from '../../../cms/models/blog.model';
import { seoConfig } from '../../seo.config';
import { LinkResolution, PageObservation } from '../../seo.types';
import { buildInboundCounts } from '../../services/crosspage.service';
import { isNoindexSystemPath } from '../../services/gsc.join';
import {
  EXECUTION_CAPABILITY,
  resolveCmsPageTarget,
} from '../../services/change-execution-preflight.service';
import { buildPageCandidates } from '../../market/services/page-candidate.builder';
import { buildRelevanceModel, RelevanceTaxonomy } from '../../market/relevance.taxonomy';
import { loadInventoryEntities } from '../../market/services/seed.engine';
import { PageType } from '../../market/market.types';
import { contentConfig } from '../content.config';
import { EligiblePage, PageContentState, PageExecutability, PageExistingWork } from '../content.types';

/**
 * Phase 6.1 — first-party page state, assembled from STORED audit evidence.
 *
 * READ-ONLY, and structurally so: this module imports no fetcher and opens no
 * socket. Page state comes from the latest completed audit's SeoPageSnapshot
 * documents, never from a live re-fetch, because an analysis that re-crawls is
 * not reproducible, not comparable across runs, and not a stable baseline for
 * Phase 8 measurement.
 *
 * One bounded read per collection for a whole batch — never one query per page.
 */

/** Page types Phase 6.1 analyses. Everything else is out of scope by construction. */
const ANALYSABLE_PAGE_TYPES: PageType[] = ['product', 'category', 'blog', 'static', 'home'];

const SOURCE_MODEL_BY_PAGE_TYPE: Record<PageType, string> = {
  product: 'Product',
  category: 'Category',
  blog: 'Blog',
  static: 'Page',
  home: 'Home',
};

export interface AuditRunContext {
  runId: mongoose.Types.ObjectId | null;
  runAt: Date | null;
  status: string | null;
  /** True when the newest completed run is older than contentConfig.maxAuditRunAgeDays. */
  stale: boolean;
  ageDays: number | null;
}

export interface PageStateBundle {
  taxonomy: RelevanceTaxonomy;
  auditRun: AuditRunContext;
  pages: EligiblePage[];
  /** Assembled state per normalized URL. Absent ⇒ no snapshot for that page. */
  stateByUrl: Map<string, PageContentState>;
  /** The snapshot's contentHash, for evidence-window provenance. */
  contentHashByUrl: Map<string, string | null>;
  existingWorkByUrl: Map<string, PageExistingWork>;
  executabilityByUrl: Map<string, PageExecutability>;
  /** Normalized text per page, kept OUT of the persisted artifact (bounded but
   *  still large); the detectors consume it in memory only. */
  normalizedTextByUrl: Map<string, string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The newest run we are willing to read page state from, and how stale it is. */
async function loadAuditRunContext(now: Date): Promise<AuditRunContext> {
  const run = await SeoAuditRun.findOne({ status: { $in: ['completed', 'degraded'] } })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  if (!run) return { runId: null, runAt: null, status: null, stale: false, ageDays: null };
  const runAt = run.finishedAt ?? run.createdAt;
  const ageDays = (now.getTime() - new Date(runAt).getTime()) / DAY_MS;
  return {
    runId: run._id as mongoose.Types.ObjectId,
    runAt: new Date(runAt),
    status: run.status,
    stale: ageDays > contentConfig.maxAuditRunAgeDays,
    ageDays: Math.round(ageDays * 10) / 10,
  };
}

/**
 * Executability, DERIVED from what Phase 5 can actually do rather than assumed
 * from the page type. `resolveCmsPageTarget` is the executor's own resolution
 * routine and `EXECUTION_CAPABILITY` its own published capability, so this
 * answer cannot drift from the executor's real behaviour — widening execution
 * in Phase 6.4 updates both at once.
 */
export async function deriveExecutability(normalizedUrl: string, pageType: PageType): Promise<PageExecutability> {
  const target = await resolveCmsPageTarget(normalizedUrl);
  if (target.ok) {
    return {
      status: 'executable',
      reason: `Phase 5 resolves a published ${EXECUTION_CAPABILITY.targetType} for this URL and can write ${EXECUTION_CAPABILITY.fields.join(' / ')}.`,
      supportedFields: [...EXECUTION_CAPABILITY.fields],
      targetType: EXECUTION_CAPABILITY.targetType,
    };
  }
  // 'not_found' means the URL HAS the executable shape but no live published
  // target sits behind it — a real fault, distinct from a page type that no
  // executor covers at all.
  if (target.reason === 'not_found') {
    return {
      status: 'unsupported',
      reason: `This URL has the executable ${EXECUTION_CAPABILITY.targetType} shape, but no published CMS page resolves behind it.`,
      supportedFields: [],
      targetType: null,
    };
  }
  return {
    status: 'recommendation_only',
    reason:
      `No Phase 5 executor supports a ${pageType} page: execution currently covers ` +
      `${EXECUTION_CAPABILITY.changeKind} changes on ${EXECUTION_CAPABILITY.targetType} targets only. ` +
      'The finding is still real — applying it needs a human, and for product/category metadata a code change.',
    supportedFields: [],
    targetType: null,
  };
}

/** slug → document _id, per model, so an analysis can point back at its source row. */
async function loadSourceDocumentIds(): Promise<Map<string, mongoose.Types.ObjectId>> {
  const [products, categories, blogs, pages] = await Promise.all([
    Product.find({ status: 'active' }).select('slug').lean().exec(),
    Category.find({ isActive: true }).select('slug').lean().exec(),
    Blog.find({ status: 'published' }).select('slug').lean().exec(),
    Page.find({ status: 'published' }).select('slug').lean().exec(),
  ]);
  const out = new Map<string, mongoose.Types.ObjectId>();
  for (const p of products) if (p.slug) out.set(`product:${p.slug}`, p._id as mongoose.Types.ObjectId);
  for (const c of categories) if (c.slug) out.set(`category:${c.slug}`, c._id as mongoose.Types.ObjectId);
  for (const b of blogs) if (b.slug) out.set(`blog:${b.slug}`, b._id as mongoose.Types.ObjectId);
  for (const p of pages) if (p.slug) out.set(`static:${p.slug}`, p._id as mongoose.Types.ObjectId);
  return out;
}

/**
 * Inbound internal-link counts from stored snapshots alone.
 *
 * Reuses `buildInboundCounts()` verbatim — including its self-link exclusion and
 * one-edge-per-source rule — by supplying the link resolutions it expects. Those
 * resolutions are derived with the EXISTING `resolveGscUrl()` against the run's
 * canonical set, which already folds host aliases, legacy CMS slugs, the site's
 * trailing-slash 301 policy and query variants. No URL is fetched to resolve a
 * link: every fold is justified by stored evidence.
 */
function buildInboundFromSnapshots(
  observations: PageObservation[],
  canonicalSet: Set<string>,
  resolveTarget: (target: string) => string | null,
): Map<string, number> {
  const resolutions = new Map<string, LinkResolution>();
  for (const o of observations) {
    for (const link of o.internalLinkDetails ?? []) {
      if (resolutions.has(link.target)) continue;
      const canonical = resolveTarget(link.target);
      resolutions.set(link.target, {
        target: link.target,
        finalUrl: canonical,
        finalNormalizedUrl: canonical ?? link.target,
        // Not fetched, and honestly reported as such: these fields exist to
        // satisfy the shared shape, not to assert an HTTP observation.
        finalStatus: null,
        redirectChain: [],
        redirects: false,
        transient: false,
        finalCanonicalUrl: null,
      });
    }
  }
  void canonicalSet;
  return buildInboundCounts(observations, resolutions, seoConfig.baseUrl);
}

/**
 * Load every analysable page plus its stored state. `only` narrows to specific
 * normalized URLs (the CLI's single-page mode) but never widens eligibility.
 */
export async function loadPageStates(opts: { only?: string[]; now?: Date } = {}): Promise<PageStateBundle> {
  const now = opts.now ?? new Date();
  const { resolveGscUrl } = await import('../../services/gsc.join');

  const inventory = await loadInventoryEntities();
  const taxonomy = buildRelevanceModel(inventory);
  const [auditRun, candidates, sourceIds] = await Promise.all([
    loadAuditRunContext(now),
    buildPageCandidates(taxonomy),
    loadSourceDocumentIds(),
  ]);

  const onlySet = opts.only?.length ? new Set(opts.only) : null;

  const pages: EligiblePage[] = candidates
    .filter((c) => !onlySet || onlySet.has(c.canonicalUrl))
    .map((c) => {
      let ineligibleReason: string | null = null;
      if (!ANALYSABLE_PAGE_TYPES.includes(c.pageType)) {
        ineligibleReason = `page type "${c.pageType}" is outside Phase 6.1 scope`;
      } else if (isNoindexSystemPath(c.canonicalUrl)) {
        // Defence in depth: reuses the audit's own system/per-user route list.
        ineligibleReason = 'system / per-user route — never an SEO target';
      } else if (!c.indexable) {
        ineligibleReason = 'not an indexable, self-canonical 200 page in the latest audit run';
      }
      return {
        normalizedUrl: c.canonicalUrl,
        canonicalUrl: c.canonicalUrl,
        pageType: c.pageType,
        slug: c.slug,
        title: c.title,
        sourceModel: SOURCE_MODEL_BY_PAGE_TYPE[c.pageType],
        documentId: sourceIds.get(`${c.pageType}:${c.slug}`)?.toString() ?? null,
        eligible: ineligibleReason === null,
        ineligibleReason,
      };
    });

  const stateByUrl = new Map<string, PageContentState>();
  const contentHashByUrl = new Map<string, string | null>();
  const normalizedTextByUrl = new Map<string, string>();
  const existingWorkByUrl = new Map<string, PageExistingWork>();
  const executabilityByUrl = new Map<string, PageExecutability>();

  const eligible = pages.filter((p) => p.eligible);
  if (!auditRun.runId || eligible.length === 0) {
    return { taxonomy, auditRun, pages, stateByUrl, contentHashByUrl, existingWorkByUrl, executabilityByUrl, normalizedTextByUrl };
  }

  // ── ONE read for the whole run's snapshots. The inbound-link graph needs every
  // page's outbound links, not just the analysed subset, so this is deliberately
  // not narrowed to `eligible`. ──
  const snapshots = await SeoPageSnapshot.find({ runId: auditRun.runId }).lean().exec();
  const canonicalSet = new Set(
    snapshots
      .filter((s) => s.finalStatus === 200 && (!s.redirectChain || s.redirectChain.length === 0))
      .map((s) => s.normalizedUrl),
  );
  const resolveTarget = (target: string): string | null => {
    const r = resolveGscUrl(target, canonicalSet);
    return r.joined ? r.canonicalUrl : null;
  };
  const inbound = buildInboundFromSnapshots(snapshots as unknown as PageObservation[], canonicalSet, resolveTarget);

  const snapshotByUrl = new Map(snapshots.map((s) => [s.normalizedUrl, s]));
  const urls = eligible.map((p) => p.normalizedUrl);

  // ── ONE read each for open issues and open recommendations. ──
  const [issues, recs] = await Promise.all([
    SeoIssue.find({ status: 'open', normalizedUrl: { $in: urls } }).select('normalizedUrl checkId').lean().exec(),
    SeoRecommendation.find({ status: 'open', affectedUrls: { $in: urls } })
      .select('recommendationId source reviewStatus priority affectedUrls')
      .lean()
      .exec(),
  ]);
  for (const url of urls) existingWorkByUrl.set(url, { openIssueCheckIds: [], openRecommendations: [] });
  for (const i of issues) existingWorkByUrl.get(i.normalizedUrl)?.openIssueCheckIds.push(i.checkId);
  for (const r of recs) {
    for (const u of r.affectedUrls ?? []) {
      existingWorkByUrl.get(u)?.openRecommendations.push({
        recommendationId: r.recommendationId,
        source: r.source ?? 'audit',
        reviewStatus: r.reviewStatus ?? 'pending',
        priority: r.priority,
      });
    }
  }

  for (const page of eligible) {
    const snap = snapshotByUrl.get(page.normalizedUrl);
    executabilityByUrl.set(page.normalizedUrl, await deriveExecutability(page.normalizedUrl, page.pageType));
    if (!snap) continue;

    contentHashByUrl.set(page.normalizedUrl, snap.contentHash ?? null);
    normalizedTextByUrl.set(page.normalizedUrl, snap.normalizedText ?? '');

    const outboundTargets = Array.from(new Set((snap.internalLinks ?? []).filter((t) => t !== page.normalizedUrl)));
    stateByUrl.set(page.normalizedUrl, {
      title: snap.title ?? null,
      titleLength: snap.title === null || snap.title === undefined ? null : snap.title.trim().length,
      metaDescription: snap.metaDescription ?? null,
      metaDescriptionLength:
        snap.metaDescription === null || snap.metaDescription === undefined ? null : snap.metaDescription.trim().length,
      h1: snap.h1 ?? [],
      h2: snap.h2 ?? [],
      h3: snap.h3 ?? [],
      headingOutline: snap.headingOutline ?? [],
      wordCount: snap.wordCount ?? null,
      contentHash: snap.contentHash ?? null,
      normalizedTextChars: snap.normalizedTextChars ?? 0,
      normalizedTextTruncated: snap.normalizedTextTruncated ?? false,
      faqSignals: snap.faqSignals ?? null,
      canonical: snap.canonical ?? null,
      robotsMeta: snap.robotsMeta ?? null,
      indexable: true, // eligibility already required an indexable snapshot
      inSitemap: snap.inSitemap ?? false,
      structuredDataTypes: snap.structuredDataTypes ?? [],
      internalLinks: {
        outboundCount: outboundTargets.length,
        inboundCount: inbound.get(page.normalizedUrl) ?? 0,
        outboundTargets: outboundTargets.slice(0, contentConfig.limits.maxOutboundTargets),
      },
      // The authoritative "structure was captured" marker. A pre-6.1 snapshot
      // has a null extractorVersion and must degrade through missingEvidence
      // rather than be read as "this page has no headings".
      captureComplete: !!snap.extractorVersion,
      extractorVersion: snap.extractorVersion ?? null,
    });
  }

  return { taxonomy, auditRun, pages, stateByUrl, contentHashByUrl, existingWorkByUrl, executabilityByUrl, normalizedTextByUrl };
}
