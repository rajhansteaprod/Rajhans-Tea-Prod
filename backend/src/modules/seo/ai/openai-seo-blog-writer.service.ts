import OpenAI from 'openai';
import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from './blog-ai.types';

const MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5.6-luna';

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

/**
 * Phase 6.7A Part D — the autonomous long-form article writer. Mirrors
 * openai-seo-drafting.service.ts's grounding discipline exactly (evidence is
 * the ONLY factual authority), extended for full-article structure: title,
 * slug, metaTitle, metaDescription, H1, HTML body, and proposed internal
 * links drawn ONLY from the plan's deterministically pre-authorized set.
 */
export async function writeGroundedBlogDraft(evidence: BlogContentEvidence, plan: ArticlePlan): Promise<GroundedBlogDraft> {
  const client = getClient();

  const response = await client.responses.create({
    model: MODEL,

    instructions: `
You are an informational SEO article writer for Rajhans Tea.

Your ONLY factual authority is the supplied EVIDENCE JSON and the PLAN JSON.
The PLAN's allowedLinkTargets is the CLOSED set of internal links you may use — never link anywhere else.

Rules:
1. Never invent a factual claim. Do not add estates, grades, certifications,
   awards, harvest details, health benefits, manufacturing methods, pricing,
   origin details beyond EVIDENCE, cup counts, or sourcing practices unless
   explicitly present in EVIDENCE.
2. Write an INFORMATIONAL article that answers plan.primaryQuestion — not a
   sales page. The product link is allowed but must read as natural context,
   never a repeated call-to-action.
3. Do NOT cover any topic listed in plan.topicsToAvoid — link to the
   existing page that already covers it instead of restating it.
4. Only cover topics within plan.scope, grounded in plan.topicsAllowed.
5. Structure: one intro paragraph (no heading), then 3-6 <h2> sibling
   sections covering plan.scope. Do not repeat the H1 text anywhere in the
   body (not as a heading, not as a sentence).
6. Every internal link's href MUST be exactly one of plan.allowedLinkTargets
   hrefs. Anchor text must be descriptive (2-6 words), never generic
   ("here", "read more", "this"), and must genuinely relate to the
   surrounding sentence and the destination's own topic.
7. Avoid keyword stuffing, generic SEO filler ("perfect choice", "premium
   quality", "dependable choice"), unsupported superlatives ("best-known",
   "award-winning", "#1", "guaranteed"), and any health/scientific claim
   (antioxidants, immunity, curing, detox) not explicitly in EVIDENCE.
8. State each fact once. Do not restate the same fact reworded later.
9. bestTakenFor is a RECOMMENDED time, not an exclusive one — never assert a
   competing time-of-day recommendation not present in bestTakenFor.
10. packOptions lists every active pack size — never imply the product is
    sold in only one size when packOptions has more than one entry.
11. Mention the product name naturally, at most 3-4 times across the whole
    article (it is longer than a product description).
12. Target a USEFUL length for the topic, not a fixed word count. Never pad.
13. claimsUsed must list every material factual claim used.
14. unsupportedClaims must list any claim you are not certain is directly
    supported by EVIDENCE. A publishable result must have none.
15. If EVIDENCE/PLAN together do not support a genuinely useful, distinct
    article, return status="insufficient_evidence" with title/slug/etc as
    null and contentHtml as null.
16. slug must be a lowercase-kebab-case slug appropriate to the article
    (e.g. "darjeeling-tea-guide").
17. Return JSON only.
    `.trim(),

    input: JSON.stringify({
      task: 'Write a new, grounded, informational blog article using only the evidence and plan.',
      evidence,
      plan,
    }),

    text: {
      format: {
        type: 'json_schema',
        name: 'grounded_blog_article',
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
    throw new Error('Blog writer returned no structured output');
  }

  return JSON.parse(response.output_text) as GroundedBlogDraft;
}

export { MODEL as BLOG_WRITER_MODEL };
