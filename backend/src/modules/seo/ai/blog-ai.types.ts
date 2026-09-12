import { ProductPackOption } from './seo-ai.types';

/** The same authoritative product facts ProductContentEvidence carries, reused verbatim so the article writer/verifier can never see a different shape of truth than the product-description pipeline. */
export interface BlogProductEvidence {
  productId: string;
  name: string;
  slug: string;
  region: string | null;
  description: string;
  shortDescription: string | null;
  bestTakenFor: string[];
  packOptions: ProductPackOption[];
  url: string;
}

/** One existing published Rajhans blog post's deterministic, factual footprint — never the AI's own summary. */
export interface ExistingBlogSummary {
  title: string;
  slug: string;
  url: string;
  tags: string[];
  /** Deterministic: the post's own intro paragraph, verbatim (see blog-content-planner.ts). */
  topicSummary: string;
  /** Deterministic intent classification via textIntentCategories/blogIntentCategories (brewing/sourcing/health/recipe/...). */
  keyIntents: string[];
}

export interface BlogOpportunityEvidence {
  recommendationId: string;
  recommendationType: string;
  entity: string;
  targetUrl: string;
  rationale: string;
}

/**
 * Phase 6.7A — the ONLY factual authority the autonomous article writer and
 * verifier may draw on. Deliberately excludes image alt text, generic model
 * knowledge, and any external/competitor source — mirrors
 * ProductContentEvidence's "evidence is the only authority" contract,
 * extended with the existing blog corpus so a new article can be planned to
 * not duplicate it.
 */
export interface BlogContentEvidence {
  product: BlogProductEvidence | null;
  opportunity: BlogOpportunityEvidence;
  existingCorpus: ExistingBlogSummary[];
  siteFacts: {
    baseUrl: string;
  };
}

export interface ProposedInternalLink {
  href: string;
  anchor: string;
}

/**
 * Deterministic output of the Part C planner — computed BEFORE any OpenAI
 * call. `allowedLinkTargets` is the authoritative, closed set of hrefs the
 * writer may link to; anything else is rejected by the quality gate without
 * needing a network round-trip.
 */
export interface ArticlePlan {
  primaryQuestion: string;
  scope: string[];
  topicsAllowed: string[];
  topicsToAvoid: { topic: string; reason: string }[];
  allowedLinkTargets: ProposedInternalLink[];
  cannibalizationNotes: string[];
}

export type ArticlePlanResult = { ok: true; plan: ArticlePlan } | { ok: false; reason: 'no_material_content_opportunity'; details: string[] };

export interface GroundedBlogDraft {
  status: 'ok' | 'insufficient_evidence';
  title: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  contentHtml: string | null;
  proposedLinks: ProposedInternalLink[];
  claimsUsed: string[];
  unsupportedClaims: string[];
  notes: string[];
}

/** Phase 6.7C Part B — persisted repair audit trail: what failed before repair, what repair changed, what failed after, and which post-repair failures are genuinely NEW (repair-introduced) vs. persisted from the original draft. */
export interface RepairDiagnostics {
  originalFailures: string[];
  repairNotes: string[];
  postRepairFailures: string[];
  newFailures: string[];
  persistedFailures: string[];
  resolvedFailures: string[];
  cleanupAttempted: boolean;
  cleanupFailures?: string[];
}

export interface GroundedBlogDraftResult {
  ok: boolean;
  provider: 'openai';
  model: string;
  evidence: BlogContentEvidence;
  plan: ArticlePlan;
  output: GroundedBlogDraft | null;
  disposition?: 'draft_ready' | 'no_material_content_opportunity' | 'rejected';
  error?: string;
  /**
   * Phase 6.7C Part E — true ONLY for a valid, complete, independently
   * re-verified article (ok===true && disposition==='draft_ready'). A
   * generation-failure record (rejected / no_material_content_opportunity /
   * a thrown error) is ALWAYS false, regardless of how much partial content
   * or diagnostic detail it carries — it must never read as something a
   * human could approve/execute.
   */
  readyForHumanReview: boolean;
  /** Total OpenAI calls actually made for this article. Absolute maximum 5 — the 5th only ever occurs on the exceptional single-cleanup-repair path. */
  openaiCallCount: number;
  /** Present whenever a repair (or cleanup repair) attempt was made — the full audit trail (Part B). */
  diagnostics?: RepairDiagnostics;
}
