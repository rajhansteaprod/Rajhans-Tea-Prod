import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft, GroundedBlogDraftResult } from './blog-ai.types';
import { writeGroundedBlogDraft } from './openai-seo-blog-writer.service';
import { verifyBlogDraftClaims, BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';
import { repairGroundedBlogDraft } from './openai-seo-blog-repair.service';
import { evaluateBlogDraftQuality } from './blog-draft-quality-rules';

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
 * Phase 6.7A — autonomous grounded long-form article drafting. Same
 * philosophy as generateGroundedProductDraft: writer → deterministic
 * validation → independent verifier → repair-if-needed → second verifier,
 * with a hard cap of 4 OpenAI calls total (writer + verifier, plus at most
 * one repair + second verifier). No uncontrolled retry loop: exactly one
 * repair attempt, ever — if the repaired draft still fails, no executable
 * draft is returned.
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

    // ---- Repair path (at most once) ----
    const repaired = await repairGroundedBlogDraft({ evidence, plan, draft, verification });
    openaiCallCount++;

    if (repaired.status === 'insufficient_evidence' || !repaired.contentHtml || !repaired.title || !repaired.slug || !repaired.h1) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        output: repaired,
        disposition: 'rejected',
        error: 'Repair could not produce a sufficiently grounded article',
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
      // No uncontrolled retry loop — exactly one repair attempt. Still not
      // grounded after repair ⇒ no executable draft is ever returned.
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
        notes: [...repaired.notes, ...secondVerification.notes, 'Initial draft required repair; repaired article passed independent factual verification.'],
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
