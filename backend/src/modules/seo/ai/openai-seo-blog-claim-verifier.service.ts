import OpenAI from 'openai';
import { ArticlePlan, BlogContentEvidence } from './blog-ai.types';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

export interface BlogClaimVerificationResult {
  verified: boolean;
  supportedClaims: string[];
  unsupportedClaims: string[];
  questionableClaims: string[];
  misleadingImplications: string[];
  contradictions: string[];
  cannibalizationConcerns: string[];
  internalLinkConcerns: string[];
  notes: string[];
}

/**
 * Phase 6.7A Part F — independent factual verifier for autonomously drafted
 * articles. Receives ONLY the evidence bundle, the plan, and the proposed
 * article — never the writer's own reasoning/notes/claimsUsed — mirroring
 * openai-seo-claim-verifier.service.ts's "did not write the draft" contract.
 */
export async function verifyBlogDraftClaims(opts: {
  evidence: BlogContentEvidence;
  plan: ArticlePlan;
  title: string;
  h1: string;
  contentHtml: string;
  proposedLinks: { href: string; anchor: string }[];
}): Promise<BlogClaimVerificationResult> {
  const client = getClient();

  const response = await client.responses.create({
    model: MODEL,

    instructions: `
You are an independent factual verifier for a long-form article.

You did NOT write this article.

Compare ARTICLE against EVIDENCE and PLAN and identify every problem.

STRICT RULES:
1. EVIDENCE is the only factual authority. PLAN.allowedLinkTargets is the
   only authority for which internal links are acceptable.
2. Do not use outside knowledge — no geography, climate, history, science,
   or health facts beyond what EVIDENCE states, even if you believe them to
   be generally true.
3. A reasonable rephrasing of an evidence fact is supported.
4. New origins, grades, certifications, estates, manufacturing methods,
   health benefits, scientific claims, or historical claims not in EVIDENCE
   are unsupported.
5. misleadingImplications: a statement that is technically true in isolation
   but implies something broader/exclusive the evidence doesn't support
   (e.g. implying one pack size is the only one, or implying a competing
   recommended time of day).
6. contradictions: any statement that conflicts with another part of
   EVIDENCE or with another part of the article itself.
7. cannibalizationConcerns: any part of ARTICLE that substantially restates
   content plan.topicsToAvoid says is already covered elsewhere.
8. internalLinkConcerns: any proposedLinks entry whose href is not in
   plan.allowedLinkTargets, or whose anchor text does not genuinely relate
   to the surrounding sentence and the link's own destination topic.
9. Be conservative — when in doubt, flag it.
10. verified=true ONLY when unsupportedClaims, questionableClaims,
    misleadingImplications, contradictions, cannibalizationConcerns, and
    internalLinkConcerns are ALL empty.

Return JSON only.
    `.trim(),

    input: JSON.stringify({
      evidence: opts.evidence,
      plan: opts.plan,
      article: {
        title: opts.title,
        h1: opts.h1,
        contentHtml: opts.contentHtml,
        proposedLinks: opts.proposedLinks,
      },
    }),

    text: {
      format: {
        type: 'json_schema',
        name: 'blog_claim_verification',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            verified: { type: 'boolean' },
            supportedClaims: { type: 'array', items: { type: 'string' } },
            unsupportedClaims: { type: 'array', items: { type: 'string' } },
            questionableClaims: { type: 'array', items: { type: 'string' } },
            misleadingImplications: { type: 'array', items: { type: 'string' } },
            contradictions: { type: 'array', items: { type: 'string' } },
            cannibalizationConcerns: { type: 'array', items: { type: 'string' } },
            internalLinkConcerns: { type: 'array', items: { type: 'string' } },
            notes: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'verified',
            'supportedClaims',
            'unsupportedClaims',
            'questionableClaims',
            'misleadingImplications',
            'contradictions',
            'cannibalizationConcerns',
            'internalLinkConcerns',
            'notes',
          ],
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error('Blog claim verifier returned no structured output');
  }

  const result = JSON.parse(response.output_text) as BlogClaimVerificationResult;

  // Never trust model-provided verified=true when its own arrays disagree.
  result.verified =
    result.unsupportedClaims.length === 0 &&
    result.questionableClaims.length === 0 &&
    result.misleadingImplications.length === 0 &&
    result.contradictions.length === 0 &&
    result.cannibalizationConcerns.length === 0 &&
    result.internalLinkConcerns.length === 0;

  return result;
}
