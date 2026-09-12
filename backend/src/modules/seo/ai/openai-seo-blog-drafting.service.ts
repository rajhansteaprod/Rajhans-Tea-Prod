import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft, GroundedBlogDraftResult, RepairDiagnostics } from './blog-ai.types';
import { writeGroundedBlogDraft } from './openai-seo-blog-writer.service';
import { verifyBlogDraftClaims, BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';
import { repairGroundedBlogDraft } from './openai-seo-blog-repair.service';
import { evaluateBlogDraftQuality } from './blog-draft-quality-rules';
import { buildRepairGuidance, mergeRepairedDraft, missingRequiredFields, classifyPostRepairFailures, isCleanupEligible } from './blog-repair-guidance';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

/** Thin wrapper so tests can assert "final verifier" without re-deriving the article/link shape from a GroundedBlogDraft each time. */
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

function emptyVerification(): BlogClaimVerificationResult {
  return {
    verified: true,
    supportedClaims: [],
    unsupportedClaims: [],
    questionableClaims: [],
    misleadingImplications: [],
    contradictions: [],
    cannibalizationConcerns: [],
    internalLinkConcerns: [],
    notes: [],
  };
}

function rejected(opts: {
  evidence: BlogContentEvidence;
  plan: ArticlePlan;
  output: GroundedBlogDraft | null;
  error: string;
  openaiCallCount: number;
  disposition?: 'rejected' | 'no_material_content_opportunity';
  diagnostics?: RepairDiagnostics;
}): GroundedBlogDraftResult {
  return {
    ok: false,
    provider: 'openai',
    model: MODEL,
    evidence: opts.evidence,
    plan: opts.plan,
    output: opts.output,
    disposition: opts.disposition ?? 'rejected',
    error: opts.error,
    openaiCallCount: opts.openaiCallCount,
    readyForHumanReview: false,
    diagnostics: opts.diagnostics,
  };
}

/**
 * Phase 6.7A/B/C — autonomous grounded long-form article drafting.
 *
 * Bounded call policy (never a loop, never a second writer attempt):
 *   1. writer                                              — always
 *   2. verifier                                             — always
 *   3. repair                    (only if step 1/2 failed)
 *   4. final verifier            (only if repair passed deterministic validation cleanly)
 *   4'. ONE cleanup repair       (only if repair passed but introduced a NEW,
 *                                 whitelisted, deterministic-only defect — see
 *                                 blog-repair-guidance.ts isCleanupEligible)
 *   5. final verifier            (only after a successful cleanup)
 *
 * Absolute maximum 5 calls. A failed cleanup terminates immediately (no 5th
 * call). An unresolved factual-grounding failure (persisted from the
 * original draft, or outside the cleanup whitelist) also terminates
 * immediately after repair (3 calls) — it is NEVER retried via cleanup.
 */
export async function generateGroundedBlogDraft(evidence: BlogContentEvidence, plan: ArticlePlan): Promise<GroundedBlogDraftResult> {
  let openaiCallCount = 0;

  try {
    const draft = await writeGroundedBlogDraft(evidence, plan);
    openaiCallCount++;

    if (draft.status === 'insufficient_evidence' || !draft.contentHtml || !draft.title || !draft.slug || !draft.h1) {
      return rejected({
        evidence,
        plan,
        output: draft,
        error: 'Writer judged the evidence/plan insufficient for a genuinely useful, distinct article',
        openaiCallCount,
        disposition: 'no_material_content_opportunity',
      });
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
        readyForHumanReview: true,
        output: { ...draft, notes: [...draft.notes, ...verification.notes, 'Passed independent factual verification on first attempt.'] },
        openaiCallCount,
      };
    }

    // ---- Repair (call 3) — targeted, field-preserving, always given a complete repetition profile ----
    const guidance = buildRepairGuidance({
      draft,
      productName: evidence.product?.name ?? null,
      deterministicErrors: firstDetErrors,
      verification,
    });

    const repairedRaw = await repairGroundedBlogDraft({ evidence, plan, draft, guidance });
    openaiCallCount++;

    if (repairedRaw.status === 'insufficient_evidence') {
      return rejected({ evidence, plan, output: repairedRaw, error: 'Repair judged the article could not be sufficiently grounded', openaiCallCount });
    }

    let candidate = mergeRepairedDraft(draft, repairedRaw, guidance);
    const missingAfterRepair = missingRequiredFields(candidate);
    if (missingAfterRepair.length) {
      return rejected({ evidence, plan, output: candidate, error: `Repair output is missing required field(s): ${missingAfterRepair.join(', ')}`, openaiCallCount });
    }

    // ---- Part B — full deterministic re-validation always runs post-repair ----
    let postRepairErrors = evaluateBlogDraftQuality(evidence, plan, candidate);

    if (postRepairErrors.length === 0) {
      // Normal repair path (4 calls): deterministic gate is clean -> final verifier.
      const finalVerification = await verifyDraft(evidence, plan, candidate);
      openaiCallCount++;
      if (!finalVerification.verified) {
        const problems = collectVerifierProblems(finalVerification);
        return rejected({
          evidence,
          plan,
          output: { ...candidate, unsupportedClaims: problems },
          error: `Repaired article still failed independent factual verification: ${problems.join(' | ')}`,
          openaiCallCount,
        });
      }
      return {
        ok: true,
        provider: 'openai',
        model: MODEL,
        evidence,
        plan,
        disposition: 'draft_ready',
        readyForHumanReview: true,
        output: { ...candidate, unsupportedClaims: [], notes: [...candidate.notes, ...finalVerification.notes, 'Initial draft required a targeted repair; repaired article passed independent factual verification.'] },
        openaiCallCount,
      };
    }

    // ---- Part B/C — classify post-repair failures before deciding on cleanup ----
    const classification = classifyPostRepairFailures(firstDetErrors, postRepairErrors);
    const diagnosticsBase: RepairDiagnostics = {
      originalFailures: firstDetErrors,
      repairNotes: repairedRaw.notes,
      postRepairFailures: postRepairErrors,
      newFailures: classification.newFailures,
      persistedFailures: classification.persistedFailures,
      resolvedFailures: classification.resolvedFailures,
      cleanupAttempted: false,
    };

    if (!isCleanupEligible(classification)) {
      // Either an original (unresolved factual-grounding) failure persisted,
      // or a new failure falls outside the deterministic cleanup whitelist.
      // Never retried via cleanup — terminate as a failed generation (3 calls).
      return rejected({
        evidence,
        plan,
        output: candidate,
        error: `Repaired article failed deterministic validation: ${postRepairErrors.join('; ')}`,
        openaiCallCount,
        diagnostics: diagnosticsBase,
      });
    }

    // ---- Part C — ONE bounded, surgical cleanup repair (call 4) ----
    const cleanupGuidance = buildRepairGuidance({
      draft: candidate,
      productName: evidence.product?.name ?? null,
      deterministicErrors: classification.newFailures,
      verification: emptyVerification(),
    });

    const cleanedRaw = await repairGroundedBlogDraft({ evidence, plan, draft: candidate, guidance: cleanupGuidance });
    openaiCallCount++;
    diagnosticsBase.cleanupAttempted = true;

    if (cleanedRaw.status === 'insufficient_evidence') {
      return rejected({ evidence, plan, output: candidate, error: 'Cleanup repair judged the article could not be sufficiently grounded', openaiCallCount, diagnostics: diagnosticsBase });
    }

    const cleaned = mergeRepairedDraft(candidate, cleanedRaw, cleanupGuidance);
    const missingAfterCleanup = missingRequiredFields(cleaned);
    if (missingAfterCleanup.length) {
      return rejected({
        evidence,
        plan,
        output: cleaned,
        error: `Cleanup repair output is missing required field(s): ${missingAfterCleanup.join(', ')}`,
        openaiCallCount,
        diagnostics: diagnosticsBase,
      });
    }

    const cleanupErrors = evaluateBlogDraftQuality(evidence, plan, cleaned);
    if (cleanupErrors.length) {
      // Failed cleanup terminates immediately — no final verifier call (Part C).
      diagnosticsBase.cleanupFailures = cleanupErrors;
      return rejected({
        evidence,
        plan,
        output: cleaned,
        error: `Cleanup repair failed deterministic validation: ${cleanupErrors.join('; ')}`,
        openaiCallCount,
        diagnostics: diagnosticsBase,
      });
    }

    // ---- Cleanup succeeded deterministically -> final verifier (call 5) ----
    const finalVerification = await verifyDraft(evidence, plan, cleaned);
    openaiCallCount++;
    if (!finalVerification.verified) {
      const problems = collectVerifierProblems(finalVerification);
      return rejected({
        evidence,
        plan,
        output: { ...cleaned, unsupportedClaims: problems },
        error: `Cleaned-up article still failed independent factual verification: ${problems.join(' | ')}`,
        openaiCallCount,
        diagnostics: diagnosticsBase,
      });
    }

    return {
      ok: true,
      provider: 'openai',
      model: MODEL,
      evidence,
      plan,
      disposition: 'draft_ready',
      readyForHumanReview: true,
      output: {
        ...cleaned,
        unsupportedClaims: [],
        notes: [...cleaned.notes, ...finalVerification.notes, 'Initial repair introduced a new deterministic defect; one bounded cleanup repair resolved it and the article passed independent factual verification.'],
      },
      openaiCallCount,
      diagnostics: diagnosticsBase,
    };
  } catch (err) {
    return rejected({ evidence, plan, output: null, error: err instanceof Error ? err.message : String(err), openaiCallCount });
  }
}

function collectVerifierProblems(v: BlogClaimVerificationResult): string[] {
  return [...v.unsupportedClaims, ...v.questionableClaims, ...v.misleadingImplications, ...v.contradictions, ...v.cannibalizationConcerns, ...v.internalLinkConcerns];
}
