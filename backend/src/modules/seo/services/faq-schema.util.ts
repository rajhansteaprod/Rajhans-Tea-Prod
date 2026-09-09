/**
 * Phase 6.5A — deterministic, DB/network-free FAQPage schema utilities shared
 * by the draft generator and the preflight evaluator (mirrors the
 * internal-link-patch.util.ts pattern: one pure implementation, never
 * duplicated, so a draft's precomputed value can always be independently
 * re-derived and compared byte-for-byte rather than trusted).
 *
 * The FAQ page's visible content (`Page.content`) is the ONLY source of
 * truth. Q&A pairs are never invented, rewritten, or sourced from anywhere
 * else — they are extracted from the exact same HTML the page already
 * renders to visitors, via a fixed `<h3>Question</h3><p>Answer</p>` pattern.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export type ExtractFaqPairsResult =
  | { ok: true; items: FaqItem[] }
  | { ok: false; reason: 'no_faq_entries' | 'empty_question' | 'empty_answer' | 'duplicate_question' };

/**
 * Extract every `<h3>Question</h3>` immediately followed by `<p>Answer</p>`
 * pair from raw page HTML. Deliberately strict: a question/answer may
 * contain no nested tags (`[^<]*` only) so what ends up in JSON-LD can never
 * silently carry markup or content the visible-text check can't verify
 * against. Whitespace is trimmed but no other rewriting happens.
 */
export function extractFaqPairsFromHtml(html: string): ExtractFaqPairsResult {
  const pairPattern = /<h3>([^<]*)<\/h3>\s*<p>([^<]*)<\/p>/g;
  const items: FaqItem[] = [];
  const seenQuestions = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = pairPattern.exec(html)) !== null) {
    const question = m[1].trim();
    const answer = m[2].trim();

    if (!question) return { ok: false, reason: 'empty_question' };
    if (!answer) return { ok: false, reason: 'empty_answer' };

    const dedupeKey = question.toLowerCase();
    if (seenQuestions.has(dedupeKey)) return { ok: false, reason: 'duplicate_question' };
    seenQuestions.add(dedupeKey);

    items.push({ question, answer });
  }

  if (!items.length) return { ok: false, reason: 'no_faq_entries' };
  return { ok: true, items };
}

/**
 * Deterministically build a canonical FAQPage JSON-LD object from Q&A items.
 * Same items (same order) always produce byte-identical JSON via
 * `JSON.stringify` — that determinism is what lets preflight compare a
 * re-derived schema against the proposed one with a plain string equality
 * rather than a fuzzy/structural diff.
 */
export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/** Stable, deterministic serialization used everywhere two JSON-LD values must be compared or persisted as a single string field. */
export function serializeFaqJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd);
}
