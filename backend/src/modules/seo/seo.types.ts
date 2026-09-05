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

/** One image reference from a page — used by the cross-page generic-alt check. */
export interface ImageRef {
  src: string | null; // absolute src if resolvable, else the raw attribute
  alt: string; // the alt attribute value (may be '')
  /**
   * True when the image is explicitly DECORATIVE — an empty alt attribute
   * (alt=""/bare alt, the HTML signal for "decorative"), role=presentation/none,
   * or aria-hidden=true. Decorative images with no alt text are correct and must
   * NOT be reported by images-missing-alt.
   */
  decorative: boolean;
}

/** One internal anchor from a page — carries context the cross-page link checks report. */
export interface InternalLinkRef {
  href: string; // the raw href attribute as authored
  target: string; // normalized, same-origin absolute URL
  anchor: string; // trimmed anchor text (may be '')
}

/**
 * One heading occurrence in DOCUMENT order (Phase 6.1). The flat `h1`/`h2`/`h3`
 * arrays lose the interleaving; this keeps it, so hierarchy questions (does the
 * body have any H2 at all? does an H3 appear before any H2?) are answerable
 * from stored state without re-crawling.
 */
export interface HeadingRef {
  level: 1 | 2 | 3;
  text: string;
}

/**
 * Raw, deterministic FAQ indicators captured at parse time (Phase 6.1). These
 * are OBSERVATIONS, not a verdict — whether a page "has an FAQ" is a judgement
 * the analysis layer makes from these counts, so that rule can be revised
 * later without recrawling the site.
 */
export interface FaqSignals {
  /** Headings ending in a question mark. */
  questionHeadings: number;
  /** A heading literally naming an FAQ section. */
  faqHeadingPresent: boolean;
  /** FAQPage / Question JSON-LD was present. */
  faqSchemaPresent: boolean;
}

/**
 * The resolved state of a single internal link target (fetched once per unique
 * URL). Powers broken-internal-link / internal-link-to-redirect and the
 * trailing-slash-aware inbound graph used by orphan-page.
 */
export interface LinkResolution {
  target: string; // the normalized URL that was resolved
  finalUrl: string | null;
  finalNormalizedUrl: string; // finalUrl normalized (self when no redirect)
  finalStatus: number | null;
  redirectChain: RedirectHop[];
  redirects: boolean; // true when the chain is non-empty / status is 3xx
  transient: boolean; // network/timeout/5xx — never treated as "broken"
  /**
   * The canonical URL the RESOLVED target page declares (normalized), when it is
   * a 200 HTML page and explicitly different from finalNormalizedUrl. Powers the
   * orphan-page fold: an inbound link to a query-variant (…/contact/?reason=bulk)
   * whose page declares canonical /contact/ counts toward /contact/. Null when
   * the page has no canonical or self-canonicalizes.
   */
  finalCanonicalUrl: string | null;
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
  /**
   * Optional identity discriminator folded into the fingerprint. Empty for
   * page-level checks (one finding per URL+checkId). Cross-page checks that can
   * emit several findings on one page (e.g. broken-internal-link per target) set
   * it to the RELATIONSHIP key (the target/image URL) so each is a stable,
   * independently-resolvable finding.
   */
  discriminator?: string;
}

/** Minimal shape of a fetch result the cross-page resolver needs (test-injectable). */
export interface FetchResultLike {
  finalUrl: string | null;
  finalStatus: number | null;
  redirectChain: RedirectHop[];
  transient: boolean;
  /** Final 200 HTML body, when available — used to read the target's declared canonical. */
  html?: string | null;
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
  /** Richer anchors (href + normalized target + anchor text) for cross-page link checks. */
  internalLinkDetails: InternalLinkRef[];
  /** Every <img> with its src + alt — feeds the generic-image-alt check. */
  images: ImageRef[];
  structuredDataTypes: string[];
  wordCount: number;
  contentHash: string | null;
  // ── Phase 6.1 content signals ──
  // Present on every observation produced by this build. On a snapshot READ
  // back from the database they may be absent, because snapshots written
  // before Phase 6.1 never carried them — `extractorVersion === null` is the
  // authoritative "structure was never captured" marker, and analysis must
  // degrade explicitly rather than read absence as "the page has no headings".
  h2: string[];
  h3: string[];
  headingOutline: HeadingRef[];
  normalizedText: string;
  normalizedTextChars: number;
  normalizedTextTruncated: boolean;
  faqSignals: FaqSignals | null;
  extractorVersion: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Recommendation layer (OBSERVE + RECOMMEND, never auto-apply)
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationCategory =
  | 'metadata'
  | 'internal-linking'
  | 'content'
  | 'schema'
  | 'indexability'
  | 'crawl'
  | 'topical-authority'
  | 'search-opportunity' // Phase 4 — GSC-derived
  // Phase 4b.6 — market-evidence-derived (source:'market' only):
  | 'existing-page-optimization'
  | 'new-guide'
  | 'new-landing-page'
  | 'commercial-opportunity';

/** Where a recommendation was synthesized from. */
export type RecommendationSource = 'audit' | 'gsc' | 'market' | 'content';

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationImpact = 'very-high' | 'high' | 'medium' | 'low';
export type RecommendationEffort = 'small' | 'medium' | 'large';

/**
 * Owner-facing decision aid. This does NOT change reviewStatus and never
 * approves anything automatically.
 */
export type ApprovalPropensity =
  | 'recommended_to_approve'
  | 'needs_review'
  | 'low_urgency'
  | 'monitoring';

/**
 * An actionable growth recommendation synthesized from one or more audit
 * findings. This is NOT an audit issue — it is advice (automationLevel always
 * 'recommend'; Phase 3A never generates copy or changes production).
 */
export interface SeoRecommendation {
  recommendationId: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  impact: RecommendationImpact;
  title: string;
  why: string;
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  suggestedFix: string;
  estimatedEffort: RecommendationEffort;
  automationLevel: 'recommend';
}

/** Signals fed to the (configurable) scoring engine to derive priority + impact. */
export interface ScoringSignals {
  isIndexability?: boolean;
  isDuplicateMetadata?: boolean;
  /** Extra flat score added by a generator for domain-specific weight. */
  bonus?: number;
}

/**
 * A generator's output before the scoring engine and persistence lifecycle are
 * attached. `discriminator` folds into the fingerprint exactly like issues, so a
 * per-URL recommendation (e.g. indexability on one page) has stable identity.
 */
export interface RecommendationDraft {
  recommendationId: string;
  discriminator?: string;
  category: RecommendationCategory;
  title: string;
  why: string;
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  suggestedFix: string;
  estimatedEffort: RecommendationEffort;
  signals: ScoringSignals;
  /** Audit checkIds this recommendation was synthesized from (for the drill-down). */
  relatedCheckIds?: string[];
  /** 'audit' (default) or 'gsc' (Phase 4 search-opportunity). */
  source?: RecommendationSource;
  /** GSC-derived confidence, when source is 'gsc'. */
  confidence?: 'low' | 'medium' | 'high';
}
