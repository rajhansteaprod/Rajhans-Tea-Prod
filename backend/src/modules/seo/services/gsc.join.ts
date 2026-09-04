import { canonicalPageSlug } from '../../cms/page-slug.util';
import { normalizeUrl } from '../seo.util';
import { FetchedMetrics } from './gsc.sync.service';
import { IgnoredTally, PageDailyRow, PageWindowMetric, QueryPageMetric } from '../gsc.types';

/**
 * Evidence-based GSC-URL → canonical-page resolution/join layer.
 *
 * Google reports many URL forms for the same page (no trailing slash, www host,
 * legacy 301'd slugs, query variants). We attribute demand to the canonical page
 * ONLY via KNOWN canonical relationships — never by blindly stripping queries or
 * collapsing arbitrary paths. Non-indexable/obsolete URLs are classified
 * separately rather than reported as generic join failures.
 */

export type JoinClassification =
  | 'standalone-indexable' // exact match to a canonical indexable page
  | 'canonical-equivalent' // host-alias or trailing-slash form of a canonical page
  | 'legacy-redirect' // known legacy slug → its canonical survivor
  | 'query-variant' // query form whose base path is a canonical page
  | 'noindex-system' // auth/checkout/track-order/etc. — never an SEO target
  | 'obsolete-soft404' // /page/<unknown-slug> — not a real page
  | 'unknown'; // no known canonical relationship

export interface UrlResolution {
  originalUrl: string;
  originalNormalized: string;
  canonicalUrl: string | null; // the canonical page demand attaches to (null when not joined)
  joined: boolean;
  classification: JoinClassification;
  method: string; // how it resolved (evidence)
}

// Paths that are never SEO targets (noindex / system / per-user / soft routes).
const NOINDEX_PREFIXES = [
  '/auth', '/dashboard', '/admin', '/checkout', '/order-confirmation',
  '/orders', '/wishlist', '/track-order', '/error', '/404', '/cart',
];

/**
 * Whether a URL's path is a system/per-user route that is never an SEO target.
 * Exported so other phases REUSE this one exclusion list rather than restating
 * it: Phase 6.1 applies it as a defence-in-depth gate on the pages it will
 * analyse, so admin/auth/checkout/wishlist/account routes can never enter the
 * analysable set even if some future page-candidate source started emitting them.
 */
export function isNoindexSystemPath(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

const hasFileExtension = (path: string): boolean => /\.[a-z0-9]{1,8}$/i.test(path.split('/').pop() || '');
const stripWww = (host: string): string => host.replace(/^www\./i, '');

/**
 * Resolve one GSC URL to a canonical page in `canonicalSet` (the normalized,
 * trailing-slash apex URLs of the latest audit's indexable pages).
 */
export function resolveGscUrl(gscUrl: string, canonicalSet: Set<string>): UrlResolution {
  const originalNormalized = normalizeUrl(gscUrl);
  const base = (extra: Partial<UrlResolution>): UrlResolution => ({
    originalUrl: gscUrl, originalNormalized, canonicalUrl: null, joined: false, classification: 'unknown', method: '', ...extra,
  });

  // 1) Exact canonical match.
  if (canonicalSet.has(originalNormalized)) {
    return base({ canonicalUrl: originalNormalized, joined: true, classification: 'standalone-indexable', method: 'exact' });
  }

  let url: URL;
  try {
    url = new URL(originalNormalized);
  } catch {
    return base({ classification: 'unknown', method: 'unparseable' });
  }

  // 2) Host alias (www → apex), then re-check exact.
  const apexHost = stripWww(url.hostname);
  const hostAliased = apexHost !== url.hostname;
  if (hostAliased) url.hostname = apexHost;
  const apexNormalized = normalizeUrl(url.toString());
  if (canonicalSet.has(apexNormalized)) {
    return base({ canonicalUrl: apexNormalized, joined: true, classification: 'canonical-equivalent', method: hostAliased ? 'host-alias' : 'exact-apex' });
  }

  const path = url.pathname;
  const hasQuery = !!url.search;

  // 3) Non-indexable / system routes — classified separately (not a join failure).
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
    return base({ classification: 'noindex-system', method: 'noindex-prefix' });
  }

  // 4) Build the canonical page path: legacy-slug map for /page/<slug>, else
  //    trailing-slash canonicalization (the site's known 301 policy).
  const pageMatch = path.match(/^\/page\/([^/]+)\/?$/);
  let canonPath = path;
  let legacyApplied = false;
  if (pageMatch) {
    const slug = pageMatch[1];
    const canonSlug = canonicalPageSlug(slug);
    legacyApplied = canonSlug !== slug;
    canonPath = `/page/${canonSlug}/`;
  } else if (!path.endsWith('/') && !hasFileExtension(path)) {
    canonPath = path + '/';
  }
  const canonNormalized = normalizeUrl(`${url.protocol}//${url.hostname}${canonPath}`);

  if (canonicalSet.has(canonNormalized)) {
    if (hasQuery) {
      // 5) Query variant whose BASE PATH is a known canonical page → attribute
      //    to it (evidence: the base is a self-canonical indexable page). We never
      //    fold a query URL whose base is not a known page.
      return base({ canonicalUrl: canonNormalized, joined: true, classification: 'query-variant', method: 'query-variant→canonical-base' });
    }
    if (legacyApplied) {
      return base({ canonicalUrl: canonNormalized, joined: true, classification: 'legacy-redirect', method: 'legacy-slug-map' });
    }
    return base({ canonicalUrl: canonNormalized, joined: true, classification: 'canonical-equivalent', method: 'trailing-slash' });
  }

  // 6) A /page/<slug> that maps to no real page → soft-404 / obsolete route.
  if (pageMatch) {
    return base({ classification: 'obsolete-soft404', method: 'unknown-page-slug' });
  }
  // Everything else with no known relationship.
  return base({ classification: 'unknown', method: 'no-known-canonical' });
}

/** Impression-weighted merge of resolved page rows by canonical URL. */
function mergePages(rows: PageWindowMetric[], canonicalSet: Set<string>): { merged: PageWindowMetric[]; resolutions: UrlResolution[] } {
  const byUrl = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
  const resolutions: UrlResolution[] = [];
  for (const r of rows) {
    const res = resolveGscUrl(r.normalizedUrl, canonicalSet);
    resolutions.push(res);
    if (!res.joined || !res.canonicalUrl) continue;
    const a = byUrl.get(res.canonicalUrl) || { clicks: 0, impressions: 0, posWeighted: 0 };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.posWeighted += r.position * r.impressions;
    byUrl.set(res.canonicalUrl, a);
  }
  const merged = Array.from(byUrl.entries()).map(([normalizedUrl, a]) => ({
    normalizedUrl, clicks: a.clicks, impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0,
    position: a.impressions ? a.posWeighted / a.impressions : 0,
  }));
  return { merged, resolutions };
}

export interface ResolvedMetrics {
  metrics: FetchedMetrics; // queryPage/pageLatest/pagePrevious re-keyed to canonical URLs
  /** Original query×page rows annotated with their resolution (for the report). */
  queryPageResolutions: (QueryPageMetric & { resolution: UrlResolution })[];
  /** Distinct URL resolutions across all rows (join classification report). */
  urlResolutions: UrlResolution[];
  /** Distinct URLs dropped before persistence, by reason. */
  ignored: IgnoredTally;
}

/** Count distinct non-joined URLs by classification (persistence diagnostics). */
export function tallyIgnored(resolutions: UrlResolution[]): IgnoredTally {
  const t: IgnoredTally = { noindexSystem: 0, obsoleteSoft404: 0, unresolved: 0 };
  const seen = new Set<string>();
  for (const r of resolutions) {
    if (r.joined || seen.has(r.originalNormalized)) continue;
    seen.add(r.originalNormalized);
    if (r.classification === 'noindex-system') t.noindexSystem++;
    else if (r.classification === 'obsolete-soft404') t.obsoleteSoft404++;
    else t.unresolved++;
  }
  return t;
}

/**
 * Re-key fetched metrics onto canonical pages. Joined rows are merged onto the
 * canonical page (demand summed); non-joined rows (noindex-system / soft-404 /
 * unresolved) are DROPPED from the metrics — they must never be persisted as
 * canonical SEO facts — and counted in the `ignored` tally instead.
 */
export function resolveMetrics(raw: FetchedMetrics, canonicalSet: Set<string>): ResolvedMetrics {
  const queryPageResolutions = raw.queryPage.map((r) => ({ ...r, resolution: resolveGscUrl(r.page || r.normalizedUrl, canonicalSet) }));

  // Merge joined query×page rows by (query, canonical) so two source forms of one
  // page don't overwrite each other on upsert (they SUM).
  const qpMap = new Map<string, QueryPageMetric & { posW: number }>();
  for (const r of queryPageResolutions) {
    if (!r.resolution.joined || !r.resolution.canonicalUrl) continue;
    const canon = r.resolution.canonicalUrl;
    const key = `${r.query} ${canon}`;
    const a = qpMap.get(key) || { query: r.query, page: canon, normalizedUrl: canon, clicks: 0, impressions: 0, ctr: 0, position: 0, posW: 0 };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.posW += r.position * r.impressions;
    qpMap.set(key, a);
  }
  const queryPage: QueryPageMetric[] = Array.from(qpMap.values()).map((a) => ({
    query: a.query, page: a.page, normalizedUrl: a.normalizedUrl, clicks: a.clicks, impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.impressions ? a.posW / a.impressions : 0,
  }));

  const latest = mergePages(raw.pageLatest, canonicalSet);
  const previous = mergePages(raw.pagePrevious, canonicalSet);

  const seen = new Map<string, UrlResolution>();
  for (const r of [...queryPageResolutions.map((x) => x.resolution), ...latest.resolutions, ...previous.resolutions]) {
    if (!seen.has(r.originalNormalized)) seen.set(r.originalNormalized, r);
  }
  const urlResolutions = Array.from(seen.values());

  return {
    metrics: { ...raw, queryPage, pageLatest: latest.merged, pagePrevious: previous.merged },
    queryPageResolutions,
    urlResolutions,
    ignored: tallyIgnored(urlResolutions),
  };
}

/**
 * Resolve/merge per-day page rows onto canonical pages for GscPageDailyMetric.
 * Non-joined rows are dropped (never persisted). Merges same (date, canonical).
 */
export function resolvePageDaily(rows: PageDailyRow[], canonicalSet: Set<string>): { merged: PageDailyRow[]; resolutions: UrlResolution[] } {
  const byKey = new Map<string, PageDailyRow & { posW: number }>();
  const resolutions: UrlResolution[] = [];
  for (const d of rows) {
    const res = resolveGscUrl(d.page || d.normalizedUrl, canonicalSet);
    resolutions.push(res);
    if (!res.joined || !res.canonicalUrl) continue;
    const key = `${d.date} ${res.canonicalUrl}`;
    const a = byKey.get(key) || { date: d.date, page: res.canonicalUrl, normalizedUrl: res.canonicalUrl, clicks: 0, impressions: 0, ctr: 0, position: 0, posW: 0 };
    a.clicks += d.clicks;
    a.impressions += d.impressions;
    a.posW += d.position * d.impressions;
    byKey.set(key, a);
  }
  const merged = Array.from(byKey.values()).map((a) => ({
    date: a.date, page: a.page, normalizedUrl: a.normalizedUrl, clicks: a.clicks, impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.impressions ? a.posW / a.impressions : 0,
  }));
  return { merged, resolutions };
}
