import { evaluateProductDraftQuality } from '../../../src/modules/seo/ai/product-draft-quality-rules';
import { validateDraft } from '../../../src/modules/seo/ai/openai-seo-drafting.service';
import { ProductContentEvidence, GroundedProductDraft } from '../../../src/modules/seo/ai/seo-ai.types';

/**
 * These test the deterministic, non-AI quality gates added after human
 * editorial review found repetition, an "every morning" vs bestTakenFor
 * Evening contradiction, and a misleading "available in a 1kg pack" framing
 * (Dooars actually has 500gm/750gm/1kg active variants) in the first live
 * Phase 6.3C AI draft. No OpenAI calls — evaluateProductDraftQuality and
 * validateDraft are pure functions.
 */

function baseEvidence(overrides: Partial<ProductContentEvidence> = {}): ProductContentEvidence {
  return {
    productId: 'p1',
    name: 'Rajhans Rajdoot Dooars',
    slug: 'rajhans-rajdoot-dooars',
    region: 'Dooars',
    description:
      'Grown in the Dooars foothills, at the base of the Himalayas. Full-bodied and strong. ' +
      'Brews a good deep colour with milk. This is your everyday chai - the one you make every ' +
      'morning without thinking about it. One spoon makes one cup. 400 cups from a 1kg pack. ' +
      'Fresh stock, packed as it comes in from the gardens.',
    shortDescription: 'Your everyday cup. Strong, honest, no fuss. 400 cups per kg.',
    bestTakenFor: ['Evening'],
    imageAltText: null,
    packOptions: [{ label: '500 gm' }, { label: '750 gm' }, { label: '1 Kg' }],
    ...overrides,
  };
}

describe('evaluateProductDraftQuality', () => {
  it('A: rejects wording implying a single/exclusive pack size when multiple variants exist', () => {
    const evidence = baseEvidence();
    const draft =
      'Rajhans Rajdoot Dooars is a strong Dooars chai. Available in a 1kg pack, it brews well with milk.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('exclusive pack size'))).toBe(true);
  });

  it('B: allows a correctly-qualified factual statement about one specific pack size', () => {
    const evidence = baseEvidence();
    const draft =
      'Rajhans Rajdoot Dooars is a strong Dooars chai brewed with milk. One spoon makes one cup, and a 1kg pack gives 400 cups.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('exclusive pack size'))).toBe(false);
  });

  it('does not flag pack framing at all when the product has zero or one pack option', () => {
    const evidence = baseEvidence({ packOptions: [] });
    const draft = 'Rajhans Rajdoot Dooars is available in a 1kg pack and brews strong with milk.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('exclusive pack size'))).toBe(false);
  });

  it('C: rejects a repeated benefit phrase stated more than once', () => {
    const evidence = baseEvidence();
    const draft =
      'It brews a good deep colour with milk. Strong and grown in the Dooars foothills, ' +
      'it also brews a good deep colour with milk on the second cup.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('repeats the same phrase'))).toBe(true);
  });

  it('D: rejects morning framing when bestTakenFor is Evening only', () => {
    const evidence = baseEvidence({ bestTakenFor: ['Evening'] });
    const draft = 'This is your everyday chai, the one you make every morning. It is suited to an evening cup too.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('frames the product for "Morning"'))).toBe(true);
  });

  it('allows morning framing when bestTakenFor actually includes Morning', () => {
    const evidence = baseEvidence({ bestTakenFor: ['Morning'] });
    const draft = 'This is your everyday chai, the one you make every morning without thinking about it.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('frames the product for'))).toBe(false);
  });

  it('E: a clean, concise, grounded rewrite passes with no violations', () => {
    const evidence = baseEvidence();
    const draft =
      'Rajhans Rajdoot Dooars is a strong, full-bodied chai grown in the Dooars foothills at the base ' +
      'of the Himalayas, brewing a deep colour with milk. One spoon makes a cup, and a 1kg pack gives ' +
      '400 cups; it is suited to an evening brew. This is fresh stock, packed as it arrives from the gardens.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors).toEqual([]);
  });

  it('rejects a near-verbatim reshuffle of the existing description', () => {
    const evidence = baseEvidence({
      description: 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.',
    });
    const draft = 'Third sentence here. First sentence here. Fourth sentence here.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('reorganizes existing sentences'))).toBe(true);
  });

  it('rejects unsupported generic filler not present in evidence', () => {
    const evidence = baseEvidence();
    const draft = 'Rajhans Rajdoot Dooars is the perfect choice for tea lovers everywhere, brewed strong with milk.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('perfect choice'))).toBe(true);
  });

  it('rejects excessive product-name repetition', () => {
    const evidence = baseEvidence();
    const draft =
      'Rajhans Rajdoot Dooars is strong. Rajhans Rajdoot Dooars brews well with milk. ' +
      'Rajhans Rajdoot Dooars is fresh stock from the gardens.';
    const errors = evaluateProductDraftQuality(evidence, draft);
    expect(errors.some((e) => e.includes('repeated 3 times'))).toBe(true);
  });
});

describe('validateDraft — new gates combine with existing checks (F: unsupported-claim protection intact)', () => {
  it('F: still rejects when the model itself reports unsupportedClaims, independent of the new rules', () => {
    const evidence = baseEvidence();
    const output: GroundedProductDraft = {
      status: 'ok',
      draft:
        'A perfectly clean grounded sentence about the Dooars foothills tea, brewed with milk for an evening cup, from a 1kg pack, with plenty of extra grounded words to spare here.',
      claimsUsed: ['grown in Dooars foothills'],
      unsupportedClaims: ['won an award in 2024'],
      notes: [],
    };
    const errors = validateDraft(evidence, output);
    expect(errors).toContain('Model reported unsupported claims');
  });

  it('rejects the same identical-to-current draft as before (pre-existing no-op check unaffected)', () => {
    const evidence = baseEvidence();
    const output: GroundedProductDraft = {
      status: 'ok',
      draft: evidence.description,
      claimsUsed: [],
      unsupportedClaims: [],
      notes: [],
    };
    const errors = validateDraft(evidence, output);
    expect(errors).toContain('Generated draft is identical to current description');
  });

  it('combines the new quality gates with the existing checks on a single bad draft', () => {
    const evidence = baseEvidence();
    const output: GroundedProductDraft = {
      status: 'ok',
      draft:
        'Available in a 1kg pack, this chai brews a good deep colour with milk, and later it brews a good deep colour with milk again, with several more grounded words added here for good measure.',
      claimsUsed: [],
      unsupportedClaims: [],
      notes: [],
    };
    const errors = validateDraft(evidence, output);
    expect(errors.some((e) => e.includes('exclusive pack size'))).toBe(true);
    expect(errors.some((e) => e.includes('repeats the same phrase'))).toBe(true);
  });
});
