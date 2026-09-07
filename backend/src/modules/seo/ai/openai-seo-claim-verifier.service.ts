import OpenAI from 'openai';
import { ProductContentEvidence } from './seo-ai.types';

const MODEL =
  process.env.OPENAI_SEO_MODEL?.trim() ||
  'gpt-5.6-luna';

export interface ClaimVerificationResult {
  verified: boolean;
  supportedClaims: string[];
  unsupportedClaims: string[];
  questionableClaims: string[];
  notes: string[];
}

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

export async function verifyProductDraftClaims(opts: {
  evidence: ProductContentEvidence;
  draft: string;
}): Promise<ClaimVerificationResult> {
  const client = getClient();

  const response =
    await client.responses.create({
      model: MODEL,

      instructions: `
You are an independent factual verifier.

You did NOT write the draft.

Your task is to compare PRODUCT DRAFT against EVIDENCE and identify
every material factual claim that is not directly supported.

STRICT RULES:

1. EVIDENCE is the only factual authority.
2. Do not use outside knowledge.
3. A reasonable rephrasing of an evidence fact is supported.
4. Stylistic wording is not a factual claim.
5. New situations, uses, benefits, audiences, occasions, locations,
   comparisons, origins, grades, brewing instructions, freshness claims,
   health claims, sourcing claims or product properties are unsupported
   unless present in EVIDENCE.
6. imageAltText is presentation metadata. It must NOT independently
   authorize a new product fact unless that same fact appears elsewhere
   in the evidence.
7. bestTakenFor may support only a light serving-time suggestion.
   It must not be turned into a broader behavioral or product claim.
8. If a statement goes beyond the literal or clearly equivalent meaning
   of the evidence, mark it unsupported or questionable.
9. Be conservative.
10. verified=true ONLY when unsupportedClaims and questionableClaims
    are both empty.

Return JSON only.
      `.trim(),

      input: JSON.stringify({
        evidence: opts.evidence,
        productDraft: opts.draft,
      }),

      text: {
        format: {
          type: 'json_schema',
          name: 'product_claim_verification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              verified: {
                type: 'boolean',
              },
              supportedClaims: {
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
              questionableClaims: {
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
              'verified',
              'supportedClaims',
              'unsupportedClaims',
              'questionableClaims',
              'notes',
            ],
          },
        },
      },
    });

  if (!response.output_text) {
    throw new Error(
      'Claim verifier returned no structured output',
    );
  }

  const result =
    JSON.parse(
      response.output_text,
    ) as ClaimVerificationResult;

  // Never trust model-provided verified=true when its own arrays disagree.
  result.verified =
    result.unsupportedClaims.length === 0 &&
    result.questionableClaims.length === 0;

  return result;
}
