// =============================================================================
// UNIT TESTS — Phase 6.7A autonomous article drafting orchestrator
//
// Mocks the writer/verifier/repair sub-services directly (never the real
// OpenAI SDK/network) so these tests can assert call-count policy and
// repair-path behavior deterministically and without any network access.
// =============================================================================

import { ArticlePlan, BlogContentEvidence, GroundedBlogDraft } from '../../../src/modules/seo/ai/blog-ai.types';
import { BlogClaimVerificationResult } from '../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service';

jest.mock('../../../src/modules/seo/ai/openai-seo-blog-writer.service', () => ({
  writeGroundedBlogDraft: jest.fn(),
}));
jest.mock('../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service', () => ({
  verifyBlogDraftClaims: jest.fn(),
}));
jest.mock('../../../src/modules/seo/ai/openai-seo-blog-repair.service', () => ({
  repairGroundedBlogDraft: jest.fn(),
}));

import { writeGroundedBlogDraft } from '../../../src/modules/seo/ai/openai-seo-blog-writer.service';
import { verifyBlogDraftClaims } from '../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service';
import { repairGroundedBlogDraft } from '../../../src/modules/seo/ai/openai-seo-blog-repair.service';
import { generateGroundedBlogDraft } from '../../../src/modules/seo/ai/openai-seo-blog-drafting.service';

const mockWrite = writeGroundedBlogDraft as jest.Mock;
const mockVerify = verifyBlogDraftClaims as jest.Mock;
const mockRepair = repairGroundedBlogDraft as jest.Mock;

const BASE_URL = 'https://rajhanstea.com';

const evidence: BlogContentEvidence = {
  product: {
    productId: 'p1',
    name: 'Rajhans Royal Darjeeling',
    slug: 'rajhans-royal-darjeeling',
    region: 'Darjeeling',
    description: 'Rajhans Royal Darjeeling is a light, aromatic black tea.',
    shortDescription: 'Light and aromatic.',
    bestTakenFor: ['Evening'],
    packOptions: [{ label: '250 gm' }],
    url: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
  },
  opportunity: {
    recommendationId: 'topical-authority-gap',
    recommendationType: 'topical-authority',
    entity: 'Darjeeling',
    targetUrl: `${BASE_URL}/product/rajhans-royal-darjeeling/`,
    rationale: 'No educational content exists for Darjeeling tea.',
  },
  existingCorpus: [],
  siteFacts: { baseUrl: BASE_URL },
};

const plan: ArticlePlan = {
  primaryQuestion: 'What is Darjeeling tea?',
  scope: ['origin'],
  topicsAllowed: ['facts from evidence'],
  topicsToAvoid: [],
  allowedLinkTargets: [{ href: evidence.product!.url, anchor: 'Rajhans Royal Darjeeling product page' }],
  cannibalizationNotes: [],
};

function validDraft(overrides: Partial<GroundedBlogDraft> = {}): GroundedBlogDraft {
  return {
    status: 'ok',
    title: 'What Is Darjeeling Tea?',
    slug: 'darjeeling-tea-guide',
    metaTitle: 'Darjeeling Tea Guide: Flavour & Origin — Rajhans Tea',
    metaDescription: 'Learn about Rajhans Royal Darjeeling, a light aromatic black tea from Darjeeling.',
    h1: 'What Is Darjeeling Tea?',
    contentHtml:
      '<p>Rajhans Royal Darjeeling is a light, aromatic black tea.</p>' +
      '<h2>Where It Comes From</h2><p>It comes from Darjeeling.</p>' +
      '<h2>Choosing Your Pack</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>',
    proposedLinks: [{ href: evidence.product!.url, anchor: 'Rajhans Royal Darjeeling product page' }],
    claimsUsed: ['light, aromatic', 'from Darjeeling'],
    unsupportedClaims: [],
    notes: [],
    ...overrides,
  };
}

function verifiedResult(overrides: Partial<BlogClaimVerificationResult> = {}): BlogClaimVerificationResult {
  return {
    verified: true,
    supportedClaims: ['light, aromatic'],
    unsupportedClaims: [],
    questionableClaims: [],
    misleadingImplications: [],
    contradictions: [],
    cannibalizationConcerns: [],
    internalLinkConcerns: [],
    notes: [],
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks leaves any unconsumed
  // queued mockResolvedValueOnce implementations in place, which would leak
  // into the next test whenever a prior test terminated early (e.g. a
  // rejected-path test that never reaches its later queued mocks).
  jest.resetAllMocks();
});

describe('generateGroundedBlogDraft — call-count policy and repair path', () => {
  it('A/Q: a grounded article that passes first-pass verification uses exactly 2 OpenAI calls', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValue(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(true);
    expect(result.disposition).toBe('draft_ready');
    expect(result.openaiCallCount).toBe(2);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('O/Q: a first-pass verification failure triggers exactly one repair + second verification (4 calls total)', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValue(validDraft({ notes: ['repaired'] }));
    mockVerify.mockResolvedValueOnce(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(true);
    expect(result.openaiCallCount).toBe(4);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });

  it('P/Q: a second verification failure after repair prevents an executable draft and never exceeds 4 calls', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['still unsupported'] }));

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(false);
    expect(result.disposition).toBe('rejected');
    expect(result.openaiCallCount).toBe(4);
    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(2);
  });

  it('N: the writer declaring insufficient_evidence short-circuits with no_material_content_opportunity and only 1 call', async () => {
    mockWrite.mockResolvedValue({ status: 'insufficient_evidence', title: null, slug: null, metaTitle: null, metaDescription: null, h1: null, contentHtml: null, proposedLinks: [], claimsUsed: [], unsupportedClaims: [], notes: [] });

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(false);
    expect(result.disposition).toBe('no_material_content_opportunity');
    expect(result.openaiCallCount).toBe(1);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('a deterministic quality-gate failure on the first draft also triggers the repair path', async () => {
    // Draft has an external link — fails evaluateBlogDraftQuality even
    // though the (mocked) AI verifier would otherwise pass it.
    mockWrite.mockResolvedValue(validDraft({ contentHtml: validDraft().contentHtml + '<p>See <a href="https://example.com/x/">external</a>.</p>' }));
    mockVerify.mockResolvedValueOnce(verifiedResult());
    mockRepair.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.openaiCallCount).toBe(4);
  });

  it('never calls repair more than once even when the orchestrator is invoked repeatedly with persistent failures (no uncontrolled retry loop)', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValue(verifiedResult({ verified: false, unsupportedClaims: ['bad'] }));
    mockRepair.mockResolvedValue(validDraft());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.openaiCallCount).toBeLessThanOrEqual(4);
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });

  // Q: first-pass success is readyForHumanReview
  it('Q: a first-pass-verified article is readyForHumanReview', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValue(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.readyForHumanReview).toBe(true);
  });

  // N/P: failure records are never readyForHumanReview
  it('P: a failed generation record is not readyForHumanReview', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['still unsupported'] }));

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(false);
    expect(result.readyForHumanReview).toBe(false);
  });
});

describe('generateGroundedBlogDraft — Part A: repetition profile always supplied to repair', () => {
  it('A: repair receives a repetition profile even when repetition was not the original failure', async () => {
    mockWrite.mockResolvedValue(validDraft({ contentHtml: validDraft().contentHtml + '<p>See <a href="https://example.com/x/">external</a>.</p>' }));
    mockVerify.mockResolvedValueOnce(verifiedResult());
    mockRepair.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult());

    await generateGroundedBlogDraft(evidence, plan);

    expect(mockRepair).toHaveBeenCalledTimes(1);
    const call = mockRepair.mock.calls[0][0];
    expect(call.guidance.repetitionProfile).toBeDefined();
    expect(call.guidance.repetitionProfile.productNameThreshold).toBeGreaterThan(0);
  });

  // B: repair receives the repeated-phrase/stem profile
  it('B: repair receives the current repeated-phrase/sentence-opening profile', async () => {
    const repeatingBody =
      '<p>Rajhans Royal Darjeeling is grown on the hills. Rajhans Royal Darjeeling is grown on slopes. Rajhans Royal Darjeeling is grown on ridges.</p>' +
      '<h2>Pack Sizes</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>';
    mockWrite.mockResolvedValue(validDraft({ contentHtml: repeatingBody }));
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['bad'] }));
    mockRepair.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult());

    await generateGroundedBlogDraft(evidence, plan);

    const call = mockRepair.mock.calls[0][0];
    expect(call.guidance.repetitionProfile.repeatedSentenceOpenings.length).toBeGreaterThan(0);
  });
});

describe('generateGroundedBlogDraft — Parts B/C/D: cleanup-repair path', () => {
  const repeatingPhrase = 'rajhans royal darjeeling is grown on';
  // Two h2 sections (matching validDraft's structure) so this fixture fails
  // the quality gate ONLY on the repeated phrase, not on heading count too.
  const repeatingBody =
    `<p>${repeatingPhrase} the slopes. ${repeatingPhrase} the ridges. It is light and floral.</p>` +
    '<h2>Where It Comes From</h2><p>It comes from Darjeeling.</p>' +
    '<h2>Pack Sizes</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>';

  it('E/F/I: repair-introduced repetition triggers exactly one cleanup repair, which resolves it, then a final verifier runs (5 calls)', async () => {
    mockWrite.mockResolvedValue(validDraft());
    // Original failure: verifier flags an unsupported claim.
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    // Repair "fixes" the verifier issue but introduces new repetition.
    mockRepair.mockResolvedValueOnce(validDraft({ contentHtml: repeatingBody }));
    // Cleanup repair resolves the repetition.
    mockRepair.mockResolvedValueOnce(validDraft());
    // Final verifier after successful cleanup.
    mockVerify.mockResolvedValueOnce(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(true);
    expect(result.readyForHumanReview).toBe(true);
    expect(result.openaiCallCount).toBe(5);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockRepair).toHaveBeenCalledTimes(2);
    expect(result.diagnostics?.cleanupAttempted).toBe(true);
    expect(result.diagnostics?.newFailures.length).toBeGreaterThan(0);
  });

  it('G/H: cleanup repair preserves unrelated valid fields and cannot become a full rewrite', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValueOnce(validDraft({ contentHtml: repeatingBody }));
    // Cleanup call returns a draft with a DIFFERENT title/slug/meta — these must be force-preserved from the pre-cleanup candidate.
    mockRepair.mockResolvedValueOnce(
      validDraft({
        title: 'A Totally Different Rewritten Title',
        slug: 'totally-different-slug',
        metaTitle: 'Different Meta Title Entirely',
        contentHtml:
          '<p>Rajhans Royal Darjeeling is light and floral.</p><h2>Where It Comes From</h2><p>It comes from Darjeeling.</p><h2>Pack Sizes</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>',
      }),
    );
    mockVerify.mockResolvedValueOnce(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(true);
    // Title/slug/metaTitle were not implicated by the repetition-only cleanup failure, so they must be preserved byte-for-byte from the pre-cleanup candidate.
    expect(result.output?.title).toBe(validDraft().title);
    expect(result.output?.slug).toBe(validDraft().slug);
    expect(result.output?.metaTitle).toBe(validDraft().metaTitle);
  });

  it('J: a cleanup repair that fails deterministic validation terminates immediately with no final verifier call (4 calls total)', async () => {
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValueOnce(validDraft({ contentHtml: repeatingBody }));
    // Cleanup repair still leaves the same repeated phrase — deterministic gate fails again.
    mockRepair.mockResolvedValueOnce(validDraft({ contentHtml: repeatingBody }));

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(false);
    expect(result.readyForHumanReview).toBe(false);
    expect(result.openaiCallCount).toBe(4);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockRepair).toHaveBeenCalledTimes(2);
  });

  it('is not eligible for cleanup when an original (persisted) failure remains after repair — terminates at 3 calls, never attempts cleanup', async () => {
    mockWrite.mockResolvedValue(validDraft());
    // Original deterministic failure: external link.
    const draftWithExternalLink = validDraft({ contentHtml: validDraft().contentHtml + '<p>See <a href="https://example.com/x/">external</a>.</p>' });
    mockWrite.mockResolvedValue(draftWithExternalLink);
    mockVerify.mockResolvedValueOnce(verifiedResult());
    // Repair does not fix the external link (persisted failure).
    mockRepair.mockResolvedValueOnce(draftWithExternalLink);

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.ok).toBe(false);
    expect(result.readyForHumanReview).toBe(false);
    expect(result.openaiCallCount).toBe(3);
    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});

describe('generateGroundedBlogDraft — Part D: absolute call-count ceiling', () => {
  it('K/L/M: the absolute maximum across all paths is 5 calls; the 5th call only occurs via the exceptional cleanup path', async () => {
    const repeatingPhrase = 'rajhans royal darjeeling is grown on';
    const repeatingBody =
      `<p>${repeatingPhrase} the slopes. ${repeatingPhrase} the ridges. It is light and floral.</p>` +
      '<h2>Where It Comes From</h2><p>It comes from Darjeeling.</p>' +
      '<h2>Pack Sizes</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>';
    mockWrite.mockResolvedValue(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }));
    mockRepair.mockResolvedValueOnce(validDraft({ contentHtml: repeatingBody }));
    mockRepair.mockResolvedValueOnce(validDraft());
    mockVerify.mockResolvedValueOnce(verifiedResult());

    const result = await generateGroundedBlogDraft(evidence, plan);

    expect(result.openaiCallCount).toBeLessThanOrEqual(5);
    expect(result.openaiCallCount).toBe(5);
    expect(mockWrite).toHaveBeenCalledTimes(1); // N: no second fresh writer, ever
  });
});
