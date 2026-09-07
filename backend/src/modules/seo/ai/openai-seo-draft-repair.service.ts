import OpenAI from 'openai';
import { ProductContentEvidence } from './seo-ai.types';

const MODEL =
  process.env.OPENAI_SEO_MODEL?.trim() ||
  'gpt-5.6-luna';

function getClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not configured',
    );
  }

  return new OpenAI({ apiKey });
}

export async function repairGroundedProductDraft(opts: {
  evidence: ProductContentEvidence;
  draft: string;
  unsupportedClaims: string[];
  questionableClaims: string[];
}): Promise<string> {
  const client = getClient();

  const response =
    await client.responses.create({
      model: MODEL,

      instructions: `
You are repairing an SEO product draft that failed factual verification.

You are NOT being asked to create new ideas.

Your job:
1. Preserve all useful supported content.
2. Remove or rewrite EVERY rejected claim.
3. Use ONLY the supplied EVIDENCE.
4. Do not use imageAltText as authority for any new product fact.
5. Do not introduce new benefits, audiences, use-cases, situations,
   comparisons or recommendations.
6. Avoid phrases such as:
   - dependable choice
   - practical choice
   - ideal choice
   - perfect for
   - made for people who
   - regular household use
   unless those meanings are directly stated in EVIDENCE.
7. bestTakenFor may only support a simple phrase such as
   "suited to a morning cup" or "suited to an evening cup".
8. Do not pad the copy merely to increase word count.
9. Natural customer-facing English only.
10. Preserve exact numeric claims from evidence.
11. Return ONLY the repaired draft text.

If a rejected statement cannot be repaired from evidence,
delete it completely.
      `.trim(),

      input: JSON.stringify({
        evidence: opts.evidence,
        currentDraft: opts.draft,
        rejectedClaims: {
          unsupported:
            opts.unsupportedClaims,
          questionable:
            opts.questionableClaims,
        },
      }),
    });

  const repaired =
    response.output_text?.trim();

  if (!repaired) {
    throw new Error(
      'AI repair returned no draft text',
    );
  }

  return repaired;
}
