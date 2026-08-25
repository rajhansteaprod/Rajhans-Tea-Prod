import { seoConfig } from '../seo.config';
import { AuditContext, DetectedIssue, PageObservation, Severity } from '../seo.types';
import { fingerprint, normalizeUrl } from '../seo.util';

/**
 * Machine-readable registry of every check. The future recommendation/auto-fix
 * layers read `automationLevel` (all 'observe' in Phase 2a) and the metadata to
 * decide what may be proposed or applied. Adding a rule = add an entry here.
 */
export type CheckCategory = 'page' | 'cross-page';

export const RULE_REGISTRY: Record<
  string,
  { severity: Severity; automationLevel: 'observe'; category: CheckCategory; description: string }
> = {
  'missing-title': { severity: 'warning', automationLevel: 'observe', category: 'page', description: 'Indexable page has no <title>.' },
  'missing-meta-description': { severity: 'warning', automationLevel: 'observe', category: 'page', description: 'Indexable page has no meta description.' },
  'meta-description-length': { severity: 'info', automationLevel: 'observe', category: 'page', description: 'Meta description is outside the recommended length.' },
  'missing-h1': { severity: 'warning', automationLevel: 'observe', category: 'page', description: 'Indexable page has no H1.' },
  'multiple-h1': { severity: 'info', automationLevel: 'observe', category: 'page', description: 'Page has more than one H1.' },
  'canonical-missing': { severity: 'critical', automationLevel: 'observe', category: 'page', description: 'Indexable page has no canonical link.' },
  'canonical-not-self': { severity: 'warning', automationLevel: 'observe', category: 'page', description: 'Canonical does not point to the page itself.' },
  'canonical-target-redirect': { severity: 'critical', automationLevel: 'observe', category: 'page', description: 'Canonical points to a URL that redirects.' },
  'noindex-on-indexable': { severity: 'critical', automationLevel: 'observe', category: 'page', description: 'A sitemap/important URL is marked noindex.' },
  'redirect-chain-long': { severity: 'warning', automationLevel: 'observe', category: 'page', description: 'URL resolves through multiple redirect hops.' },
  'broken-url': { severity: 'critical', automationLevel: 'observe', category: 'page', description: 'A known/important URL returns a 4xx status.' },
  'images-missing-alt': { severity: 'info', automationLevel: 'observe', category: 'page', description: 'Page has images without alt text.' },
  // Sitemap-level checks (emitted by the analyzer)
  'redirect-in-sitemap': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'Sitemap lists a URL that redirects.' },
  'sitemap-url-non-200': { severity: 'critical', automationLevel: 'observe', category: 'cross-page', description: 'Sitemap lists a URL that does not return 200.' },
  'sitemap-canonical-mismatch': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'Sitemap URL canonicalizes to a different URL.' },
  'important-url-missing-from-sitemap': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'An important page is absent from the sitemap.' },
  'robots-txt-unreachable': { severity: 'critical', automationLevel: 'observe', category: 'cross-page', description: 'robots.txt is not reachable.' },
  // ── Phase 2b: cross-page / site-wide relationship checks ──
  'duplicate-title': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'Multiple indexable URLs share the same <title>.' },
  'duplicate-description': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'Multiple indexable URLs share the same meta description.' },
  'broken-internal-link': { severity: 'critical', automationLevel: 'observe', category: 'cross-page', description: 'An internal link points to a URL that returns a 4xx/410.' },
  'internal-link-to-redirect': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'An internal link points to a URL that redirects instead of the canonical destination.' },
  'orphan-page': { severity: 'warning', automationLevel: 'observe', category: 'cross-page', description: 'An indexable page has zero internal inbound links from other pages.' },
  'generic-image-alt': { severity: 'info', automationLevel: 'observe', category: 'cross-page', description: 'Image alt text is present but non-descriptive/generic.' },
};

/**
 * Build a DetectedIssue with a stable fingerprint from the registry metadata.
 * `discriminator` distinguishes multiple findings of the same check on one page
 * (e.g. one broken-internal-link per target); it defaults to '' so every existing
 * page-level check keeps its exact prior fingerprint (no migration).
 */
export function makeIssue(
  checkId: string,
  page: { url: string; normalizedUrl: string },
  explanation: string,
  evidence: DetectedIssue['evidence'],
  discriminator = '',
): DetectedIssue {
  const meta = RULE_REGISTRY[checkId];
  return {
    checkId,
    severity: meta.severity,
    url: page.url,
    normalizedUrl: page.normalizedUrl,
    explanation,
    evidence,
    automationLevel: meta.automationLevel,
    discriminator,
  };
}

const isRenderable = (p: PageObservation) => p.fetched && p.finalStatus === 200 && p.contentHash !== null;
const isNoindex = (p: PageObservation) => !!p.robotsMeta && /noindex/.test(p.robotsMeta);

/**
 * Page-level rules. Each returns zero or more issues for a single observation.
 * Content rules only run on indexable 200 HTML pages to avoid false positives on
 * redirects/errors. (Thin-content is intentionally deferred to the Phase 2c
 * render layer — prerendered list/home pages legitimately have little static
 * text, so flagging it now would be a false positive.)
 */
export function runPageRules(p: PageObservation, ctx: AuditContext): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const self = p.finalUrl ? normalizeUrl(p.finalUrl, ctx.baseUrl) : p.normalizedUrl;
  const base = { httpStatus: p.finalStatus ?? undefined, finalUrl: p.finalUrl ?? undefined, redirectChain: p.redirectChain };

  // Broken known/important URL (4xx on something we expected to exist).
  if (p.fetched && p.finalStatus && p.finalStatus >= 400 && p.finalStatus < 500) {
    issues.push(
      makeIssue('broken-url', p, `URL returns HTTP ${p.finalStatus}.`, {
        ...base,
        actual: p.finalStatus,
        expected: 200,
        sitemapStatus: p.inSitemap ? 'present-non-200' : 'absent',
      }),
    );
    return issues; // no point running content rules on a 4xx
  }

  if (!isRenderable(p)) return issues; // redirects / non-HTML / transient → handled elsewhere

  // noindex on something that should be indexable (in sitemap or important).
  if (isNoindex(p) && p.inSitemap) {
    issues.push(
      makeIssue('noindex-on-indexable', p, 'Page is in the sitemap but marked noindex.', {
        ...base,
        actual: p.robotsMeta,
        expected: 'index (or remove from sitemap)',
        sitemapStatus: 'present',
      }),
    );
  }

  // Title
  if (!p.title) {
    issues.push(makeIssue('missing-title', p, 'No <title> element found.', { ...base, actual: null, expected: 'a unique title' }));
  }

  // Meta description
  if (!p.metaDescription) {
    issues.push(makeIssue('missing-meta-description', p, 'No meta description found.', { ...base, actual: null, expected: 'a unique meta description' }));
  } else {
    const len = p.metaDescription.length;
    if (len < seoConfig.descriptionMinLength || len > seoConfig.descriptionMaxLength) {
      issues.push(
        makeIssue('meta-description-length', p, `Meta description length ${len} is outside ${seoConfig.descriptionMinLength}-${seoConfig.descriptionMaxLength}.`, {
          ...base,
          actual: len,
          expected: `${seoConfig.descriptionMinLength}-${seoConfig.descriptionMaxLength} chars`,
        }),
      );
    }
  }

  // H1
  if (p.h1.length === 0) {
    issues.push(makeIssue('missing-h1', p, 'No H1 element found.', { ...base, actual: 0, expected: 1 }));
  } else if (p.h1.length > 1) {
    issues.push(makeIssue('multiple-h1', p, `Found ${p.h1.length} H1 elements.`, { ...base, actual: p.h1.length, expected: 1, extra: { h1: p.h1 } }));
  }

  // Canonical
  if (!p.canonical) {
    issues.push(
      makeIssue('canonical-missing', p, 'Indexable page has no <link rel="canonical">.', {
        ...base,
        actual: null,
        expected: self,
        sitemapStatus: p.inSitemap ? 'present' : 'absent',
      }),
    );
  } else {
    if (p.canonical !== self) {
      issues.push(
        makeIssue('canonical-not-self', p, 'Canonical points to a different URL than the page itself.', {
          ...base,
          actual: p.canonical,
          expected: self,
          sitemapStatus: p.inSitemap ? 'present' : 'absent',
        }),
      );
    }
    // Canonical target redirects (only when we observed that target in this run).
    const target = ctx.pagesByNormalizedUrl.get(p.canonical);
    if (target && (target.redirectChain.length > 0 || (target.finalStatus && target.finalStatus >= 300 && target.finalStatus < 400))) {
      issues.push(
        makeIssue('canonical-target-redirect', p, 'Canonical URL itself redirects.', {
          ...base,
          actual: p.canonical,
          expected: 'a canonical that returns 200 directly',
          extra: { canonicalRedirectChain: target.redirectChain },
        }),
      );
    }
  }

  // Redirect chain length (for pages that did resolve to 200 via hops).
  if (p.redirectChain.length > seoConfig.redirectChainWarnThreshold) {
    issues.push(
      makeIssue('redirect-chain-long', p, `Resolves through ${p.redirectChain.length} redirects.`, {
        ...base,
        actual: p.redirectChain.length,
        expected: `<= ${seoConfig.redirectChainWarnThreshold}`,
      }),
    );
  }

  // Image ALT coverage (info).
  if (p.imagesMissingAlt > 0) {
    issues.push(
      makeIssue('images-missing-alt', p, `${p.imagesMissingAlt} of ${p.imagesTotal} images lack alt text.`, {
        ...base,
        actual: p.imagesMissingAlt,
        expected: 0,
        extra: { imagesTotal: p.imagesTotal },
      }),
    );
  }

  return issues;
}

// re-export for the analyzer
export { fingerprint };
