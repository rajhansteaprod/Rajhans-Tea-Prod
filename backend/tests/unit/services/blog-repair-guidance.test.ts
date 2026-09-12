import { buildRepairGuidance, mergeRepairedDraft, missingRequiredFields } from '../../../src/modules/seo/ai/blog-repair-guidance';
import { GroundedBlogDraft } from '../../../src/modules/seo/ai/blog-ai.types';
import { BlogClaimVerificationResult } from '../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service';
import { MAX_PRODUCT_NAME_MENTIONS } from '../../../src/modules/seo/ai/blog-draft-quality-rules';

function verifiedResult(overrides: Partial<BlogClaimVerificationResult> = {}): BlogClaimVerificationResult {
  return {
    verified: true,
    supportedClaims: [],
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

function makeDraft(overrides: Partial<GroundedBlogDraft> = {}): GroundedBlogDraft {
  return {
    status: 'ok',
    title: 'What Is Darjeeling Tea?',
    slug: 'darjeeling-tea-guide',
    metaTitle: 'Darjeeling Tea Guide — Rajhans Tea',
    metaDescription: 'Learn about Rajhans Royal Darjeeling.',
    h1: 'What Is Darjeeling Tea?',
    contentHtml: '<p>Intro about Darjeeling tea.</p><h2>Origin</h2><p>Grown in Darjeeling.</p>',
    proposedLinks: [{ href: 'https://rajhanstea.com/product/rajhans-royal-darjeeling/', anchor: 'product page' }],
    claimsUsed: ['grown in Darjeeling'],
    unsupportedClaims: [],
    notes: [],
    ...overrides,
  };
}

describe('buildRepairGuidance', () => {
  it('A: implicates only body when the only failure is an unsupported body claim', () => {
    const draft = makeDraft();
    const guidance = buildRepairGuidance({
      draft,
      productName: 'Rajhans Royal Darjeeling',
      deterministicErrors: [],
      verification: verifiedResult({ verified: false, unsupportedClaims: ['invented estate name'] }),
    });
    expect(guidance.fieldsToFix).toEqual(['body']);
    expect(guidance.fieldsToPreserve).toEqual(expect.arrayContaining(['title', 'slug', 'metaTitle', 'metaDescription', 'h1', 'links']));
  });

  it('implicates metaTitle/metaDescription only when a deterministic error names them', () => {
    const draft = makeDraft();
    const guidance = buildRepairGuidance({
      draft,
      productName: null,
      deterministicErrors: ['metaTitle is missing or an unreasonable length'],
      verification: verifiedResult(),
    });
    expect(guidance.fieldsToFix).toEqual(['metaTitle']);
    expect(guidance.fieldsToPreserve).not.toContain('metaTitle');
    expect(guidance.fieldsToPreserve).toContain('metaDescription');
  });

  it('a link-related failure implicates both links AND body (the <a> tag lives in contentHtml)', () => {
    const draft = makeDraft();
    const guidance = buildRepairGuidance({
      draft,
      productName: null,
      deterministicErrors: ['Article links to an external/non-Rajhans URL: https://example.com/x/'],
      verification: verifiedResult(),
    });
    expect(guidance.fieldsToFix.sort()).toEqual(['body', 'links'].sort());
    expect(guidance.fieldsToPreserve).toEqual(expect.arrayContaining(['title', 'slug', 'metaTitle', 'metaDescription', 'h1']));
  });

  it('C/D: repetitionNotes cite the exact over-repeated term, count, and the UNCHANGED threshold', () => {
    const repeatedName = 'Rajhans Royal Darjeeling';
    const body = `<p>${repeatedName} is light. ${repeatedName} is floral. ${repeatedName} is grown high. ${repeatedName} is fresh. ${repeatedName} is packed well.</p>`;
    const draft = makeDraft({ contentHtml: body });
    const guidance = buildRepairGuidance({
      draft,
      productName: repeatedName,
      deterministicErrors: [`Product name repeated 5 times — should appear naturally, not mechanically`],
      verification: verifiedResult(),
    });
    // Phase 6.7C Part A: the profile note is ALWAYS present (not conditional on
    // this being the original failure), plus the standing "don't duplicate
    // phrases" / "preserve natural prose" notes — at least the profile note
    // must cite the exact term, count, and unchanged threshold.
    const profileNote = guidance.repetitionNotes[0];
    expect(profileNote).toContain(repeatedName);
    expect(profileNote).toContain('5');
    expect(profileNote).toContain(String(MAX_PRODUCT_NAME_MENTIONS));
    expect(guidance.repetitionProfile.productNameCount).toBe(5);
    expect(guidance.repetitionProfile.productNameThreshold).toBe(MAX_PRODUCT_NAME_MENTIONS);
    // The threshold constant itself must never be relaxed by repair guidance.
    expect(MAX_PRODUCT_NAME_MENTIONS).toBe(4);
  });

  it('Part A: repetition profile is populated even when repetition was NOT the original failure', () => {
    const draft = makeDraft();
    const guidance = buildRepairGuidance({
      draft,
      productName: 'Rajhans Royal Darjeeling',
      deterministicErrors: ['metaTitle is missing or an unreasonable length'],
      verification: verifiedResult(),
    });
    expect(guidance.repetitionProfile).toBeDefined();
    expect(guidance.repetitionProfile.productNameThreshold).toBe(MAX_PRODUCT_NAME_MENTIONS);
    expect(guidance.repetitionNotes.length).toBeGreaterThan(0);
  });
});

describe('mergeRepairedDraft — field-level preservation (Part A)', () => {
  it('A: preserves metaTitle/metaDescription/title/slug/h1 exactly when only the body was implicated, even if repair changed them', () => {
    const original = makeDraft();
    const repaired = makeDraft({
      title: 'A Different Title Repair Invented',
      slug: 'different-slug',
      metaTitle: 'A Different Meta Title',
      metaDescription: 'A different meta description entirely.',
      h1: 'A Different H1',
      contentHtml: '<p>Fixed intro.</p><h2>Origin</h2><p>Fixed origin text.</p>',
    });
    const guidance = buildRepairGuidance({
      draft: original,
      productName: null,
      deterministicErrors: [],
      verification: verifiedResult({ verified: false, unsupportedClaims: ['bad'] }),
    });
    const merged = mergeRepairedDraft(original, repaired, guidance);

    expect(merged.title).toBe(original.title);
    expect(merged.slug).toBe(original.slug);
    expect(merged.metaTitle).toBe(original.metaTitle);
    expect(merged.metaDescription).toBe(original.metaDescription);
    expect(merged.h1).toBe(original.h1);
    // Body WAS implicated, so the repaired value is used.
    expect(merged.contentHtml).toBe(repaired.contentHtml);
  });

  it('does not preserve a field that was itself implicated by a failure', () => {
    const original = makeDraft();
    const repaired = makeDraft({ metaTitle: 'Corrected Meta Title Within Length' });
    const guidance = buildRepairGuidance({
      draft: original,
      productName: null,
      deterministicErrors: ['metaTitle is missing or an unreasonable length'],
      verification: verifiedResult(),
    });
    const merged = mergeRepairedDraft(original, repaired, guidance);
    expect(merged.metaTitle).toBe(repaired.metaTitle);
  });
});

describe('missingRequiredFields — B: repair cannot omit required fields', () => {
  it('flags every required field that is empty/missing after merge', () => {
    const draft = makeDraft({ metaTitle: '', metaDescription: '   ', title: null as any });
    expect(missingRequiredFields(draft).sort()).toEqual(['metaTitle', 'metaDescription', 'title'].sort());
  });

  it('returns an empty list when every required field is present', () => {
    expect(missingRequiredFields(makeDraft())).toEqual([]);
  });
});
