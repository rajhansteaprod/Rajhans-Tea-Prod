import { AuditContext, DetectedIssue, FetchResultLike, LinkResolution, PageObservation } from '../seo.types';
import { normalizeUrl } from '../seo.util';
import { makeIssue } from './rules';

/**
 * Phase 2b — cross-page / site-wide checks.
 *
 * These need the WHOLE run's context (every page's title/description/links/images
 * + resolved link targets), so they run once after all pages are fetched, exactly
 * like the sitemap analyzer. Each finding is anchored on a FETCHED page (the
 * affected page, or the SOURCE of a bad link) so the existing coverage-gated
 * resolution logic in diff.service works unchanged: when the page is re-fetched
 * and the problem is gone, the issue resolves.
 *
 * Issue identity reuses the existing fingerprint(normalizedUrl, checkId,
 * discriminator) scheme — the discriminator carries the RELATIONSHIP (the target
 * URL for a bad link) so one source→target problem is one stable finding.
 *
 * Strictly OBSERVE-ONLY: pure detection, no mutation of anything.
 */

// ── Text normalization for duplicate detection ──
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Generic / non-descriptive image ALT detection ──
const GENERIC_ALT_WORDS = new Set([
  'image', 'img', 'photo', 'picture', 'pic', 'banner', 'logo', 'icon',
  'product', 'thumbnail', 'thumb', 'graphic', 'placeholder', 'untitled', 'default',
]);

/**
 * Returns a human reason when the alt looks generic, else null. Deliberately
 * conservative: only flags known filler words, numbered/camera patterns, and
 * filename-derived values — NOT merely short brand/product names.
 */
export function isGenericAlt(alt: string, src?: string | null): string | null {
  const a = alt.trim();
  if (!a) return null; // empty alt is images-missing-alt, not this check
  const lower = a.toLowerCase();

  if (GENERIC_ALT_WORDS.has(lower)) return `Alt is the generic word "${a}".`;

  // "image", "image 1", "image-1", "img_2", "photo3", "picture 04"
  if (/^(image|img|photo|picture|pic|banner|slide|slider|figure)[\s_-]*\d*$/i.test(a)) {
    return `Alt is a generic pattern "${a}".`;
  }
  // Camera/phone filenames used as alt: IMG_1234, DSC01234, PXL_2023..., Screenshot...
  if (/^(img|dsc|dscn|pxl|gopr|screenshot|photo)[\s_-]?\d+/i.test(a)) {
    return `Alt looks like a camera/screenshot filename "${a}".`;
  }
  // Filename-derived alt: ends with an image extension, or equals the src's filename.
  if (/\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(a)) return `Alt is a filename "${a}".`;
  if (src) {
    try {
      const file = new URL(src).pathname.split('/').pop() || '';
      const base = file.replace(/\.[a-z0-9]+$/i, '');
      if (base && normalizeText(base) === normalizeText(a)) return `Alt is the image filename "${a}".`;
    } catch {
      /* unresolvable src — skip filename comparison */
    }
  }
  return null;
}

// ── Link-target filtering: keep only real, crawlable HTML page targets ──
const ASSET_RE = /\.(jpe?g|png|gif|webp|svg|avif|ico|css|js|mjs|cjs|json|xml|txt|pdf|woff2?|ttf|eot|otf|map|mp4|webm|mov|zip|gz)$/i;

function isPageTarget(normalized: string): boolean {
  let path: string;
  try {
    path = new URL(normalized).pathname;
  } catch {
    return false;
  }
  if (path.startsWith('/api/')) return false;
  if (path === '/sitemap.xml' || path === '/robots.txt') return false;
  if (ASSET_RE.test(path)) return false;
  return true;
}

/** Whether a fetched page is an indexable, self-canonical 200 HTML page. */
function selfUrl(p: PageObservation, baseUrl: string): string {
  return p.finalUrl ? normalizeUrl(p.finalUrl, baseUrl) : p.normalizedUrl;
}
function isNoindex(p: PageObservation): boolean {
  return !!p.robotsMeta && /noindex/.test(p.robotsMeta);
}
function isIndexableHtml(p: PageObservation, baseUrl: string): boolean {
  if (!p.fetched || p.finalStatus !== 200 || p.contentHash === null) return false;
  if (isNoindex(p)) return false;
  // A page that canonicalizes ELSEWHERE is an intentional duplicate — exclude it
  // from duplicate/orphan reasoning (its dup title/desc/orphaning is by design).
  if (p.canonical && p.canonical !== selfUrl(p, baseUrl)) return false;
  return true;
}

/**
 * Resolve every unique internal link target ONCE. Targets already observed this
 * run reuse that observation; the rest (e.g. non-canonical /x that 301s to /x/)
 * are fetched a single time each — never per source page.
 */
export async function resolveLinkTargets(
  observations: PageObservation[],
  pagesByNormalizedUrl: Map<string, PageObservation>,
  baseUrl: string,
  fetchFn: (url: string) => Promise<FetchResultLike>,
  concurrency = 4,
  onFetch?: () => Promise<void>,
): Promise<Map<string, LinkResolution>> {
  const resolutions = new Map<string, LinkResolution>();
  const toFetch: string[] = [];

  const resolutionFrom = (target: string, finalUrl: string | null, finalStatus: number | null, chain: PageObservation['redirectChain'], transient: boolean): LinkResolution => ({
    target,
    finalUrl,
    finalNormalizedUrl: normalizeUrl(finalUrl || target, baseUrl),
    finalStatus,
    redirectChain: chain,
    redirects: chain.length > 0 || (finalStatus !== null && finalStatus >= 300 && finalStatus < 400),
    transient,
  });

  // Collect unique, page-like targets across all fetched sources.
  const unique = new Set<string>();
  for (const o of observations) {
    if (!o.fetched) continue;
    for (const link of o.internalLinkDetails) {
      if (isPageTarget(link.target)) unique.add(link.target);
    }
  }

  for (const target of unique) {
    const obs = pagesByNormalizedUrl.get(target);
    if (obs && (obs.fetched || obs.transientFailure)) {
      resolutions.set(target, resolutionFrom(target, obs.finalUrl, obs.finalStatus, obs.redirectChain, !obs.fetched && obs.transientFailure));
    } else {
      toFetch.push(target);
    }
  }

  // Bounded-concurrency fetch of the not-yet-observed targets.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, toFetch.length) }, async () => {
    while (cursor < toFetch.length) {
      const target = toFetch[cursor++];
      const res = await fetchFn(target);
      resolutions.set(target, resolutionFrom(target, res.finalUrl, res.finalStatus, res.redirectChain, res.transient));
      if (onFetch) await onFetch();
    }
  });
  await Promise.all(workers);

  return resolutions;
}

/** Count inbound internal links per FINAL (redirect-resolved) URL, excluding self-links. */
export function buildInboundCounts(
  observations: PageObservation[],
  linkResolutions: Map<string, LinkResolution>,
  baseUrl: string,
): Map<string, number> {
  const inbound = new Map<string, number>();
  for (const o of observations) {
    if (!o.fetched) continue;
    const source = selfUrl(o, baseUrl);
    const countedFromThisSource = new Set<string>();
    for (const link of o.internalLinkDetails) {
      const res = linkResolutions.get(link.target);
      // Route through the redirect chain so /x counts toward its canonical /x/.
      const finalNorm = res ? res.finalNormalizedUrl : link.target;
      if (finalNorm === source) continue; // self-link doesn't count
      if (countedFromThisSource.has(finalNorm)) continue; // one page → one inbound edge
      countedFromThisSource.add(finalNorm);
      inbound.set(finalNorm, (inbound.get(finalNorm) || 0) + 1);
    }
  }
  return inbound;
}

/** Run all Phase 2b cross-page rules. Pure over the collected run data. */
export function runCrossPageRules(
  observations: PageObservation[],
  ctx: AuditContext,
  linkResolutions: Map<string, LinkResolution>,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const baseUrl = ctx.baseUrl;
  const indexable = observations.filter((o) => isIndexableHtml(o, baseUrl));

  // ── 1 & 2: duplicate-title / duplicate-description ──
  const groupBy = (getter: (o: PageObservation) => string | null) => {
    const groups = new Map<string, PageObservation[]>();
    for (const o of indexable) {
      const key = normalizeText(getter(o));
      if (!key) continue; // empty handled by missing-title / missing-meta-description
      (groups.get(key) || groups.set(key, []).get(key)!).push(o);
    }
    return groups;
  };

  for (const [, group] of groupBy((o) => o.title)) {
    if (group.length < 2) continue;
    const urls = group.map((o) => o.normalizedUrl).sort();
    for (const o of group) {
      issues.push(
        makeIssue('duplicate-title', o, `Title is shared by ${group.length} indexable pages.`, {
          actual: o.title,
          expected: 'a unique <title>',
          extra: { duplicateUrls: urls, sharedValue: o.title },
        }),
      );
    }
  }

  for (const [, group] of groupBy((o) => o.metaDescription)) {
    if (group.length < 2) continue;
    const urls = group.map((o) => o.normalizedUrl).sort();
    for (const o of group) {
      issues.push(
        makeIssue('duplicate-description', o, `Meta description is shared by ${group.length} indexable pages.`, {
          actual: o.metaDescription,
          expected: 'a unique meta description',
          extra: { duplicateUrls: urls, sharedValue: o.metaDescription },
        }),
      );
    }
  }

  // ── 3: broken-internal-link (one finding per broken source→target) ──
  // ── 4: internal-link-to-redirect (GROUPED by canonical destination) ──
  // Detection is unchanged and per-link; only redirect REPORTING is aggregated:
  // every source→redirecting-target edge is still counted (affectedLinks), but
  // rolled up into one finding per unique final canonical URL so one systemic
  // pattern (e.g. site-wide non-trailing-slash links) is one warning, not N.
  interface RedirectAgg {
    finalUrl: string | null;
    occurrences: number; // distinct source→target edges landing here
    sources: Set<string>;
    targets: Map<string, { redirectStatus: number | null; finalUrl: string | null; sources: Set<string> }>;
  }
  const redirectGroups = new Map<string, RedirectAgg>();

  for (const o of observations) {
    if (!o.fetched) continue;
    const source = selfUrl(o, baseUrl);
    const seen = new Set<string>(); // one edge per (source, target)
    for (const link of o.internalLinkDetails) {
      if (!isPageTarget(link.target)) continue;
      if (seen.has(link.target)) continue;
      seen.add(link.target);
      const res = linkResolutions.get(link.target);
      if (!res || res.transient) continue; // never flag transient/network failures

      const status = res.finalStatus;
      if (status !== null && status >= 400 && status < 500) {
        issues.push(
          makeIssue('broken-internal-link', o, `Links to ${link.target} which returns HTTP ${status}.`, {
            httpStatus: status,
            finalUrl: res.finalUrl ?? undefined,
            redirectChain: res.redirectChain,
            actual: status,
            expected: 200,
            extra: { target: link.target, anchor: link.anchor, href: link.href, finalUrl: res.finalUrl },
          }, link.target),
        );
      } else if (res.redirects) {
        const key = res.finalNormalizedUrl; // group by the canonical destination
        let g = redirectGroups.get(key);
        if (!g) {
          g = { finalUrl: res.finalUrl, occurrences: 0, sources: new Set(), targets: new Map() };
          redirectGroups.set(key, g);
        }
        g.occurrences++;
        g.sources.add(source);
        let t = g.targets.get(link.target);
        if (!t) {
          t = { redirectStatus: res.redirectChain[0]?.status ?? status, finalUrl: res.finalUrl, sources: new Set() };
          g.targets.set(link.target, t);
        }
        t.sources.add(source);
      }
    }
  }

  // Emit one grouped finding per canonical destination. Anchored on that
  // (fetched, canonical) URL with an empty discriminator ⇒ a deterministic,
  // stable fingerprint across runs (open→open, never re-NEW), and the existing
  // coverage-gated resolution works because the destination is a fetched page.
  for (const [finalNorm, g] of redirectGroups) {
    const anchorObs = ctx.pagesByNormalizedUrl.get(finalNorm);
    const anchor = anchorObs
      ? { url: anchorObs.url, normalizedUrl: anchorObs.normalizedUrl }
      : { url: finalNorm, normalizedUrl: finalNorm };
    const targets = Array.from(g.targets.keys()).sort();
    const examples = targets.slice(0, 5).map((t) => `${t} → ${g.targets.get(t)!.finalUrl ?? finalNorm}`);
    const repStatus = g.targets.get(targets[0])?.redirectStatus ?? undefined;
    issues.push(
      makeIssue(
        'internal-link-to-redirect',
        anchor,
        `${g.occurrences} internal link${g.occurrences === 1 ? '' : 's'} across ${g.sources.size} page${g.sources.size === 1 ? '' : 's'} point to a redirect that resolves to ${finalNorm}.`,
        {
          httpStatus: repStatus,
          finalUrl: g.finalUrl ?? undefined,
          actual: g.occurrences,
          expected: 'direct links to the canonical URL',
          extra: {
            finalUrl: finalNorm,
            affectedLinks: g.occurrences,
            affectedSourcePages: g.sources.size,
            uniqueTargets: targets,
            targets: targets.map((t) => ({
              target: t,
              redirectStatus: g.targets.get(t)!.redirectStatus,
              sources: Array.from(g.targets.get(t)!.sources).sort(),
            })),
            examples,
          },
        },
      ),
    );
  }

  // ── 5: orphan-page ──
  const inbound = buildInboundCounts(observations, linkResolutions, baseUrl);
  for (const o of indexable) {
    const self = selfUrl(o, baseUrl);
    const count = inbound.get(self) ?? inbound.get(o.normalizedUrl) ?? 0;
    if (count === 0) {
      issues.push(
        makeIssue('orphan-page', o, 'No internal page links to this URL (sitemap does not count).', {
          actual: 0,
          expected: '>= 1 internal inbound link',
          sitemapStatus: o.inSitemap ? 'present' : 'absent',
          extra: { inboundLinks: 0 },
        }),
      );
    }
  }

  // ── 6: generic-image-alt ──
  for (const o of observations) {
    if (!o.fetched || o.finalStatus !== 200) continue;
    const seen = new Set<string>();
    for (const img of o.images) {
      const reason = isGenericAlt(img.alt, img.src);
      if (!reason) continue;
      const key = `${img.src ?? ''}::${img.alt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(
        makeIssue('generic-image-alt', o, reason, {
          actual: img.alt,
          expected: 'descriptive alt text',
          extra: { imageUrl: img.src, reason },
        }, img.src ?? img.alt),
      );
    }
  }

  return issues;
}
