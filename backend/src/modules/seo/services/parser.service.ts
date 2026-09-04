import { createHash } from 'crypto';
import { FaqSignals, HeadingRef, ImageRef, InternalLinkRef } from '../seo.types';
import { isSameOrigin, normalizeUrl } from '../seo.util';

/**
 * Phase 6.1 — bumped whenever the CONTENT-SIGNAL extraction below changes in a
 * way that could alter `normalizedText`, the heading capture, or the FAQ
 * signals. Stamped onto every snapshot so an analysis can tell a page whose
 * structure was genuinely absent from one whose structure was never captured
 * (a snapshot written before this extractor existed carries `null`).
 *
 * Deliberately NOT bumped for changes to fields that predate Phase 6.1 —
 * `contentHash`/`wordCount` derivation is byte-for-byte unchanged so cross-run
 * content comparisons made before this phase stay valid.
 */
export const EXTRACTOR_VERSION = '6.1.0-extract-v1';

/**
 * Bounds on the content signals persisted per page snapshot. Snapshots are
 * written once per URL per audit run and are never pruned, so every one of
 * these fields is capped. Real Rajhans pages sit far under these limits; the
 * caps exist so a pathological page can never bloat the collection, and every
 * cap that actually bites is reported through an explicit `*Truncated` flag —
 * truncation is never silent.
 */
export const EXTRACTION_LIMITS = {
  /** Characters of normalized visible text retained. ~4,000 words. */
  normalizedTextMaxChars: Number(process.env.SEO_SNAPSHOT_TEXT_MAX_CHARS || 24000),
  /** Per-level cap on retained headings (h1/h2/h3 each). */
  maxHeadingsPerLevel: Number(process.env.SEO_SNAPSHOT_MAX_HEADINGS || 100),
  /** Cap on the document-order heading outline. */
  maxOutlineEntries: Number(process.env.SEO_SNAPSHOT_MAX_OUTLINE || 200),
  /** Characters retained per individual heading. */
  maxHeadingChars: 300,
};

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  robotsMeta: string | null;
  canonical: string | null;
  h1: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[]; // normalized, same-origin
  internalLinkDetails: InternalLinkRef[]; // href + normalized target + anchor text
  images: ImageRef[]; // every <img> with src + alt
  structuredDataTypes: string[];
  wordCount: number;
  contentHash: string | null;

  // ── Phase 6.1 content signals (additive; nothing above changed meaning) ──
  /** Sub-headings, inner text only, in document order within their level. */
  h2: string[];
  h3: string[];
  /** H1/H2/H3 in DOCUMENT order — carries hierarchy, which the flat arrays lose. */
  headingOutline: HeadingRef[];
  /**
   * Entity-decoded, whitespace-collapsed visible text, truncated at a word
   * boundary to `normalizedTextMaxChars`. Scripts, styles and all markup are
   * removed before this is built — no raw HTML is ever persisted.
   */
  normalizedText: string;
  /** Length of the FULL normalized text before truncation. */
  normalizedTextChars: number;
  /** True when `normalizedText` is a prefix of a longer body. */
  normalizedTextTruncated: boolean;
  /** Raw deterministic FAQ signals. Whether they mean "has an FAQ" is an
   *  analysis decision, made in the Phase 6.1 extraction layer, not here. */
  faqSignals: FaqSignals;
  /** Which extractor produced the signals above. */
  extractorVersion: string;
}

/** Read one attribute from a single tag string, case-insensitive, quote-aware. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function allTags(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(re) || [];
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Inner text of a heading element body: strip nested markup, collapse, decode. */
function headingText(inner: string): string {
  return decode(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, EXTRACTION_LIMITS.maxHeadingChars);
}

/**
 * Every h1/h2/h3 in DOCUMENT order. One pass over a combined pattern (rather
 * than three independent passes) is what makes the outline's ordering real
 * rather than a per-level concatenation.
 */
function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[]; outline: HeadingRef[] } {
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  const outline: HeadingRef[] = [];
  const byLevel: Record<number, string[]> = { 1: h1, 2: h2, 3: h3 };

  const re = /<h([123])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const level = Number(m[1]) as 1 | 2 | 3;
    const text = headingText(m[2]);
    if (!text) continue; // an empty heading carries no signal (matches the pre-6.1 h1 rule)
    const bucket = byLevel[level];
    if (bucket.length < EXTRACTION_LIMITS.maxHeadingsPerLevel) bucket.push(text);
    if (outline.length < EXTRACTION_LIMITS.maxOutlineEntries) outline.push({ level, text });
  }
  return { h1, h2, h3, outline };
}

/** A heading phrased as a question — the strongest non-schema FAQ signal. */
const QUESTION_HEADING = /\?\s*$/;
const FAQ_WORD = /\b(faq|faqs|frequently asked questions?)\b/i;

function buildFaqSignals(outline: HeadingRef[], structuredDataTypes: string[]): FaqSignals {
  return {
    questionHeadings: outline.filter((h) => QUESTION_HEADING.test(h.text)).length,
    faqHeadingPresent: outline.some((h) => FAQ_WORD.test(h.text)),
    faqSchemaPresent: structuredDataTypes.some((t) => /^(FAQPage|Question)$/i.test(t)),
  };
}

/**
 * Truncate at a WORD boundary so the retained excerpt never ends mid-token —
 * a half-token would be a phantom term for coverage matching. Falls back to a
 * hard cut only when the excerpt contains no space at all.
 */
function boundText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return { text: (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim(), truncated: true };
}

export function parseHtml(html: string, pageUrl: string, baseUrl: string): ParsedPage {
  // ── <title> ──
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].replace(/\s+/g, ' ')) || null : null;

  // ── <meta> (description / robots) ──
  let metaDescription: string | null = null;
  let robotsMeta: string | null = null;
  for (const tag of allTags(html, 'meta')) {
    const name = (attr(tag, 'name') || '').toLowerCase();
    if (name === 'description' && metaDescription === null) {
      metaDescription = decode(attr(tag, 'content') || '') || null;
    } else if (name === 'robots' && robotsMeta === null) {
      robotsMeta = (attr(tag, 'content') || '').toLowerCase() || null;
    }
  }

  // ── <link rel="canonical"> ──
  let canonical: string | null = null;
  for (const tag of allTags(html, 'link')) {
    if ((attr(tag, 'rel') || '').toLowerCase() === 'canonical') {
      const href = attr(tag, 'href');
      if (href) canonical = normalizeUrl(decode(href), baseUrl);
      break;
    }
  }

  // ── Phase 6.1 content scope ─────────────────────────────────────────────
  // Shared app chrome (header/nav/cart/footer) can contain headings and text
  // that are not part of the page's SEO content. Prefer the semantic <main>
  // region for Phase 6.1 signals, with full-document fallback for pages that do
  // not expose one. Legacy fields below intentionally continue using full HTML.
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  const contentHtml = mainMatch ? mainMatch[1] : html;

  // ── <h1>/<h2>/<h3> (Phase 6.1 scoped content signals) ──
  // Product-card names are UI/card labels, not editorial page headings.
  // Keep their text in normalizedText for topical coverage, but exclude
  // their heading tags from hierarchy analysis.
  const headingHtml = contentHtml.replace(/<app-product-card\b[^>]*>[\s\S]*?<\/app-product-card\s*>/gi, ' ');
  const { h1, h2, h3, outline: headingOutline } = extractHeadings(headingHtml);

  // ── <img> alt coverage + per-image src/alt (for generic-alt) ──
  const imgTags = allTags(html, 'img');
  const imagesTotal = imgTags.length;
  const images: ImageRef[] = imgTags.map((t) => {
    const rawSrc = attr(t, 'src') || attr(t, 'data-src') || null;
    let src: string | null = rawSrc;
    if (rawSrc) {
      try {
        src = new URL(decode(rawSrc), pageUrl).toString();
      } catch {
        src = rawSrc;
      }
    }
    const altRaw = attr(t, 'alt'); // value, or null when absent OR bare (alt with no =)
    const alt = decode(altRaw || '');
    // The alt attribute is PRESENT if it has a value, or appears bare (<img alt>).
    const altPresent = altRaw !== null || /(?:^|\s)alt(?=[\s=>/]|$)/i.test(t);
    const role = (attr(t, 'role') || '').toLowerCase();
    const ariaHidden = (attr(t, 'aria-hidden') || '').toLowerCase() === 'true';
    // Explicitly decorative: an empty-but-present alt (the HTML "decorative"
    // signal), or role=presentation/none, or aria-hidden. NOT a truly-missing alt.
    const decorative = ariaHidden || role === 'presentation' || role === 'none' || (altPresent && alt.trim() === '');
    return { src, alt, decorative };
  });
  // Only truly-missing alt (no meaningful text AND not explicitly decorative) counts.
  const imagesMissingAlt = images.filter((i) => !i.alt.trim() && !i.decorative).length;

  // ── same-origin internal links (with anchor text + raw href) ──
  const links = new Set<string>();
  const internalLinkDetails: InternalLinkRef[] = [];
  const seenLinkPairs = new Set<string>(); // dedupe identical (target, anchor) on a page
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(html))) {
    const openTag = `<a ${am[1]}>`;
    const href = attr(openTag, 'href');
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(decode(href), pageUrl).toString();
    } catch {
      continue;
    }
    if (!isSameOrigin(abs, baseUrl)) continue;
    const target = normalizeUrl(abs, baseUrl);
    links.add(target);
    const anchor = decode(am[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const key = `${target} ${anchor}`;
    if (seenLinkPairs.has(key)) continue;
    seenLinkPairs.add(key);
    internalLinkDetails.push({ href: decode(href), target, anchor });
  }

  // ── JSON-LD structured-data @types ──
  const structuredDataTypes = new Set<string>();
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    try {
      const json = JSON.parse(ld[1].trim());
      const collect = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') structuredDataTypes.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && structuredDataTypes.add(x));
          if ((node as Record<string, unknown>)['@graph']) collect((node as Record<string, unknown>)['@graph']);
        }
      };
      collect(json);
    } catch {
      /* malformed JSON-LD is reported by a rule, not here */
    }
  }

  // ── visible-text word count + content hash (for thin-content / change detection) ──
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text ? text.split(' ').filter(Boolean).length : 0;
  const contentHash = createHash('sha1').update(text).digest('hex');

  // ── Phase 6.1: scoped visible text, entity-decoded and bounded ──
  // Unlike the legacy `text` above, this is derived from the semantic page
  // content region so shared app chrome cannot distort topic/coverage analysis.
  // `wordCount`/`contentHash` remain based on full-document `text` unchanged.
  const contentText = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const decodedText = decode(contentText).replace(/\s+/g, ' ').trim();
  const bounded = boundText(decodedText, EXTRACTION_LIMITS.normalizedTextMaxChars);
  const faqSignals = buildFaqSignals(headingOutline, Array.from(structuredDataTypes));

  return {
    title,
    metaDescription,
    robotsMeta,
    canonical,
    h1,
    imagesTotal,
    imagesMissingAlt,
    internalLinks: Array.from(links),
    internalLinkDetails,
    images,
    structuredDataTypes: Array.from(structuredDataTypes),
    wordCount,
    contentHash,
    h2,
    h3,
    headingOutline,
    normalizedText: bounded.text,
    normalizedTextChars: decodedText.length,
    normalizedTextTruncated: bounded.truncated,
    faqSignals,
    extractorVersion: EXTRACTOR_VERSION,
  };
}

/** Extract normalized <loc> URLs from a sitemap.xml body. */
export function parseSitemapLocs(xml: string, baseUrl: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) locs.push(normalizeUrl(decode(m[1]), baseUrl));
  return locs;
}
