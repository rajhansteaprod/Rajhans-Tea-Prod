import { ProductContentEvidence } from './seo-ai.types';

/**
 * Deterministic, non-AI quality gates for grounded product-content drafts
 * (Phase 6.3C). These run in addition to factual grounding: a claim can be
 * individually true and still be rejected here for being repetitive,
 * internally contradictory, misleadingly framed, unsupported generic filler,
 * or a near-no-op reshuffle of the existing copy. Pure string heuristics —
 * no network calls — so they run identically in tests and production and
 * apply to both the first-pass draft and any AI-repaired draft.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'with', 'is', 'it', 'its',
  'this', 'that', 'your', 'you', 'for', 'from', 'at', 'by', 'as', 'are', 'be',
  'one', 'per',
]);

const GENERIC_FILLER_PHRASES = [
  'premium quality',
  'perfect choice',
  'perfect for',
  'dependable choice',
  'practical choice',
  'ideal choice',
  'made for people who',
  'regular household use',
  'top quality',
  'highest quality',
  'best in class',
  'unmatched quality',
  'exceptional quality',
];

// A time-of-day pattern list is deliberately conservative: it only flags
// phrases that FRAME the product as being for that time of day, not any
// passing word (e.g. a sentence that merely contains "morning" elsewhere).
const TIME_OF_DAY_PATTERNS: Record<string, RegExp[]> = {
  Morning: [
    /\bevery morning\b/i,
    /\bmorning routine\b/i,
    /\bstart(?:ing)? your day\b/i,
    /\bwake up\b/i,
    /\bmorning cup\b/i,
    /\bfirst thing in the morning\b/i,
  ],
  Evening: [
    /\bevery evening\b/i,
    /\bevening cup\b/i,
    /\bwind down\b/i,
    /\bnightcap\b/i,
    /\bend(?:ing)? your day\b/i,
  ],
  Noon: [/\bmidday\b/i, /\bafternoon (?:cup|break)\b/i, /\blunch(?:time)?\b/i],
};

// Phrasing that implies a single/exclusive pack size ("available in a 1kg
// pack"). A plain factual statement about one size ("a 1kg pack gives 400
// cups") is NOT matched — only wording that reads as describing how the
// product is sold/packaged overall.
const PACK_EXCLUSIVITY_PATTERNS = [
  /\bavailable in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bcomes in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bsold in an?\s+[\w.]+\s*(?:kg|g|gm|ml|l)\b/i,
  /\bonly (?:available )?in\b/i,
];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function toWords(text: string): string[] {
  return normalize(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return normalize(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The same 5+ word phrase, containing a real content word, stated more than once. */
function findRepeatedPhrase(draft: string, gramSize = 5): string | null {
  const w = toWords(draft);
  const seen = new Set<string>();
  for (let i = 0; i + gramSize <= w.length; i++) {
    const gram = w.slice(i, i + gramSize);
    if (!gram.some((word) => word.length >= 5 && !STOPWORDS.has(word))) continue;
    const key = gram.join(' ');
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

export function evaluateProductDraftQuality(
  evidence: ProductContentEvidence,
  draft: string,
): string[] {
  const errors: string[] = [];
  const normalizedDraft = normalize(draft);

  // 1. Material repetition — same fact/benefit phrase stated more than once.
  const repeated = findRepeatedPhrase(normalizedDraft);
  if (repeated) {
    errors.push(`Draft repeats the same phrase more than once: "${repeated}"`);
  }

  // 2. Internal time-of-day contradiction against bestTakenFor.
  const allowedTimes = new Set(evidence.bestTakenFor);
  for (const [timeOfDay, patterns] of Object.entries(TIME_OF_DAY_PATTERNS)) {
    if (allowedTimes.has(timeOfDay)) continue;
    if (patterns.some((re) => re.test(normalizedDraft))) {
      errors.push(
        `Draft frames the product for "${timeOfDay}" but bestTakenFor is [${evidence.bestTakenFor.join(', ') || 'none'}]`,
      );
      break;
    }
  }

  // 3. Misleading pack-exclusivity omission.
  if (evidence.packOptions.length > 1 && PACK_EXCLUSIVITY_PATTERNS.some((re) => re.test(normalizedDraft))) {
    errors.push('Draft implies a single/exclusive pack size while multiple active pack sizes exist');
  }

  // 4. Low material improvement — most draft sentences are verbatim reuses
  //    of sentences already in the current description (a reshuffle, not a
  //    rewrite). Distinct from the separate added-words check elsewhere.
  const currentSentences = new Set(splitSentences(evidence.description).map((s) => s.toLowerCase()));
  const draftSentences = splitSentences(draft);
  if (draftSentences.length && currentSentences.size) {
    const reused = draftSentences.filter((s) => currentSentences.has(s.toLowerCase()));
    if (reused.length / draftSentences.length > 0.5) {
      errors.push('Draft mostly reorganizes existing sentences verbatim rather than materially rewriting the content');
    }
  }

  // 5. Generic SEO filler that isn't grounded in evidence.
  const evidenceText = normalize([evidence.description, evidence.shortDescription ?? ''].join(' ')).toLowerCase();
  const lowerDraft = normalizedDraft.toLowerCase();
  for (const phrase of GENERIC_FILLER_PHRASES) {
    if (lowerDraft.includes(phrase) && !evidenceText.includes(phrase)) {
      errors.push(`Draft uses unsupported generic filler phrase: "${phrase}"`);
    }
  }

  // 6. Excessive product-name repetition — should read naturally, not mechanically.
  const nameCount = countOccurrences(normalizedDraft, evidence.name);
  if (nameCount > 2) {
    errors.push(`Product name repeated ${nameCount} times in the draft — should appear naturally, not mechanically`);
  }

  return errors;
}
