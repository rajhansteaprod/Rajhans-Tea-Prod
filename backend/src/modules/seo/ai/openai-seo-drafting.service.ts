import OpenAI from 'openai';
import {
  GroundedDraftResult,
  GroundedProductDraft,
  ProductContentEvidence,
} from './seo-ai.types';
import {
  verifyProductDraftClaims,
} from './openai-seo-claim-verifier.service';
import {
  repairGroundedProductDraft,
} from './openai-seo-draft-repair.service';

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

function normalize(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function validateDraft(
  evidence: ProductContentEvidence,
  output: GroundedProductDraft,
): string[] {
  const errors: string[] = [];

  if (
    output.status !== 'ok' &&
    output.status !== 'insufficient_evidence'
  ) {
    errors.push('Invalid status');
  }

  if (
    output.status === 'ok' &&
    (!output.draft || !output.draft.trim())
  ) {
    errors.push(
      'status=ok requires non-empty draft',
    );
  }

  if (
    output.status === 'insufficient_evidence' &&
    output.draft
  ) {
    errors.push(
      'insufficient_evidence must not return draft copy',
    );
  }

  if (
    output.unsupportedClaims.length > 0
  ) {
    errors.push(
      'Model reported unsupported claims',
    );
  }

  if (output.draft) {
    const normalizedDraft =
      normalize(output.draft);

    const normalizedCurrent =
      normalize(evidence.description);

    if (
      normalizedDraft === normalizedCurrent
    ) {
      errors.push(
        'Generated draft is identical to current description',
      );
    }

    const words =
      normalizedDraft.split(/\s+/).length;

    const currentWords =
      normalizedCurrent
        ? normalizedCurrent.split(/\s+/).length
        : 0;

    const addedWords =
      words - currentWords;

    // Phase 6.3C quality rule:
    // thin-content is a signal to add genuinely useful information,
    // not a requirement to pad every product page to an arbitrary length.
    // Independent factual verification remains the primary quality gate.
    // Reject only near-no-op rewrites that add fewer than 10 grounded words.
    if (addedWords < 10) {
      errors.push(
        `Draft does not materially expand the page (${addedWords} words added; minimum 10)`,
      );
    }

    if (words > 350) {
      errors.push(
        `Draft is too long (${words} words)`,
      );
    }
  }

  return errors;
}

export async function generateGroundedProductDraft(
  evidence: ProductContentEvidence,
): Promise<GroundedDraftResult> {
  try {
    const client = getClient();

    const response =
      await client.responses.create({
        model: MODEL,

        instructions: `
You are an SEO product-content writer for Rajhans Tea.

Your authority is ONLY the supplied EVIDENCE JSON.

Rules:
1. Never invent a factual product claim.
2. Do not add estates, grades, certifications, awards, harvest details,
   health benefits, manufacturing methods, pricing, origin details,
   cup counts, taste notes, brewing instructions, sourcing practices,
   or freshness claims unless explicitly present in EVIDENCE.
3. Preserve factual meaning already present.
4. Improve readability, usefulness and topical depth.
5. Avoid keyword stuffing.
6. Avoid repeating the same fact in different wording.
7. Do not mention internal database concepts such as "categorized",
   "stored", "metadata", "evidence", or "product record".
8. Write natural customer-facing English.
9. Aim for roughly 180-280 words ONLY if evidence genuinely supports it.
   Never pad merely to reach a word count.
10. If there is not enough evidence for a useful expansion, return
    status="insufficient_evidence".
11. claimsUsed must list every material factual claim used in the draft.
12. unsupportedClaims must contain any claim you are not certain is
    directly supported by EVIDENCE. A publishable result must have none.
13. imageAltText is presentation metadata only. Do NOT use it to introduce
    product type, grade, origin, processing method, or any other factual claim
    unless the same fact is supported elsewhere in EVIDENCE.
14. Avoid generic commercial filler such as "dependable choice",
    "practical choice", "ideal choice", "perfect for", "regular household use",
    or invented customer situations unless directly supported by EVIDENCE.

Return JSON only.
        `.trim(),

        input: JSON.stringify({
          task:
            'Rewrite and expand this product description using only the evidence.',
          evidence,
        }),

        text: {
          format: {
            type: 'json_schema',
            name: 'grounded_product_content',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                status: {
                  type: 'string',
                  enum: [
                    'ok',
                    'insufficient_evidence',
                  ],
                },
                draft: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'null' },
                  ],
                },
                claimsUsed: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                unsupportedClaims: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                notes: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
              },
              required: [
                'status',
                'draft',
                'claimsUsed',
                'unsupportedClaims',
                'notes',
              ],
            },
          },
        },
      });

    if (!response.output_text) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        output: null,
        error:
          'OpenAI returned no structured output',
      };
    }

    const output =
      JSON.parse(
        response.output_text,
      ) as GroundedProductDraft;

    const errors =
      validateDraft(
        evidence,
        output,
      );

    if (errors.length) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        output,
        error:
          errors.join('; '),
      };
    }

    if (!output.draft) {
      return {
        ok: false,
        provider: 'openai',
        model: MODEL,
        evidence,
        output,
        error:
          'Draft output is missing after local validation',
      };
    }

    const claimVerification =
      await verifyProductDraftClaims({
        evidence,
        draft: output.draft,
      });

    if (!claimVerification.verified) {
      const repairedDraft =
        await repairGroundedProductDraft({
          evidence,
          draft: output.draft,
          unsupportedClaims:
            claimVerification.unsupportedClaims,
          questionableClaims:
            claimVerification.questionableClaims,
        });

      const repairedOutput: GroundedProductDraft = {
        status: 'ok',
        draft: repairedDraft,
        claimsUsed: output.claimsUsed,
        unsupportedClaims: [],
        notes: [
          ...output.notes,
          'Initial draft failed independent factual verification and was automatically repaired.',
        ],
      };

      const repairedErrors =
        validateDraft(
          evidence,
          repairedOutput,
        );

      if (repairedErrors.length) {
        return {
          ok: false,
          provider: 'openai',
          model: MODEL,
          evidence,
          output: repairedOutput,
          error:
            'Repaired draft failed deterministic validation: ' +
            repairedErrors.join('; '),
        };
      }

      const secondVerification =
        await verifyProductDraftClaims({
          evidence,
          draft: repairedDraft,
        });

      if (!secondVerification.verified) {
        return {
          ok: false,
          provider: 'openai',
          model: MODEL,
          evidence,
          output: {
            ...repairedOutput,
            unsupportedClaims: [
              ...secondVerification.unsupportedClaims,
              ...secondVerification.questionableClaims,
            ],
            notes: [
              ...repairedOutput.notes,
              ...secondVerification.notes,
            ],
          },
          error:
            'Repaired draft still failed independent factual verification: ' +
            [
              ...secondVerification.unsupportedClaims,
              ...secondVerification.questionableClaims,
            ].join(' | '),
        };
      }

      return {
        ok: true,
        provider: 'openai',
        model: MODEL,
        evidence,
        output: {
          ...repairedOutput,
          unsupportedClaims: [],
          notes: [
            ...repairedOutput.notes,
            ...secondVerification.notes,
            'Repaired draft passed independent factual verification.',
          ],
        },
      };
    }

    return {
      ok: true,
      provider: 'openai',
      model: MODEL,
      evidence,
      output: {
        ...output,
        notes: [
          ...output.notes,
          ...claimVerification.notes,
          'Independent factual verification passed on first attempt.',
        ],
      },
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'openai',
      model: MODEL,
      evidence,
      output: null,
      error:
        err instanceof Error
          ? err.message
          : String(err),
    };
  }
}
