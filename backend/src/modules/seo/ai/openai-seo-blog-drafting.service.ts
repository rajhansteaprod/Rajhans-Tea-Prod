import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft, GroundedBlogDraftResult } from './blog-ai.types';
import { writeGroundedBlogDraft } from './openai-seo-blog-writer.service';
import { verifyBlogDraftClaims, BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';
import { repairGroundedBlogDraft } from './openai-seo-blog-repair.service';
import { evaluateBlogDraftQuality } from './blog-draft-quality-rules';
import { buildRepairGuidance, mergeRepairedDraft, missingRequiredFields } from './blog-repair-guidance';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

/** Thin wrapper so tests can assert "second verifier" without re-deriving the article/link shape from a GroundedBlogDraft each time. */
function verifyDraft(evidence: BlogContentEvidence, plan: ArticlePlan, draft: GroundedBlogDraft): Promise<BlogClaimVerificationResult> {
  return verifyBlogDraftClaims({
    evidence,
    plan,
    title: draft.title ?? '',
    h1: draft.h1 ?? '',
    contentHtml: draft.contentHtml ?? '',
    proposedLinks: draft.proposedLinks,
  });
}

/**
 * Phase 6.7A/B — autonomous grounded long-form article drafting. Writer →
 * deterministic validation → independent verifier → AT MOST ONE targeted
 * repair → deterministic re-validation → second verifier. Hard cap of 4
 * OpenAI calls total, enforced in code: exactly one writer call, one
 * verifier call, and (only if needed) one repair call + one second verifier
 * call — never a second writer attempt, never more than one repair. A
 * repair that comes back with a missing required field is rejected
 * immediately, without spending the second verifier call.
 */
export async function generateGroundedBlogDraft(evidence: BlogContentEvidence, plan: ArticlePlan): Promise<GroundedBlogDraftResult> {
  let openaiCallCount = 0;

  try {
    const draft = await writeGroundedBlogDraft(evidence, plan);
    openaiCallCount++;

    if (draft.status === 'insufficient_evidence' || !draft.contentHtml || !draft.title || !draft.slug || !draft.h1) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: draft,
        disposition: 'no_material_content_opportunity',
        error: 'Writer judged the evidence/plan insufficient for a genuinely useful, distinct article',
        openaiCallCount,
      };
    }

    const firstDetErrors = [...evaluateBlogDraftQuality(evidence, plan, draft), ...draft.unsupportedClaims.map((c) => `Writer self-reported unsupported claim: ${c}`)];

    const verification = await verifyDraft(evidence, plan, draft);
    openaiCallCount++;

    if (firstDetErrors.length === 0 && verification.verified) {
      return {
        ok: true,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        disposition: 'draft_ready',
        output: { ...draft, notes: [...draft.notes, ...verification.notes, 'Passed independent factual verification on first attempt.'] },
        openaiCallCount,
      };
    }

    // ---- Repair path (at most once, targeted, field-preserving) ----
    const guidance = buildRepairGuidance({
      draft,
      productName: evidence.product?.name ?? null,
      deterministicErrors: firstDetErrors,
      verification,
    });

    const repairedRaw = await repairGroundedBlogDraft({ evidence, plan, draft, guidance });
    openaiCallCount++;

    if (repairedRaw.status === 'insufficient_evidence') {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: repairedRaw,
        disposition: 'rejected',
        error: 'Repair judged the article could not be sufficiently grounded',
        openaiCallCount,
      };
    }

    // Force-preserve every field NOT implicated by the detected failures —
    // a repair pass fixing only the body can never silently drop/alter
    // metaTitle, metaDescription, title, slug, or h1.
    const repaired = mergeRepairedDraft(draft, repairedRaw, guidance);

    // Reject incomplete repair output immediately — never spend the second
    // verifier call on a draft that's already missing a required field.
    const missing = missingRequiredFields(repaired);
    if (missing.length) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: repaired,
        disposition: 'rejected',
        error: `Repair output is missing required field(s): ${missing.join(', ')}`,
        openaiCallCount,
      };
    }

    const repairedDetErrors = evaluateBlogDraftQuality(evidence, plan, repaired);
    if (repairedDetErrors.length) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: repaired,
        disposition: 'rejected',
        error: `Repaired article failed deterministic validation: ${repairedDetErrors.join('; ')}`,
        openaiCallCount,
      };
    }

    const secondVerification = await verifyDraft(evidence, plan, repaired);
    openaiCallCount++;

    if (!secondVerification.verified) {
      const problems = [
        ...secondVerification.unsupportedClaims,
        ...secondVerification.questionableClaims,
        ...secondVerification.misleadingImplications,
        ...secondVerification.contradictions,
        ...secondVerification.cannibalizationConcerns,
        ...secondVerification.internalLinkConcerns,
      ];
      // No uncontrolled retry loop — exactly one repair attempt, ever. Still
      // not grounded after repair ⇒ no executable draft is ever returned,
      // and no second writer attempt is ever started.
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: { ...repaired, unsupportedClaims: problems },
        disposition: 'rejected',
        error: `Repaired article still failed independent factual verification: ${problems.join(' | ')}`,
        openaiCallCount,
      };
    }

    return {
      ok: true,
      provider: 'openai',
      model: MODEL,
      evidence,
      plan,
      disposition: 'draft_ready',
      output: {
        ...repaired,
        unsupportedClaims: [],
        notes: [...repaired.notes, ...secondVerification.notes, 'Initial draft required a targeted repair; repaired article passed independent factual verification.'],
      },
      openaiCallCount,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'openai',
      model: MODEL,
      evidence,
      plan,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      openaiCallCount,
    };
  }
}
