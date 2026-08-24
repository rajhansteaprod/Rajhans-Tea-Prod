/**
 * Shared types for the SEO audit engine (Phase 2a — OBSERVE + DETECT only).
 *
 * The interfaces here are deliberately shaped to support the eventual agent loop
 * (OBSERVE → DETECT → DIAGNOSE → PRIORITIZE → RECOMMEND → APPROVAL → CHANGE →
 * DEPLOY → VERIFY → MEASURE → LEARN). Phase 2a implements only OBSERVE/DETECT and
 * historical state; the `automationLevel` and `recommendation` fields exist now
 * (fixed at 'observe' / null) so later phases can populate them without a schema
 * migration.
 */

export type Severity = 'critical' | 'warning' | 'info';

/** OBSERVE = detect/report only. RECOMMEND/AUTO reserved for Phase 3/5. */
export type AutomationLevel = 'observe' | 'recommend' | 'auto';

export type IssueStatus = 'open' | 'resolved';

export type RunTrigger = 'manual' | 'cron';
export type RunScope = 'daily' | 'weekly' | 'deep';
/**
 * running   — in progress
 * completed — finished with acceptable coverage; safe to diff against
 * degraded  — finished but coverage below threshold or site partially
 *             unreachable; NOT used as a diff baseline and never resolves issues
 * failed    — aborted (e.g. site unreachable at preflight)
 */
export type RunStatus = 'running' | 'completed' | 'degraded' | 'failed';

export interface RedirectHop {
  url: string;
  status: number;
}

/** How a URL relates to the sitemap — surfaced as evidence on several checks. */
export type SitemapStatus =
  | 'present'
  | 'absent'
  | 'present-but-redirects'
  | 'present-non-200';

/**
 * Structured evidence attached to every issue so the future agent can EXPLAIN a
 * finding ("expected self-canonical X, got Y; page is on the sitemap; previously
 * self-canonical") rather than just naming it.
 */
export interface SeoIssueEvidence {
  httpStatus?: number;
  redirectChain?: RedirectHop[];
  finalUrl?: string;
  actual: unknown; // observed value (or null)
  expected: unknown; // expected value (or null when N/A)
  sitemapStatus?: SitemapStatus;
  previousValue?: unknown; // prior observed value — powers regression explanations
  extra?: Record<string, unknown>;
}

/**
 * A single detected SEO finding. Persisted and keyed by `fingerprint` so state
 * (open/resolved) and history (first/last seen) survive across runs.
 */
export interface DetectedIssue {
  checkId: string; // stable slug, e.g. 'canonical-missing'
  severity: Severity;
  url: string;
  normalizedUrl: string;
  explanation: string; // human-readable WHY
  evidence: SeoIssueEvidence;
  automationLevel: AutomationLevel; // 'observe' in Phase 2a
}

/** The normalized, parsed view of one fetched URL — the raw material for rules. */
export interface PageObservation {
  url: string;
  normalizedUrl: string;
  fetched: boolean; // false when the fetch failed (network/timeout/etc.)
  transientFailure: boolean; // true when the failure looks temporary, not an SEO defect
  httpStatus: number | null;
  redirectChain: RedirectHop[];
  finalUrl: string | null;
  finalStatus: number | null;
  // Parsed from HTML (only when the final response was 200 HTML)
  title: string | null;
  metaDescription: string | null;
  robotsMeta: string | null;
  canonical: string | null;
  h1: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  structuredDataTypes: string[];
  wordCount: number;
  contentHash: string | null;
  // Sitemap relationship (filled by the analyzer, not the fetcher)
  inSitemap: boolean;
  fetchError: string | null;
}

/** Context passed to every rule: the site base + sitemap facts + the full page set. */
export interface AuditContext {
  baseUrl: string;
  sitemapUrls: Set<string>; // normalized loc URLs from sitemap.xml
  robotsAccessible: boolean;
  pagesByNormalizedUrl: Map<string, PageObservation>;
}

/** A rule is a pure function: observation + context → zero or more issues. */
export interface SeoRule {
  checkId: string;
  defaultSeverity: Severity;
  automationLevel: AutomationLevel; // 'observe' in Phase 2a
  description: string;
  evaluate(page: PageObservation, ctx: AuditContext): DetectedIssue[];
}
