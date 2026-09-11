// =============================================================================
// UNIT TESTS — Phase 6.7B preview-before-approval lifecycle
//
// Exercises generateChangeDraft's new allowPreview option, the new
// approveRecommendationForDraft binding, and evaluateExecutionPreflight's
// approval_draft_mismatch check — using the same "plain in-memory store"
// mocking style already established elsewhere. No real DB, no OpenAI.
// =============================================================================

import mongoose from 'mongoose';
import { ProposedChange } from '../../../src/modules/seo/models/seo-change-draft.model';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

interface FakeRec {
  _id: mongoose.Types.ObjectId;
  fingerprint: string;
  recommendationId: string;
  category: string;
  source: string;
  status: 'open' | 'resolved';
  reviewStatus: ReviewStatus;
  affectedUrls: string[];
  evidence: Record<string, unknown>;
  reviewedDraftId: mongoose.Types.ObjectId | null;
  reviewedDraftContentHash: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedBy: mongoose.Types.ObjectId | null;
}

interface FakeDraft {
  _id: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  status: 'draft' | 'superseded';
  generatorVersion: string;
  proposedChanges: ProposedChange[];
  validation: { isValid: boolean; warnings: string[]; errors: string[] };
  contentHash: string;
  previewOnly: boolean;
}

interface FakePage {
  _id: mongoose.Types.ObjectId;
  slug: string;
  status: 'draft' | 'published';
  metaTitle: string;
  metaDescription: string;
  title: string;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let pageStore: FakePage[] = [];

function makeRec(fields: Partial<FakeRec> = {}): FakeRec {
  return {
    _id: new mongoose.Types.ObjectId(),
    fingerprint: 'fp-' + Math.random().toString(36).slice(2),
    recommendationId: 'content-opportunity:metadata-opportunity',
    category: 'metadata',
    source: 'content',
    status: 'open',
    reviewStatus: 'pending',
    affectedUrls: ['https://rajhanstea.com/page/about-us/'],
    evidence: {
      sharedTitles: [{ value: 'Duplicate Title', urls: ['https://rajhanstea.com/page/about-us/'] }],
    },
    reviewedDraftId: null,
    reviewedDraftContentHash: null,
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null,
    ...fields,
  };
}

function makePage(fields: Partial<FakePage> = {}): FakePage {
  return {
    _id: new mongoose.Types.ObjectId(),
    slug: 'about-us',
    status: 'published',
    metaTitle: 'Duplicate Title',
    metaDescription: 'Old description.',
    title: 'About Us',
    ...fields,
  };
}

interface SessionQuery<T> {
  session: jest.Mock;
  exec: () => Promise<T | null>;
}
function makeSessionQuery<T>(exec: () => Promise<T | null>): SessionQuery<T> {
  const query: SessionQuery<T> = { session: jest.fn(), exec };
  query.session.mockImplementation(() => query);
  return query;
}

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => recStore.find((d) => String(d._id) === String(id)) ?? null),
    ),
    findOne: jest.fn((query: { _id?: unknown; status?: string }) => ({
      exec: async () =>
        recStore.find((d) => String(d._id) === String(query._id) && (query.status === undefined || d.status === query.status)) ?? null,
    })),
    exists: jest.fn(async (query: { _id?: unknown }) => (recStore.some((d) => String(d._id) === String(query._id)) ? { _id: 'x' } : null)),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-draft.model', () => {
  const actual = jest.requireActual('../../../src/modules/seo/models/seo-change-draft.model');
  return {
    ...actual,
    SeoChangeDraft: {
      create: jest.fn(async (doc: Partial<FakeDraft>) => {
        const created: FakeDraft = {
          _id: new mongoose.Types.ObjectId(),
          recommendationId: doc.recommendationId!,
          recommendationFingerprint: doc.recommendationFingerprint ?? '',
          status: 'draft',
          generatorVersion: doc.generatorVersion ?? '',
          proposedChanges: doc.proposedChanges ?? [],
          validation: doc.validation ?? { isValid: true, warnings: [], errors: [] },
          contentHash: doc.contentHash ?? '',
          previewOnly: doc.previewOnly ?? false,
        };
        draftStore.push(created);
        return created;
      }),
      updateMany: jest.fn((query: { recommendationId?: unknown; status?: string; _id?: { $ne?: unknown } }, update: { $set: { status: 'draft' | 'superseded' } }) => ({
        exec: async () => {
          for (const d of draftStore) {
            if (String(d.recommendationId) !== String(query.recommendationId)) continue;
            if (query.status !== undefined && d.status !== query.status) continue;
            if (query._id?.$ne !== undefined && String(d._id) === String(query._id.$ne)) continue;
            d.status = update.$set.status;
          }
          return { acknowledged: true };
        },
      })),
      findById: jest.fn((id: unknown) =>
        makeSessionQuery(async () => draftStore.find((d) => String(d._id) === String(id)) ?? null),
      ),
    },
  };
});

jest.mock('../../../src/modules/seo/models/seo-change-execution.model', () => ({
  SeoChangeExecution: {
    exists: jest.fn(async () => null),
  },
}));

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(async () => pageStore.find((p) => p.slug === query.slug && (query.status === undefined || p.status === query.status)) ?? null),
    ),
    find: jest.fn(() => ({
      select: () => ({
        limit: () => ({
          session: () => ({
            exec: async () => [],
          }),
        }),
      }),
    })),
  },
}));

import { generateChangeDraft } from '../../../src/modules/seo/services/change-draft-generator.service';
import { approveRecommendationForDraft, updateRecommendationReview } from '../../../src/modules/seo/services/recommendation.service';
import { evaluateExecutionPreflight, PreflightBlockerCode } from '../../../src/modules/seo/services/change-execution-preflight.service';
import { SeoRecommendation } from '../../../src/modules/seo/models/seo-recommendation.model';

const mockRecFindOne = SeoRecommendation.findOne as jest.Mock;

// approveRecommendationForDraft/updateRecommendationReview call SeoRecommendation.findOne
// with { _id, status: 'open' } and then rec.save() — patch save() onto the
// in-memory object so mutations persist in recStore without a real DB.
function withSave(rec: FakeRec): FakeRec & { save: () => Promise<void> } {
  return Object.assign(rec, { save: async () => undefined });
}
mockRecFindOne.mockImplementation((query: { _id?: unknown; status?: string }) => ({
  exec: async () => {
    const rec = recStore.find((d) => String(d._id) === String(query._id) && (query.status === undefined || d.status === query.status));
    return rec ? withSave(rec) : null;
  },
}));

const executorUserId = String(new mongoose.Types.ObjectId());

beforeEach(() => {
  recStore = [];
  draftStore = [];
  pageStore = [];
  jest.clearAllMocks();
  mockRecFindOne.mockImplementation((query: { _id?: unknown; status?: string }) => ({
    exec: async () => {
      const rec = recStore.find((d) => String(d._id) === String(query._id) && (query.status === undefined || d.status === query.status));
      return rec ? withSave(rec) : null;
    },
  }));
});

function blockerCodes(blockers: { code: PreflightBlockerCode }[]): PreflightBlockerCode[] {
  return blockers.map((b) => b.code);
}

describe('J: a pending recommendation can create a preview draft', () => {
  it('generateChangeDraft with allowPreview:true succeeds for a pending recommendation', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId, allowPreview: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.draft as unknown as FakeDraft).previewOnly).toBe(true);
      expect((result.draft as unknown as FakeDraft).contentHash).toBeTruthy();
    }
  });

  it('generateChangeDraft WITHOUT allowPreview still rejects a pending recommendation (unchanged default behavior)', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);

    const result = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_approved');
  });
});

describe('K: a preview draft cannot execute while the recommendation is still pending', () => {
  it('preflight blocks with not_approved regardless of previewOnly', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());
    const draftResult = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId, allowPreview: true });
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;

    const { result } = await evaluateExecutionPreflight({ draftId: String(draftResult.draft._id) });
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('not_approved');
  });
});

describe('L: approval unlocks exactly the reviewed draft', () => {
  it('approveRecommendationForDraft binds approval to the draft id + content hash, and preflight then passes', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());
    const draftResult = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId, allowPreview: true });
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;

    const approval = await approveRecommendationForDraft({
      recommendationId: String(rec._id),
      draftId: String(draftResult.draft._id),
      reviewedBy: executorUserId,
    });
    expect(approval.ok).toBe(true);
    expect(rec.reviewStatus).toBe('approved');
    expect(String(rec.reviewedDraftId)).toBe(String(draftResult.draft._id));

    const { result } = await evaluateExecutionPreflight({ draftId: String(draftResult.draft._id) });
    expect(result.executable).toBe(true);
    expect(result.blockers).toEqual([]);
  });
});

describe('M: changing draft content after approval invalidates/stales that approval', () => {
  it('a NEW draft generated after approval does not inherit the old approval binding, and the OLD draft becomes superseded', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());

    const firstDraft = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId, allowPreview: true });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) return;

    const approval = await approveRecommendationForDraft({
      recommendationId: String(rec._id),
      draftId: String(firstDraft.draft._id),
      reviewedBy: executorUserId,
    });
    expect(approval.ok).toBe(true);

    // Regenerate — e.g. new evidence/AI wording — superseding the reviewed draft.
    rec.evidence = { sharedTitles: [{ value: 'A Different Duplicate Title', urls: rec.affectedUrls }] };
    const secondDraft = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) return;

    // The OLD (reviewed) draft is now superseded — cannot execute even
    // though the recommendation is still "approved".
    const oldPreflight = await evaluateExecutionPreflight({ draftId: String(firstDraft.draft._id) });
    expect(oldPreflight.result.executable).toBe(false);
    expect(blockerCodes(oldPreflight.result.blockers)).toContain('not_draft');

    // The NEW draft was never reviewed/bound — approval_draft_mismatch.
    const newPreflight = await evaluateExecutionPreflight({ draftId: String(secondDraft.draft._id) });
    expect(newPreflight.result.executable).toBe(false);
    expect(blockerCodes(newPreflight.result.blockers)).toContain('approval_draft_mismatch');
  });
});

describe('N: executable preflight still requires approval even for a previously-previewed draft', () => {
  it('a preview draft generated pre-approval becomes executable ONLY after a real, draft-bound approval', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());

    const draftResult = await generateChangeDraft({ recommendationId: String(rec._id), generatedBy: executorUserId, allowPreview: true });
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;

    let preflight = await evaluateExecutionPreflight({ draftId: String(draftResult.draft._id) });
    expect(preflight.result.executable).toBe(false);

    // The original (draft-agnostic) approval path also still works and is
    // sufficient on its own (reviewedDraftId stays null ⇒ no hash-binding
    // check runs) — preserves pre-6.7B behavior exactly.
    await updateRecommendationReview({ id: String(rec._id), reviewStatus: 'approved', reviewedBy: executorUserId });
    preflight = await evaluateExecutionPreflight({ draftId: String(draftResult.draft._id) });
    expect(preflight.result.executable).toBe(true);
  });
});
