import OpenAI from 'openai';
import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from './blog-ai.types';
import { BlogClaimVerificationResult } from './openai-seo-blog-claim-verifier.service';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

/**
 * Phase 6.7A — repairs an article that failed independent verification.
 * Preserves supported content, removes/rewrites every flagged problem, and
 * is never asked to invent new ideas — mirrors
 * openai-seo-draft-repair.service.ts's contract exactly.
 */
export async function repairGroundedBlogDraft(opts: {
  evidence: BlogContentEvidence;
  plan: ArticlePlan;
  draft: GroundedBlogDraft;
  verification: BlogClaimVerificationResult;
}): Promise<GroundedBlogDraft> {
  const client = getClient();

  const response = await client.responses.create({
    model: MODEL,

    instructions: `
You are repairing a long-form article that failed independent factual verification.

You are NOT being asked to create new ideas.

Your job:
1. Preserve all useful, supported content.
2. Remove or rewrite every rejected claim/implication/contradiction listed.
3. Remove or replace every internal link flagged in internalLinkConcerns —
   only hrefs in PLAN.allowedLinkTargets may remain.
4. Remove any content flagged as a cannibalization concern — link to the
   existing page instead of restating it, if that link is in
   PLAN.allowedLinkTargets.
5. Use ONLY the supplied EVIDENCE and PLAN.
6. Do not introduce new topics, benefits, occasions, comparisons, or facts.
7. Keep the same overall structure (H1 outside the body; 3-6 h2 sections)
   unless a section must be removed because it was entirely unsupported.
8. Do not pad the copy merely to increase length.
9. Return the FULL repaired article as structured JSON (same shape as the
   original draft) — not just the changed parts.

Return JSON only.
    `.trim(),

    input: JSON.stringify({
      evidence: opts.evidence,
      plan: opts.plan,
      currentDraft: opts.draft,
      verificationProblems: {
        unsupportedClaims: opts.verification.unsupportedClaims,
        questionableClaims: opts.verification.questionableClaims,
        misleadingImplications: opts.verification.misleadingImplications,
        contradictions: opts.verification.contradictions,
        cannibalizationConcerns: opts.verification.cannibalizationConcerns,
        internalLinkConcerns: opts.verification.internalLinkConcerns,
      },
    }),

    text: {
      format: {
        type: 'json_schema',
        name: 'repaired_blog_article',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['ok', 'insufficient_evidence'] },
            title: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            slug: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            metaTitle: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            metaDescription: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            h1: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            contentHtml: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            proposedLinks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { href: { type: 'string' }, anchor: { type: 'string' } },
                required: ['href', 'anchor'],
              },
            },
            claimsUsed: { type: 'array', items: { type: 'string' } },
            unsupportedClaims: { type: 'array', items: { type: 'string' } },
            notes: { type: 'array', items: { type: 'string' } },
          },
          required: ['status', 'title', 'slug', 'metaTitle', 'metaDescription', 'h1', 'contentHtml', 'proposedLinks', 'claimsUsed', 'unsupportedClaims', 'notes'],
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error('Blog repair returned no structured output');
  }

  return JSON.parse(response.output_text) as GroundedBlogDraft;
}
