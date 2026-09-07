export interface ProductContentEvidence {
  productId: string;
  name: string;
  slug: string;
  region: string | null;
  description: string;
  shortDescription: string | null;
  bestTakenFor: string[];
  imageAltText: string | null;
}

export interface GroundedProductDraft {
  status: 'ok' | 'insufficient_evidence';
  draft: string | null;
  claimsUsed: string[];
  unsupportedClaims: string[];
  notes: string[];
}

export interface GroundedDraftResult {
  ok: boolean;
  provider: 'openai';
  model: string;
  evidence: ProductContentEvidence;
  output: GroundedProductDraft | null;
  error?: string;
}
