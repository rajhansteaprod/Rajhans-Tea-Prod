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

jest.mock('../../../src/modules/cms/models/blog.model', () => ({
  Blog: {
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
  },
}));

// Editorial-feedback propagation/safety tests (topical-authority blog_create
// path) mock the Product/ProductVariant lookups and the three AI
// sub-services directly — never the real OpenAI SDK/network.
let fakeProduct: Record<string, unknown> | null = null;
jest.mock('../../../src/modules/catalog/models/product.model', () => ({
  Product: {
    findOne: jest.fn(() => ({
      lean: async () => fakeProduct,
    })),
  },
}));
jest.mock('../../../src/modules/catalog/models/product-variant.model', () => ({
  ProductVariant: {
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => [],
      }),
    })),
  },
}));
jest.mock('../../../src/modules/seo/ai/openai-seo-blog-writer.service', () => ({
  writeGroundedBlogDraft: jest.fn(),
}));
jest.mock('../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service', () => ({
  verifyBlogDraftClaims: jest.fn(),
}));
jest.mock('../../../src/modules/seo/ai/openai-seo-blog-repair.service', () => ({
  repairGroundedBlogDraft: jest.fn(),
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
  BlogCreateProposedChange,
} from '../../../src/modules/seo/models/seo-change-draft.model';
import { writeGroundedBlogDraft } from '../../../src/modules/seo/ai/openai-seo-blog-writer.service';
import { verifyBlogDraftClaims } from '../../../src/modules/seo/ai/openai-seo-blog-claim-verifier.service';
import { repairGroundedBlogDraft } from '../../../src/modules/seo/ai/openai-seo-blog-repair.service';

const mockWriteBlog = writeGroundedBlogDraft as jest.Mock;
const mockVerifyBlog = verifyBlogDraftClaims as jest.Mock;
const mockRepairBlog = repairGroundedBlogDraft as jest.Mock;

const generatedBy = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  recStore = [];
  draftStore = [];
  createShouldFail = false;
  fakeProduct = null;
  mockWriteBlog.mockReset();
  mockVerifyBlog.mockReset();
  mockRepairBlog.mockReset();
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

// -----------------------------------------------------------------------------
// Editorial feedback (topical-authority autonomous article drafting) —
// propagation into the writer/repair calls and persistence in the audit
// trail, never into product drafting or any other recommendation category.
// -----------------------------------------------------------------------------
function makeTopicalAuthorityRec(): FakeRec {
  return makeRec({
    category: 'topical-authority',
    recommendationId: 'topical-authority-gap',
    affectedUrls: ['https://rajhanstea.com/product/rajhans-royal-darjeeling/'],
    evidence: { entity: 'Darjeeling' },
  });
}

function validBlogDraft(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    title: 'What Is Darjeeling Tea?',
    slug: 'darjeeling-tea-guide',
    metaTitle: 'What Is Darjeeling Tea? — Rajhans Tea',
    metaDescription: 'Learn about Darjeeling tea, a light, floral black tea from the Himalayan hills.',
    h1: 'What Is Darjeeling Tea?',
    contentHtml:
      '<p>Darjeeling tea is light and floral.</p>' +
      '<h2>Where It Comes From</h2><p>It is grown in Darjeeling.</p>' +
      '<h2>Choosing Your Pack</h2><p>See the <a href="https://rajhanstea.com/product/rajhans-royal-darjeeling/">Rajhans Royal Darjeeling product page</a>.</p>',
    proposedLinks: [{ href: 'https://rajhanstea.com/product/rajhans-royal-darjeeling/', anchor: 'Rajhans Royal Darjeeling product page' }],
    claimsUsed: ['light, floral'],
    unsupportedClaims: [],
    notes: [],
    ...overrides,
  };
}

function verifiedBlogResult(overrides: Record<string, unknown> = {}) {
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

describe('generateChangeDraft — editorial feedback (topical-authority blog_create only)', () => {
  beforeEach(() => {
    fakeProduct = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Rajhans Royal Darjeeling',
      slug: 'rajhans-royal-darjeeling',
      region: 'Darjeeling',
      description: 'A light, floral black tea.',
      shortDescription: 'Light and floral.',
      bestTakenFor: ['Noon'],
      hasVariants: false,
    };
  });

  it('passes editorialFeedback through to the blog writer call', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    mockWriteBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValue(verifiedBlogResult());

    await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Sound warmer and less mechanical.' });

    expect(mockWriteBlog).toHaveBeenCalledTimes(1);
    expect(mockWriteBlog.mock.calls[0][2]).toBe('Sound warmer and less mechanical.');
  });

  it('passes editorialFeedback through to the repair call when repair is triggered', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    mockWriteBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValueOnce(verifiedBlogResult({ verified: false, unsupportedClaims: ['bad'] }));
    mockRepairBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValueOnce(verifiedBlogResult());

    await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Simplify the wording.' });

    expect(mockRepairBlog).toHaveBeenCalledTimes(1);
    expect(mockRepairBlog.mock.calls[0][0].editorialFeedback).toBe('Simplify the wording.');
  });

  it('persists editorialFeedback verbatim in generationEvidence — the audit trail a reviewer sees', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    mockWriteBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValue(verifiedBlogResult());

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Sound warmer.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const evidence = (result.draft.inputSnapshot as { generationEvidence?: { editorialFeedback?: unknown } }).generationEvidence;
    expect(evidence?.editorialFeedback).toBe('Sound warmer.');
  });

  it('persists editorialFeedback as null when none is supplied', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    mockWriteBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValue(verifiedBlogResult());

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const evidence = (result.draft.inputSnapshot as { generationEvidence?: { editorialFeedback?: unknown } }).generationEvidence;
    expect(evidence?.editorialFeedback).toBeNull();
  });

  it('does not expand the allowed link set or bypass deterministic validation when feedback is supplied', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    // Even with feedback present, a draft linking outside the allowed set must still fail validation.
    mockWriteBlog.mockResolvedValue(
      validBlogDraft({ contentHtml: validBlogDraft().contentHtml + '<p>See <a href="https://example.com/x/">external</a>.</p>' }),
    );
    mockVerifyBlog.mockResolvedValue(verifiedBlogResult());
    mockRepairBlog.mockResolvedValue(
      validBlogDraft({ contentHtml: validBlogDraft().contentHtml + '<p>See <a href="https://example.com/x/">external</a>.</p>' }),
    );

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Make it friendlier.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const change = result.draft.proposedChanges[0] as BlogCreateProposedChange;
    expect(change.execution).toBeUndefined();
    expect(result.draft.validation.warnings.some((w) => w.includes('did not produce an executable proposal'))).toBe(true);
  });

  it('regeneration with different feedback produces a new draft with a new contentHash, never overwriting the prior draft', async () => {
    const rec = makeTopicalAuthorityRec();
    recStore.push(rec);
    mockWriteBlog.mockResolvedValue(validBlogDraft());
    mockVerifyBlog.mockResolvedValue(verifiedBlogResult());

    const first = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Sound warmer.' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    mockWriteBlog.mockResolvedValue(validBlogDraft({ title: 'What Is Darjeeling Tea? (Revised)' }));
    const second = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy, editorialFeedback: 'Sound even warmer.' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(String(second.draft._id)).not.toBe(String(first.draft._id));
    expect(second.draft.contentHash).not.toBe(first.draft.contentHash);

    const history = await listChangeDrafts(String(rec._id));
    expect(history).toHaveLength(2);
    const priorDraft = history!.find((d) => String(d._id) === String(first.draft._id))!;
    expect(priorDraft.proposedChanges).toEqual(first.draft.proposedChanges);
    expect(priorDraft.status).toBe('superseded');
  });

  it('editorialFeedback on a topical-authority recommendation never reaches product-content drafting or any other category generator', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/modules/seo/services/change-draft-generator.service.ts'),
      'utf8',
    );
    // generateGroundedProductDraft (Product.description AI drafting) must never be called with editorialFeedback.
    const productDraftCallLines = src.split('\n').filter((l) => l.includes('generateGroundedProductDraft('));
    expect(productDraftCallLines.some((l) => l.includes('editorialFeedback'))).toBe(false);
  });
});
