import { seoConfig } from '../seo.config';
import { AuditContext, DetectedIssue } from '../seo.types';
import { normalizeUrl } from '../seo.util';
import { makeIssue } from './rules';

/**
 * Cross-page / sitemap-level checks. These need the whole run's context (the
 * sitemap set + every page observation), so they run once after all pages are
 * fetched — unlike the per-page rules.
 */
export function runSitemapRules(ctx: AuditContext): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // robots.txt reachability (site-level).
  if (!ctx.robotsAccessible) {
    const url = `${ctx.baseUrl}/robots.txt`;
    issues.push(
      makeIssue('robots-txt-unreachable', { url, normalizedUrl: normalizeUrl(url) }, 'robots.txt did not return 200.', {
        actual: 'unreachable',
        expected: '200 OK',
      }),
    );
  }

  // Per sitemap URL: it must return 200 directly and canonicalize to itself.
  for (const smUrl of ctx.sitemapUrls) {
    const page = ctx.pagesByNormalizedUrl.get(smUrl);
    const pseudo = { url: smUrl, normalizedUrl: smUrl };
    if (!page || !page.fetched) continue; // not fetched (coverage guard handles this)

    const redirects = page.redirectChain.length > 0 || (page.finalStatus !== null && page.finalStatus >= 300 && page.finalStatus < 400);
    if (redirects) {
      issues.push(
        makeIssue('redirect-in-sitemap', pseudo, 'Sitemap lists a URL that redirects instead of the destination.', {
          httpStatus: page.redirectChain[0]?.status ?? page.finalStatus ?? undefined,
          redirectChain: page.redirectChain,
          finalUrl: page.finalUrl ?? undefined,
          actual: page.finalUrl,
          expected: smUrl,
          sitemapStatus: 'present-but-redirects',
        }),
      );
      continue;
    }

    if (page.finalStatus !== 200) {
      issues.push(
        makeIssue('sitemap-url-non-200', pseudo, `Sitemap lists a URL returning HTTP ${page.finalStatus}.`, {
          httpStatus: page.finalStatus ?? undefined,
          actual: page.finalStatus,
          expected: 200,
          sitemapStatus: 'present-non-200',
        }),
      );
      continue;
    }

    // 200 in sitemap but canonicalizes elsewhere → inconsistent signal to Google.
    if (page.canonical && page.canonical !== smUrl) {
      issues.push(
        makeIssue('sitemap-canonical-mismatch', pseudo, 'Sitemap URL declares a different canonical.', {
          httpStatus: 200,
          actual: page.canonical,
          expected: smUrl,
          sitemapStatus: 'present',
        }),
      );
    }
  }

  // Important static pages must be present in the sitemap.
  for (const path of seoConfig.importantStaticPaths) {
    const norm = normalizeUrl(`${ctx.baseUrl}${path}`);
    if (!ctx.sitemapUrls.has(norm)) {
      issues.push(
        makeIssue('important-url-missing-from-sitemap', { url: norm, normalizedUrl: norm }, 'Important page is not listed in the sitemap.', {
          actual: 'absent',
          expected: 'present in sitemap.xml',
          sitemapStatus: 'absent',
        }),
      );
    }
  }

  return issues;
}
