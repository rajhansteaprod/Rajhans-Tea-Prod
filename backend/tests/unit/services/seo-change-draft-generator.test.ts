// =============================================================================
// UNIT TESTS — SEO Phase 5.2 change-draft generator service
// Mocks SeoRecommendation and SeoChangeDraft the same way
// seo-recommendation-review.test.ts does (plain in-memory `store` arrays), so
// no real DB is needed. GENERATION ONLY: these tests assert the generator
// never mutates the recommendation and never calls DataForSEO/GSC/an LLM.
// =============================================================================

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

interface FakeRec {
  _id: mongoose.Types.ObjectId;
  recommendationId: string;
  fingerprint: string;
  category: string;
  status: 'open' | 'resolved';
  reviewStatus: ReviewStatus;
  title: string;
  why: string;
  suggestedFix: string;
  estimatedEffort: string;
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  relatedCheckIds: string[];
  source: 'audit' | 'gsc' | 'market';
  demandBonus: number;
  demandImpressions: number;
  priority: string;
  impact: string;
  score: number;
  reviewNote: string | null;
  reviewedAt: Date | null;
}

interface FakeDraft {
  _id: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  targetUrl: string;
  source: string;
  type: string;
  status: 'draft' | 'superseded';
  generatorVersion: string;
  generatedAt: Date;
  generatedBy: mongoose.Types.ObjectId;
  inputSnapshot: Record<string, unknown>;
  proposedChanges: unknown[];
  validation: { isValid: boolean; warnings: string[]; errors: string[] };
  createdAt: Date;
  updatedAt: Date;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let createShouldFail = false;

function makeRec(fields: Partial<FakeRec> = {}): FakeRec {
  return {
    _id: new mongoose.Types.ObjectId(),
    recommendationId: 'test-reco',
    fingerprint: 'fp-' + Math.random().toString(36).slice(2),
    category: 'metadata',
    status: 'open',
    reviewStatus: 'approved',
    title: 'Test recommendation',
    why: 'Because reasons.',
    suggestedFix: 'Do the thing.',
    estimatedEffort: 'medium',
    affectedUrls: ['https://rajhanstea.com/page/x/'],
    evidence: {},
    relatedCheckIds: [],
    source: 'audit',
    demandBonus: 0,
    demandImpressions: 0,
    priority: 'medium',
    impact: 'medium',
    score: 10,
    reviewNote: null,
    reviewedAt: null,
    ...fields,
  };
}

function makeDraft(fields: Partial<FakeDraft> = {}): FakeDraft {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    recommendationFingerprint: '',
    targetUrl: '',
    source: 'audit',
    type: 'metadata',
    status: 'draft',
    generatorVersion: '',
    generatedAt: now,
    generatedBy: new mongoose.Types.ObjectId(),
    inputSnapshot: {},
    proposedChanges: [],
    validation: { isValid: true, warnings: [], errors: [] },
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findById: jest.fn((id: unknown) => ({
      exec: async () => recStore.find((d) => String(d._id) === String(id)) ?? null,
    })),
    exists: jest.fn((query: { _id?: unknown }) =>
      Promise.resolve(!!recStore.find((d) => String(d._id) === String(query._id)))),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-draft.model', () => ({
  SeoChangeDraft: {
    updateMany: jest.fn(
      (
        query: { recommendationId?: unknown; status?: string; _id?: { $ne?: unknown } },
        update: { $set: { status: 'draft' | 'superseded' } },
      ) => ({
        exec: async () => {
          for (const d of draftStore) {
            if (String(d.recommendationId) !== String(query.recommendationId)) continue;
            if (query.status !== undefined && d.status !== query.status) continue;
            if (query._id?.$ne !== undefined && String(d._id) === String(query._id.$ne)) continue;
            d.status = update.$set.status;
          }
          return { acknowledged: true };
        },
      }),
    ),
    create: jest.fn(async (fields: Partial<FakeDraft>) => {
      if (createShouldFail) throw new Error('simulated create() failure');
      const doc = makeDraft(fields);
      draftStore.push(doc);
      return doc;
    }),
    find: jest.fn((query: { recommendationId?: unknown }) => ({
      sort: () => ({
        exec: async () =>
          draftStore
            .filter((d) => String(d.recommendationId) === String(query.recommendationId))
            .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()),
      }),
    })),
    findById: jest.fn((id: unknown) => ({
      exec: async () => draftStore.find((d) => String(d._id) === String(id)) ?? null,
    })),
  },
}));

import {
  generateChangeDraft,
  listChangeDrafts,
  recommendationExists,
  GENERATOR_VERSION,
} from '../../../src/modules/seo/services/change-draft-generator.service';
import {
  MetadataProposedChange,
  StructuredDataProposedChange,
  InternalLinkProposedChange,
  GenericProposedChange,
} from '../../../src/modules/seo/models/seo-change-draft.model';

const generatedBy = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  recStore = [];
  draftStore = [];
  createShouldFail = false;
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — eligibility', () => {
  it('refuses a pending recommendation', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_approved');
    expect(draftStore).toHaveLength(0);
  });

  it('refuses a rejected recommendation', async () => {
    const rec = makeRec({ reviewStatus: 'rejected' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_approved');
    expect(draftStore).toHaveLength(0);
  });

  it('refuses a needs_changes recommendation', async () => {
    const rec = makeRec({ reviewStatus: 'needs_changes' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_approved');
    expect(draftStore).toHaveLength(0);
  });

  it('refuses a resolved recommendation even if approved', async () => {
    const rec = makeRec({ status: 'resolved', reviewStatus: 'approved' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_open');
    expect(draftStore).toHaveLength(0);
  });

  it('refuses an unknown recommendation id', async () => {
    const result = await generateChangeDraft({ recommendationId: new mongoose.Types.ObjectId().toString(), generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('refuses a malformed recommendation id', async () => {
    const result = await generateChangeDraft({ recommendationId: 'not-an-object-id', generatedBy });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('generates a draft for an approved + open recommendation', async () => {
    const rec = makeRec({ status: 'open', reviewStatus: 'approved' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.status).toBe('draft');
      expect(result.draft.generatorVersion).toBe(GENERATOR_VERSION);
      expect(String(result.draft.generatedBy)).toBe(generatedBy);
      expect(String(result.draft.recommendationId)).toBe(String(rec._id));
    }
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — regeneration is failure-safe (create-first, then supersede)', () => {
  it('a) successful regeneration leaves exactly the newest draft active and the older draft superseded', async () => {
    const rec = makeRec();
    recStore.push(rec);

    const first = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(first.ok).toBe(true);
    const second = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(second.ok).toBe(true);

    if (first.ok && second.ok) {
      expect(String(first.draft._id)).not.toBe(String(second.draft._id));
      const history = await listChangeDrafts(String(rec._id));
      expect(history).toHaveLength(2);
      const firstPersisted = history!.find((d) => String(d._id) === String(first.draft._id))!;
      const secondPersisted = history!.find((d) => String(d._id) === String(second.draft._id))!;
      expect(firstPersisted.status).toBe('superseded');
      expect(secondPersisted.status).toBe('draft');
      // Exactly one active draft — never zero, never two.
      expect(history!.filter((d) => d.status === 'draft')).toHaveLength(1);
    }
  });

  it('b) if creation of the replacement draft fails, the existing active draft remains active', async () => {
    const rec = makeRec();
    recStore.push(rec);

    const first = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(first.ok).toBe(true);

    createShouldFail = true;
    await expect(generateChangeDraft({ recommendationId: String(rec._id), generatedBy })).rejects.toThrow(
      'simulated create() failure',
    );

    const history = await listChangeDrafts(String(rec._id));
    expect(history).toHaveLength(1); // no partial/replacement draft was persisted
    expect(history![0].status).toBe('draft'); // the original draft was never superseded
    if (first.ok) expect(String(history![0]._id)).toBe(String(first.draft._id));
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — metadata generation', () => {
  it('produces current/proposed title+description grounded in stored evidence', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: ['https://rajhanstea.com/product/darjeeling-gold/', 'https://rajhanstea.com/product/assam-strong/'],
      evidence: {
        sharedTitles: [
          {
            value: 'Buy Premium Tea Online',
            urls: ['https://rajhanstea.com/product/darjeeling-gold/', 'https://rajhanstea.com/product/assam-strong/'],
          },
        ],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes).toHaveLength(2);
    for (const c of changes) {
      expect(c.kind).toBe('metadata');
      expect(c.fields.title?.current).toBe('Buy Premium Tea Online');
      expect(c.fields.title?.proposed).toContain('Buy Premium Tea Online');
      expect(c.fields.title?.proposed).not.toBe(c.fields.title?.current); // differentiated, never a verbatim duplicate
    }
    expect(result.draft.validation.errors).toEqual([]);
    expect(result.draft.validation.isValid).toBe(true); // e) metadata drafts are unaffected by the structured_data placeholder rule
  });

  it('falls back to a generic proposal when no duplicate value is present in evidence', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: ['https://rajhanstea.com/product/darjeeling-gold/'],
      evidence: { sharedTitles: [], sharedDescriptions: [] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as GenericProposedChange[];
    expect(changes[0].kind).toBe('generic');
  });
});

// -----------------------------------------------------------------------------
// Phase 5.2 → 5.3 fix: the audit records the RENDERED <title>, but a CMS Page's
// frontend template appends " — Rajhans Tea" at render time — that suffix is
// never stored in Page.metaTitle. For CMS Page targets only, `current` (and any
// `proposed` built from it) must reflect the STORAGE representation, so Phase
// 5.3's stale comparison and write are truthful about what is actually in the DB.
// -----------------------------------------------------------------------------
describe('generateChangeDraft — CMS Page rendered-title → storage-title normalization', () => {
  const cmsPageUrl = 'https://rajhanstea.com/page/shipping-policy/';

  it('strips the exact trailing " — Rajhans Tea" branding suffix, storing the storage-form value as current', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [cmsPageUrl],
      evidence: {
        sharedTitles: [{ value: 'Shipping Policy — Rajhans Tea', urls: [cmsPageUrl] }],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.title?.current).toBe('Shipping Policy');
  });

  it('builds the proposed title from the storage-form current, never from the rendered branded title', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [cmsPageUrl],
      evidence: {
        sharedTitles: [{ value: 'Shipping Policy — Rajhans Tea', urls: [cmsPageUrl] }],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.title?.proposed).toBe('Shipping Policy — Shipping Policy');
    expect(changes[0].fields.title?.proposed).not.toContain('Rajhans Tea');
  });

  it('removes only ONE exact trailing occurrence of the suffix, never repeatedly', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [cmsPageUrl],
      evidence: {
        sharedTitles: [{ value: 'Shipping Policy — Rajhans Tea — Rajhans Tea', urls: [cmsPageUrl] }],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.title?.current).toBe('Shipping Policy — Rajhans Tea');
  });

  it('preserves a "Rajhans Tea" phrase that is not at the very end of the title', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [cmsPageUrl],
      evidence: {
        sharedTitles: [{ value: 'Rajhans Tea Shipping Policy — Rajhans Tea', urls: [cmsPageUrl] }],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.title?.current).toBe('Rajhans Tea Shipping Policy');
  });

  it('leaves a non-CMS-Page URL\'s rendered title evidence unchanged', async () => {
    const productUrl = 'https://rajhanstea.com/product/darjeeling-gold/';
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [productUrl],
      evidence: {
        sharedTitles: [{ value: 'Darjeeling Gold — Rajhans Tea', urls: [productUrl] }],
        sharedDescriptions: [],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.title?.current).toBe('Darjeeling Gold — Rajhans Tea');
  });

  it('leaves metaDescription current/proposed behavior unchanged for a CMS Page target', async () => {
    const rec = makeRec({
      category: 'metadata',
      recommendationId: 'duplicate-metadata',
      affectedUrls: [cmsPageUrl],
      evidence: {
        sharedTitles: [],
        sharedDescriptions: [{ value: 'Our shipping policy — Rajhans Tea ships fast.', urls: [cmsPageUrl] }],
      },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as MetadataProposedChange[];
    expect(changes[0].fields.metaDescription?.current).toBe('Our shipping policy — Rajhans Tea ships fast.');
    expect(changes[0].fields.metaDescription?.proposed).toBe('Our shipping policy — Rajhans Tea ships fast. Shipping Policy.');
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — structured data generation', () => {
  it('produces a serializable JSON-LD skeleton with @context/@type', async () => {
    const rec = makeRec({
      category: 'schema',
      recommendationId: 'add-organization-schema',
      affectedUrls: ['https://rajhanstea.com/'],
      evidence: { pages: [{ url: 'https://rajhanstea.com/', schemaTypes: [] }] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changes = result.draft.proposedChanges as StructuredDataProposedChange[];
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('structured_data');
    expect(changes[0].schemaType).toBe('Organization');
    expect(changes[0].jsonLd['@context']).toBe('https://schema.org');
    expect(changes[0].jsonLd['@type']).toBe('Organization');
    expect(() => JSON.stringify(changes[0].jsonLd)).not.toThrow();
  });

  it('a) Organization skeleton with unresolved placeholders => isValid false', async () => {
    const rec = makeRec({
      category: 'schema',
      recommendationId: 'add-organization-schema',
      affectedUrls: ['https://rajhanstea.com/'],
      evidence: { pages: [{ url: 'https://rajhanstea.com/', schemaTypes: [] }] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft.validation.isValid).toBe(false);
    expect(result.draft.validation.errors.some((e) => e.includes('jsonLd contains unresolved required placeholders'))).toBe(true);
    // the human-readable warning explaining WHY placeholders exist is kept
    expect(result.draft.validation.warnings.some((w) => w.includes('structural JSON-LD skeleton only'))).toBe(true);
  });

  it('b) + c) Product skeleton with a recursively-nested Offer placeholder => isValid false', async () => {
    const rec = makeRec({
      category: 'schema',
      recommendationId: 'product-schema-completeness',
      affectedUrls: ['https://rajhanstea.com/product/darjeeling-gold/'],
      evidence: { pages: [{ url: 'https://rajhanstea.com/product/darjeeling-gold/', schemaTypes: [] }] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changes = result.draft.proposedChanges as StructuredDataProposedChange[];
    const offers = changes[0].jsonLd['offers'] as Record<string, unknown>;
    expect(offers.price).toBe('REQUIRED — populate before use'); // nested two levels deep (jsonLd.offers.price)
    expect(result.draft.validation.isValid).toBe(false);
    expect(result.draft.validation.errors.some((e) => e.includes('jsonLd contains unresolved required placeholders'))).toBe(true);
  });

  it('d) a fully-populated structured_data skeleton (no placeholder anywhere) remains valid', async () => {
    // BreadcrumbList has no business-specific placeholder fields — only an
    // empty itemListElement array, which must NOT be treated as a placeholder.
    const rec = makeRec({
      category: 'schema',
      recommendationId: 'add-breadcrumb-schema',
      affectedUrls: ['https://rajhanstea.com/product/darjeeling-gold/'],
      evidence: { pages: [{ url: 'https://rajhanstea.com/product/darjeeling-gold/', schemaTypes: [] }] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changes = result.draft.proposedChanges as StructuredDataProposedChange[];
    expect(changes[0].jsonLd['itemListElement']).toEqual([]);
    expect(result.draft.validation.errors).toEqual([]);
    expect(result.draft.validation.isValid).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — internal link generation', () => {
  it('produces a target-grounded proposal with source/anchor left explicit when evidence is insufficient', async () => {
    const rec = makeRec({
      category: 'internal-linking',
      recommendationId: 'link-orphan-pages',
      affectedUrls: ['https://rajhanstea.com/blog/how-to-brew-darjeeling-tea/'],
      evidence: { orphanUrls: ['https://rajhanstea.com/blog/how-to-brew-darjeeling-tea/'] },
    });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const changes = result.draft.proposedChanges as InternalLinkProposedChange[];
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('internal_link');
    expect(changes[0].targetUrl).toBe('https://rajhanstea.com/blog/how-to-brew-darjeeling-tea/');
    expect(changes[0].sourceUrl).toBeNull(); // never fabricated — not present in stored evidence
    expect(changes[0].anchorText).toBe('How To Brew Darjeeling Tea'); // mechanical from the URL, not invented
    expect(result.draft.validation.warnings.length).toBeGreaterThan(0);
    expect(result.draft.validation.isValid).toBe(true); // missing source is a warning, not a hard error
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — generic fallback', () => {
  it('is used for categories without a dedicated deterministic rule', async () => {
    const rec = makeRec({ category: 'indexability', recommendationId: 'indexability' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = result.draft.proposedChanges as GenericProposedChange[];
    expect(changes[0].kind).toBe('generic');
    expect(changes[0].summary).toBe(rec.title);
    expect(changes[0].instructions).toBe(rec.suggestedFix);
    expect(result.draft.validation.isValid).toBe(true); // e) generic drafts are unaffected by the structured_data placeholder rule
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — validation errors', () => {
  it('marks the draft invalid when the generic fallback has no usable instructions', async () => {
    const rec = makeRec({ category: 'indexability', recommendationId: 'indexability', suggestedFix: '', why: '' });
    recStore.push(rec);
    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.validation.isValid).toBe(false);
    expect(result.draft.validation.errors.some((e) => e.includes('instructions are empty'))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — never mutates the recommendation', () => {
  it('leaves status/reviewStatus/reviewedAt/reviewNote untouched', async () => {
    const reviewedAt = new Date('2026-01-01T00:00:00Z');
    const rec = makeRec({ status: 'open', reviewStatus: 'approved', reviewNote: 'looks good', reviewedAt });
    recStore.push(rec);
    const before = { ...rec };

    await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });

    expect(rec.status).toBe(before.status);
    expect(rec.reviewStatus).toBe(before.reviewStatus);
    expect(rec.reviewNote).toBe(before.reviewNote);
    expect(rec.reviewedAt).toBe(before.reviewedAt);
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — no DataForSEO dependency', () => {
  it('the generator source never imports the DataForSEO provider/client/config', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/modules/seo/services/change-draft-generator.service.ts'),
      'utf8',
    );
    const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.some((l) => l.toLowerCase().includes('dataforseo'))).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('generateChangeDraft — duplicate recommendationId/fingerprint handled by Mongo _id', () => {
  it('generates only for the targeted _id, leaving a same-recommendationId decoy untouched', async () => {
    const rec = makeRec({ recommendationId: 'shared-reco-id', fingerprint: 'fp-shared' });
    const decoy = makeRec({ recommendationId: 'shared-reco-id', fingerprint: 'fp-shared-2' });
    recStore.push(rec, decoy);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.draft.recommendationId)).toBe(String(rec._id));

    const decoyHistory = await listChangeDrafts(String(decoy._id));
    expect(decoyHistory).toHaveLength(0);
    const recHistory = await listChangeDrafts(String(rec._id));
    expect(recHistory).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
describe('recommendationExists', () => {
  it('returns true only for a real, valid id', async () => {
    const rec = makeRec();
    recStore.push(rec);
    expect(await recommendationExists(String(rec._id))).toBe(true);
    expect(await recommendationExists(new mongoose.Types.ObjectId().toString())).toBe(false);
    expect(await recommendationExists('not-an-object-id')).toBe(false);
  });
});
