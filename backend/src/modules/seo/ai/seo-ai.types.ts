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

  /**
   * `no_material_improvement` is not an AI failure. It means the existing
   * factual description was already strong enough that grounded rewriting
   * could not add meaningful new content without padding.
   */
  disposition?:
    | 'draft_ready'
    | 'no_material_improvement'
    | 'rejected';

  error?: string;
}
