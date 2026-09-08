/** One active, sellable pack/size option for the product (e.g. a weight variant). */
export interface ProductPackOption {
  label: string;
}

export interface ProductContentEvidence {
  productId: string;
  name: string;
  slug: string;
  region: string | null;
  description: string;
  shortDescription: string | null;
  bestTakenFor: string[];
  imageAltText: string | null;
  /**
   * Every currently active pack/size option, so the writer/verifier can tell
   * whether a specific size (e.g. "1kg") is the ONLY way the product is sold
   * or just one of several — a fact can be individually true yet still
   * misleading if it implies exclusivity the catalog doesn't support.
   * Empty when the product has no separate size variants.
   */
  packOptions: ProductPackOption[];
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
