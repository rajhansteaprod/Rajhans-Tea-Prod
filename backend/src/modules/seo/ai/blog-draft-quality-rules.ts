import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from './blog-ai.types';
import { validateArticleHtml, extractLinks, isInternalUrl, UNSUPPORTED_CLAIM_PATTERNS, UNSUPPORTED_HEALTH_CLAIM_PATTERNS } from '../services/blog-content-safety.util';

/**
 * Phase 6.7A Part E — deterministic, non-AI quality gates for autonomously
 * drafted long-form articles. Mirrors product-draft-quality-rules.ts's
 * philosophy exactly: a claim can be individually true and still rejected
 * here for being repetitive, off-scope, promotional, or linking somewhere
 * the deterministic planner never authorized. Pure string/structure
 * heuristics — no network call — so the same checks run identically for the
 * first-pass draft and any AI-repaired draft.
 */

/** Repetition thresholds — the DETERMINISTIC gate's final authority. Exported so repair guidance can cite the exact permitted count; never relaxed to make an article pass (Part B). */
export const MAX_PRODUCT_NAME_MENTIONS = 4;
export const MAX_BRAND_MENTIONS = 6;

const GENERIC_FILLER_PHRASES = [
  'premium quality',
  'perfect choice',
  'perfect for',
  'dependable choice',
  'practical choice',
  'ideal choice',
  'made for people who',
  'top quality',
  'highest quality',
  'best in class',
  'unmatched quality',
  'exceptional quality',
  'in today\'s world',
  'in this article, we will',
  'without further ado',
];

const COMMERCIAL_INTENT_PATTERNS = [/\bbuy\s+now\b/i, /\border\s+(now|today)\b/i, /\badd\s+to\s+cart\b/i, /\bshop\s+now\b/i, /\blimited\s+time\b/i, /\bdiscount\b/i, /\boffer\b/i, /\bsale\b/i];

const PACK_EXCLUSIVITY_PATTERNS = [
  /\bavailable in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bcomes in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bsold in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bonly (?:available )?in\b/i,
];

const RECOMMENDATION_KEYWORDS = /\b(?:suited to|best enjoyed|best taken|ideal for|ideal in|recommended for|recommended in|great for|great in|works well)\b/i;
const TIME_KEYWORDS: Record<string, RegExp> = {
  Morning: /\bmorning\b/i,
  Evening: /\bevening\b/i,
  Noon: /\bnoon\b|\bmidday\b|\bafternoon\b/i,
};

const BANNED_GENERIC_ANCHORS = new Set(['here', 'there', 'read', 'more', 'click', 'link', 'this', 'that', 'page', 'guide']);

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function splitSentences(text: string): string[] {
  return normalize(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toWords(text: string): string[] {
  return normalize(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

function findRepeatedPhrase(text: string, gramSize = 6): string | null {
  const w = toWords(text);
  const seen = new Set<string>();
  for (let i = 0; i + gramSize <= w.length; i++) {
    const gram = w.slice(i, i + gramSize);
    if (!gram.some((word) => word.length >= 5)) continue;
    const key = gram.join(' ');
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/** Whether any 8+ word run of `body` appears verbatim inside `other` — a deterministic substantive-overlap signal against the existing corpus. */
function hasSubstantiveOverlap(bodyWords: string[], other: string, gramSize = 8): string | null {
  const otherLower = normalize(other).toLowerCase();
  if (!otherLower) return null;
  for (let i = 0; i + gramSize <= bodyWords.length; i++) {
    const gram = bodyWords.slice(i, i + gramSize).join(' ');
    if (gram.length >= 30 && otherLower.includes(gram)) return gram;
  }
  return null;
}

function extractHeadings(html: string, level: 'h2' | 'h3'): string[] {
  const pattern = new RegExp(`<${level}\\b[^>]*>([^<]*)</${level}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const text = m[1]!.trim();
    if (text) out.push(text);
  }
  return out;
}

export function evaluateBlogDraftQuality(evidence: BlogContentEvidence, plan: ArticlePlan, draft: GroundedBlogDraft): string[] {
  const errors: string[] = [];
  if (!draft.contentHtml || !draft.h1) {
    errors.push('Draft is missing contentHtml or h1');
    return errors;
  }

  const html = draft.contentHtml;
  const h1 = draft.h1.trim();

  // 1/2/3/4. HTML safety + structural minimums (script/iframe/style/inline
  // events, at least one heading, at least two paragraphs).
  const safety = validateArticleHtml(html);
  if (!safety.ok) errors.push(`Unsafe or malformed article HTML: ${safety.reason}`);

  // 4b. Heading hierarchy — require at least 2 h2 sections; no h3 present
  // without any h2 (a flat, single-level hierarchy is the house style — see
  // the Assam article).
  const h2s = extractHeadings(html, 'h2');
  const h3s = extractHeadings(html, 'h3');
  if (h2s.length < 2) errors.push(`Article has too few h2 sections (${h2s.length}) for a natural heading hierarchy`);
  if (h3s.length > 0 && h2s.length === 0) errors.push('Article has h3 headings with no parent h2 — broken heading hierarchy');

  // 5. Duplicate H1/body-heading — the H1 must not be repeated verbatim as
  // an h2/h3 heading or as a leading duplicate sentence in the body.
  if (h2s.some((h) => h.toLowerCase() === h1.toLowerCase())) {
    errors.push('H1 text is duplicated as a body heading');
  }
  const plainBody = normalize(stripTags(html));
  if (countOccurrences(plainBody, h1) > 0) {
    errors.push('H1 text is repeated verbatim in the article body');
  }

  // 6. Material repetition — the same 6+ word phrase stated more than once.
  // Checked against the STRIPPED body text, never raw HTML — an n-gram over
  // tag markup can produce a garbled false-positive match (e.g. a stray "p"
  // from a stripped <p> tag prefixing an otherwise-unique sentence).
  const repeated = findRepeatedPhrase(plainBody);
  if (repeated) errors.push(`Article repeats the same phrase more than once: "${repeated}"`);

  // 7. Excessive product/brand-name repetition.
  if (evidence.product) {
    const nameCount = countOccurrences(plainBody, evidence.product.name);
    if (nameCount > MAX_PRODUCT_NAME_MENTIONS) errors.push(`Product name repeated ${nameCount} times — should appear naturally, not mechanically`);
  }
  const brandCount = countOccurrences(plainBody, 'Rajhans');
  if (brandCount > MAX_BRAND_MENTIONS) errors.push(`"Rajhans" repeated ${brandCount} times — excessive brand-name repetition`);

  // 8. Generic SEO filler not grounded in evidence.
  const lowerBody = plainBody.toLowerCase();
  for (const phrase of GENERIC_FILLER_PHRASES) {
    if (lowerBody.includes(phrase)) errors.push(`Article uses unsupported generic filler phrase: "${phrase}"`);
  }

  // 9. Unsupported health/scientific claim patterns.
  for (const pattern of UNSUPPORTED_HEALTH_CLAIM_PATTERNS) {
    if (pattern.test(html)) errors.push(`Article contains an unsupported health/scientific claim pattern: ${pattern}`);
  }

  // 10. Unsupported superlatives.
  for (const pattern of UNSUPPORTED_CLAIM_PATTERNS) {
    if (pattern.test(html)) errors.push(`Article contains an unsupported/unverifiable claim pattern: ${pattern}`);
  }

  // 11/12. Pack-size exclusivity + bestTakenFor recommendation-not-exclusivity.
  if (evidence.product) {
    if (evidence.product.packOptions.length > 1 && PACK_EXCLUSIVITY_PATTERNS.some((re) => re.test(plainBody))) {
      errors.push('Article implies a single/exclusive pack size while multiple active pack sizes exist');
    }
    const allowedTimes = new Set(evidence.product.bestTakenFor);
    const sentences = splitSentences(plainBody);
    for (const [timeOfDay, timeRe] of Object.entries(TIME_KEYWORDS)) {
      if (allowedTimes.has(timeOfDay)) continue;
      if (sentences.some((s) => RECOMMENDATION_KEYWORDS.test(s) && timeRe.test(s))) {
        errors.push(`Article recommends the product for "${timeOfDay}" but bestTakenFor is [${evidence.product.bestTakenFor.join(', ') || 'none'}]`);
      }
    }
  }

  // 13. Internal links: Rajhans-only, within the deterministically allowed
  // set, and not a generic/meaningless anchor.
  const links = extractLinks(html) ?? [];
  const allowedHrefs = new Set(plan.allowedLinkTargets.map((l) => l.href));
  for (const link of links) {
    if (!isInternalUrl(link.href, evidence.siteFacts.baseUrl)) {
      errors.push(`Article links to an external/non-Rajhans URL: ${link.href}`);
      continue;
    }
    if (!allowedHrefs.has(link.href)) {
      errors.push(`Article links to "${link.href}", which is outside the deterministically planned/allowed link set`);
    }
    if (BANNED_GENERIC_ANCHORS.has(link.anchor.trim().toLowerCase())) {
      errors.push(`Article uses a generic, non-descriptive anchor for a link: "${link.anchor}"`);
    }
  }
  if (evidence.product) {
    const productLinkCount = links.filter((l) => l.href === evidence.product!.url).length;
    if (productLinkCount > 2) errors.push(`Product page is linked ${productLinkCount} times — should appear naturally, not repeatedly`);
  }

  // 15. Substantive overlap with the existing corpus.
  const bodyWords = toWords(plainBody);
  for (const post of evidence.existingCorpus) {
    const overlap = hasSubstantiveOverlap(bodyWords, post.topicSummary);
    if (overlap) errors.push(`Article substantially overlaps existing post "${post.slug}": "${overlap}"`);
  }

  // 16. Meta title/description present and sensible.
  if (!draft.metaTitle || draft.metaTitle.trim().length < 15 || draft.metaTitle.trim().length > 70) {
    errors.push('metaTitle is missing or an unreasonable length');
  }
  if (!draft.metaDescription || draft.metaDescription.trim().length < 50 || draft.metaDescription.trim().length > 170) {
    errors.push('metaDescription is missing or an unreasonable length');
  }

  // 17. Materially educational, not mostly promotional.
  const commercialSentenceCount = splitSentences(plainBody).filter((s) => COMMERCIAL_INTENT_PATTERNS.some((p) => p.test(s))).length;
  if (commercialSentenceCount > 0) {
    errors.push(`Article contains ${commercialSentenceCount} overtly promotional/sales sentence(s) — this must read as an educational article, not a sales page`);
  }

  return errors;
}
