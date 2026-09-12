import { GroundedBlogDraft } from './blog-ai.types';
import { BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';
import { MAX_PRODUCT_NAME_MENTIONS, MAX_BRAND_MENTIONS } from './blog-draft-quality-rules';

/**
 * Phase 6.7B/C Part A/B — repair must be a TARGETED correction, never a free
 * rewrite. These are the fields a repair pass is allowed to touch, derived
 * deterministically from exactly which deterministic/verifier failures were
 * raised — never a guess. Every other field is force-preserved from the
 * original draft after repair returns (see mergeRepairedDraft below).
 */
export type BlogDraftField = 'title' | 'slug' | 'metaTitle' | 'metaDescription' | 'h1' | 'body' | 'links';

const REQUIRED_FIELDS: BlogDraftField[] = ['title', 'slug', 'metaTitle', 'metaDescription', 'h1', 'body'];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}
function toWords(text: string): string[] {
  return normalizeText(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function splitSentences(text: string): string[] {
  return normalizeText(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
function countOccurrences(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

/** Every 6+ word phrase (containing a real content word) that occurs more than once. */
function findAllRepeatedPhrases(text: string, gramSize = 6): string[] {
  const w = toWords(text);
  const counts = new Map<string, number>();
  for (let i = 0; i + gramSize <= w.length; i++) {
    const gram = w.slice(i, i + gramSize);
    if (!gram.some((word) => word.length >= 5)) continue;
    const key = gram.join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([phrase]) => phrase);
}

/** Every 4-word sentence OPENING that recurs across more than one sentence — catches "Rajhans Royal Darjeeling is grown..." repeated as a sentence template even when the rest of the sentence differs. */
function findRepeatedSentenceOpenings(text: string, openingWords = 4): string[] {
  const sentences = splitSentences(text);
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const words = toWords(s).slice(0, openingWords);
    if (words.length < openingWords) continue;
    const key = words.join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([phrase]) => phrase);
}

/**
 * Phase 6.7C Part A — a COMPLETE, deterministic repetition snapshot of a
 * draft's body, computed unconditionally before every repair call (not just
 * when repetition happened to be the original failure). This is what makes
 * it possible to instruct repair "do not increase repetition while you fix
 * something else" instead of only ever reacting after the fact.
 */
export interface RepetitionProfile {
  productName: string | null;
  productNameCount: number;
  productNameThreshold: number;
  brandCount: number;
  brandThreshold: number;
  repeatedPhrases: string[];
  repeatedSentenceOpenings: string[];
}

export function computeRepetitionProfile(contentHtml: string, productName: string | null): RepetitionProfile {
  const plainBody = normalizeText(stripTags(contentHtml ?? ''));
  return {
    productName,
    productNameCount: productName ? countOccurrences(plainBody, productName) : 0,
    productNameThreshold: MAX_PRODUCT_NAME_MENTIONS,
    brandCount: countOccurrences(plainBody, 'Rajhans'),
    brandThreshold: MAX_BRAND_MENTIONS,
    repeatedPhrases: findAllRepeatedPhrases(plainBody),
    repeatedSentenceOpenings: findRepeatedSentenceOpenings(plainBody),
  };
}

/** Which fields a given deterministic-validation error message implicates. */
function classifyDeterministicError(message: string): BlogDraftField[] {
  const lower = message.toLowerCase();
  const fields: BlogDraftField[] = [];
  if (lower.includes('metatitle')) fields.push('metaTitle');
  if (lower.includes('metadescription')) fields.push('metaDescription');
  if (lower.includes('h1')) fields.push('h1', 'body');
  if (lower.includes('link')) fields.push('links', 'body'); // an embedded <a> tag lives inside contentHtml — fixing a link problem always requires editing the body
  if (
    lower.includes('repeat') ||
    lower.includes('filler') ||
    lower.includes('health') ||
    lower.includes('claim pattern') ||
    lower.includes('exclusive pack size') ||
    lower.includes('recommends the product for') ||
    lower.includes('promotional') ||
    lower.includes('overlaps existing post') ||
    lower.includes('unsafe or malformed') ||
    lower.includes('heading')
  ) {
    fields.push('body');
  }
  return fields.length ? fields : ['body']; // fail-safe: an unclassified error is treated as a body problem, never silently ignored
}

export interface RepairGuidance {
  /** The exact, closed set of fields repair is authorized to change. */
  fieldsToFix: BlogDraftField[];
  /** Everything else — repair must leave these exactly as they are. */
  fieldsToPreserve: BlogDraftField[];
  /** Verbatim deterministic failure messages, for the repair prompt. */
  deterministicFailures: string[];
  /** Verbatim verifier failure messages, for the repair prompt. */
  verifierFailures: string[];
  /** Precise, numeric repetition guidance — never vague ("reduce repetition"). Always populated (Part A), regardless of whether repetition was the original failure. */
  repetitionNotes: string[];
  /** The raw profile the notes above were derived from — also handed to the repair prompt directly. */
  repetitionProfile: RepetitionProfile;
}

/**
 * Deterministically computes exactly what a repair pass is allowed to touch
 * and a COMPLETE repetition profile + guidance (Part A) — built BEFORE the
 * repair call so the prompt can cite exact counts/thresholds and an explicit
 * "do not increase" instruction, whether or not repetition was itself the
 * reason repair is running.
 */
export function buildRepairGuidance(opts: {
  draft: GroundedBlogDraft;
  productName: string | null;
  deterministicErrors: string[];
  verification: BlogClaimVerificationResult;
}): RepairGuidance {
  const { draft, productName, deterministicErrors, verification } = opts;

  const implicated = new Set<BlogDraftField>();
  for (const err of deterministicErrors) {
    for (const field of classifyDeterministicError(err)) implicated.add(field);
  }
  if (
    verification.unsupportedClaims.length ||
    verification.questionableClaims.length ||
    verification.misleadingImplications.length ||
    verification.contradictions.length ||
    verification.cannibalizationConcerns.length
  ) {
    implicated.add('body');
  }
  if (verification.internalLinkConcerns.length) {
    implicated.add('links');
    implicated.add('body'); // the flagged <a> tag lives inside contentHtml
  }

  const fieldsToFix = [...implicated];
  const fieldsToPreserve = (['title', 'slug', 'metaTitle', 'metaDescription', 'h1', 'body', 'links'] as BlogDraftField[]).filter(
    (f) => !implicated.has(f),
  );

  const profile = computeRepetitionProfile(draft.contentHtml ?? '', productName);

  // Part A — ALWAYS populated, never conditional on repetition being the
  // original failure.
  const repetitionNotes: string[] = [
    `Current repetition profile: product name "${profile.productName ?? 'n/a'}" appears ${profile.productNameCount}/${profile.productNameThreshold} (max) times; brand "Rajhans" appears ${profile.brandCount}/${profile.brandThreshold} (max) times. Do NOT increase either count unnecessarily while making your fix — the repaired wording must remain AT OR BELOW these thresholds.`,
  ];
  if (profile.repeatedPhrases.length) {
    repetitionNotes.push(
      `These phrases already recur and must be resolved (not reproduced again): ${profile.repeatedPhrases.map((p) => `"${p}"`).join('; ')}.`,
    );
  }
  if (profile.repeatedSentenceOpenings.length) {
    repetitionNotes.push(
      `These sentence openings/templates already recur and must not be reused a third time: ${profile.repeatedSentenceOpenings.map((p) => `"${p}..."`).join('; ')}.`,
    );
  }
  repetitionNotes.push(
    'Do not duplicate any existing sentence opening or 6+ word phrase anywhere else in the article — check your new/edited sentences against the REST of the unchanged body before returning.',
  );
  repetitionNotes.push('Preserve natural prose; do not mechanically replace every mention of the product/brand name — only reduce genuine over-repetition.');

  return {
    fieldsToFix,
    fieldsToPreserve,
    deterministicFailures: deterministicErrors,
    verifierFailures: [
      ...verification.unsupportedClaims,
      ...verification.questionableClaims,
      ...verification.misleadingImplications,
      ...verification.contradictions,
      ...verification.cannibalizationConcerns,
      ...verification.internalLinkConcerns,
    ],
    repetitionNotes,
    repetitionProfile: profile,
  };
}

/**
 * Force-preserves every field NOT implicated by the guidance's fieldsToFix,
 * taking the ORIGINAL draft's exact value regardless of what repair
 * returned for it. This is what makes repair a targeted correction rather
 * than a free rewrite: a repair pass fixing only a repeated phrase in the
 * body can never silently drop/alter metaTitle, metaDescription, title,
 * slug, or h1 — even if the model tried to.
 */
export function mergeRepairedDraft(original: GroundedBlogDraft, repaired: GroundedBlogDraft, guidance: RepairGuidance): GroundedBlogDraft {
  const preserve = new Set(guidance.fieldsToPreserve);
  return {
    status: repaired.status,
    title: preserve.has('title') ? original.title : repaired.title,
    slug: preserve.has('slug') ? original.slug : repaired.slug,
    metaTitle: preserve.has('metaTitle') ? original.metaTitle : repaired.metaTitle,
    metaDescription: preserve.has('metaDescription') ? original.metaDescription : repaired.metaDescription,
    h1: preserve.has('h1') ? original.h1 : repaired.h1,
    contentHtml: preserve.has('body') ? original.contentHtml : repaired.contentHtml,
    proposedLinks: preserve.has('links') ? original.proposedLinks : repaired.proposedLinks,
    claimsUsed: repaired.claimsUsed,
    unsupportedClaims: repaired.unsupportedClaims,
    notes: repaired.notes,
  };
}

/** Every REQUIRED field that is missing/empty after a merge — repair output must never be silently accepted with a gap. */
export function missingRequiredFields(draft: GroundedBlogDraft): BlogDraftField[] {
  const missing: BlogDraftField[] = [];
  if (!draft.title?.trim()) missing.push('title');
  if (!draft.slug?.trim()) missing.push('slug');
  if (!draft.metaTitle?.trim()) missing.push('metaTitle');
  if (!draft.metaDescription?.trim()) missing.push('metaDescription');
  if (!draft.h1?.trim()) missing.push('h1');
  if (!draft.contentHtml?.trim()) missing.push('body');
  return missing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6.7C Part B/C — post-repair failure classification and the ONE
// bounded cleanup-repair eligibility gate.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostRepairClassification {
  /** Failures present before repair that STILL exist after repair — repair did not fix the original problem. */
  persistedFailures: string[];
  /** Failures present before repair that are GONE after repair. */
  resolvedFailures: string[];
  /** Failures that were NOT present before repair — introduced (or exposed) by the repair pass itself. */
  newFailures: string[];
}

export function classifyPostRepairFailures(originalErrors: string[], postRepairErrors: string[]): PostRepairClassification {
  const originalSet = new Set(originalErrors);
  const postSet = new Set(postRepairErrors);
  return {
    persistedFailures: originalErrors.filter((e) => postSet.has(e)),
    resolvedFailures: originalErrors.filter((e) => !postSet.has(e)),
    newFailures: postRepairErrors.filter((e) => !originalSet.has(e)),
  };
}

/**
 * Deterministic-only defect classes a SINGLE, surgical cleanup repair is
 * allowed to touch — repetition, duplicated phrasing, heading-structure
 * defects, and meta-field format issues. Deliberately EXCLUDES anything
 * that could represent an unresolved factual-grounding problem (unsupported
 * claims, external/off-plan links, health/superlative patterns, promotional
 * content, pack/bestTakenFor framing, cross-corpus overlap, unsafe markup)
 * — those must never be "cleaned up" via a bonus repair attempt.
 */
const CLEANUP_ELIGIBLE_PATTERNS: RegExp[] = [
  /repeats? the same phrase/i,
  /duplicated as a body heading/i,
  /repeated verbatim in the article body/i,
  /too few h2 sections/i,
  /h3 headings with no parent h2/i,
  /metatitle is missing or an unreasonable length/i,
  /metadescription is missing or an unreasonable length/i,
];

/**
 * True only when EVERY post-repair failure is both NEW (repair-introduced,
 * not a persisted original problem) and a deterministic, mechanically
 * fixable defect class. If any original failure persisted, or any failure
 * falls outside the whitelist above, cleanup is not attempted — the run
 * terminates as a failed generation instead (Part C: never retry unresolved
 * grounding failures via cleanup).
 */
export function isCleanupEligible(classification: PostRepairClassification): boolean {
  if (classification.persistedFailures.length > 0) return false;
  if (classification.newFailures.length === 0) return false;
  return classification.newFailures.every((f) => CLEANUP_ELIGIBLE_PATTERNS.some((p) => p.test(f)));
}

export { REQUIRED_FIELDS };
