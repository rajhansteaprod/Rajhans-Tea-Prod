import { GroundedBlogDraft } from './blog-ai.types';
import { BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';
import { MAX_PRODUCT_NAME_MENTIONS, MAX_BRAND_MENTIONS } from './blog-draft-quality-rules';

/**
 * Phase 6.7B Part A/B — repair must be a TARGETED correction, never a free
 * rewrite. These are the fields a repair pass is allowed to touch, derived
 * deterministically from exactly which deterministic/verifier failures were
 * raised — never a guess. Every other field is force-preserved from the
 * original draft after repair returns (see mergeRepairedDraft below).
 */
export type BlogDraftField = 'title' | 'slug' | 'metaTitle' | 'metaDescription' | 'h1' | 'body' | 'links';

const REQUIRED_FIELDS: BlogDraftField[] = ['title', 'slug', 'metaTitle', 'metaDescription', 'h1', 'body'];

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
  /** Precise, numeric repetition guidance — never vague ("reduce repetition"). */
  repetitionNotes: string[];
}

/**
 * Deterministically computes exactly what a repair pass is allowed to touch
 * and precise, numeric repetition guidance (Part B) — built BEFORE the
 * repair call so the prompt can cite exact counts/thresholds rather than
 * leaving the model to guess.
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

  const repetitionNotes: string[] = [];
  const body = draft.contentHtml ?? '';
  if (productName) {
    const count = (body.match(new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? []).length;
    if (count > MAX_PRODUCT_NAME_MENTIONS) {
      repetitionNotes.push(
        `The product name "${productName}" appears ${count} times; the permitted maximum is ${MAX_PRODUCT_NAME_MENTIONS}. Replace the extra mentions with natural alternatives such as "the tea", "this tea", or the region/category name — only where it reads naturally. Do not mechanically find-and-replace if it makes a sentence awkward; rewrite the sentence instead.`,
      );
    }
  }
  const brandCount = (body.match(/Rajhans/gi) ?? []).length;
  if (brandCount > MAX_BRAND_MENTIONS) {
    repetitionNotes.push(
      `"Rajhans" appears ${brandCount} times; the permitted maximum is ${MAX_BRAND_MENTIONS}. Reduce to natural mentions only — do not remove the brand entirely, just avoid mechanical over-repetition.`,
    );
  }

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

export { REQUIRED_FIELDS };
