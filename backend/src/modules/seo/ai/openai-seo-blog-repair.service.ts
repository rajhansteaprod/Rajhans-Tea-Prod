import OpenAI from 'openai';
import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from './blog-ai.types';
import { RepairGuidance } from './blog-repair-guidance';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

/**
 * Phase 6.7B — TARGETED repair, not a free rewrite. `guidance.fieldsToFix`
 * is the exact, closed set of fields this pass may change; everything else
 * is force-preserved from the original draft by the caller regardless of
 * what this call returns (see blog-repair-guidance.ts mergeRepairedDraft) —
 * so the model is told explicitly which fields NOT to bother touching, but
 * the actual safety guarantee is enforced in code, not by the prompt alone.
 */
export async function repairGroundedBlogDraft(opts: {
  evidence: BlogContentEvidence;
  plan: ArticlePlan;
  draft: GroundedBlogDraft;
  guidance: RepairGuidance;
}): Promise<GroundedBlogDraft> {
  const client = getClient();

  const response = await client.responses.create({
    model: MODEL,

    instructions: `
You are making a TARGETED repair to a long-form article that failed validation.

This is NOT a free rewrite. You are NOT being asked to create new ideas.

fieldsToFix lists EXACTLY which fields need a change: ${opts.guidance.fieldsToFix.join(', ') || '(none — should not happen)'}.
fieldsToPreserve lists fields that already passed validation and are UNRELATED
to the detected problems: ${opts.guidance.fieldsToPreserve.join(', ')}.

Your job:
1. Return ALL fields (title, slug, metaTitle, metaDescription, h1,
   contentHtml, proposedLinks) — the full article contract.
2. For every field in fieldsToPreserve, return it EXACTLY as it appears in
   currentDraft, character-for-character. Do not "improve", shorten,
   reword, or drop it — even if you think it could be better.
3. For every field in fieldsToFix, make the MINIMAL change that resolves
   the listed deterministicFailures/verifierFailures/repetitionNotes.
   Preserve every other sentence/fact in that field that is NOT implicated.
4. If a repetition note gives an exact over-repeated term and count, fix
   THAT exact overuse — replace only the excess mentions with natural
   alternatives ("the tea", "this tea", the region/category name), only
   where it reads naturally. Never mechanically find-and-replace in a way
   that makes a sentence awkward — rewrite the sentence instead if needed.
5. Use ONLY the supplied EVIDENCE and PLAN. Do not introduce new topics,
   benefits, occasions, comparisons, facts, or internal links outside
   PLAN.allowedLinkTargets.
6. Do not pad the copy merely to increase length.
7. Every one of title/slug/metaTitle/metaDescription/h1/contentHtml MUST be
   present and non-empty in your response — never omit a field.

Return JSON only.
    `.trim(),

    input: JSON.stringify({
      evidence: opts.evidence,
      plan: opts.plan,
      currentDraft: opts.draft,
      fieldsToFix: opts.guidance.fieldsToFix,
      fieldsToPreserve: opts.guidance.fieldsToPreserve,
      deterministicFailures: opts.guidance.deterministicFailures,
      verifierFailures: opts.guidance.verifierFailures,
      repetitionNotes: opts.guidance.repetitionNotes,
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
