// =============================================================================
// UNIT TESTS — SEO Phase 5.4B controlled rollback service
// Mocks SeoChangeExecution/SeoChangeRollback/Page the same way the Phase 5.3
// execution tests do (plain in-memory `store` arrays), plus a fake mongoose
// ClientSession whose startTransaction()/abortTransaction() snapshot and
// restore the Page/rollback stores — so these tests genuinely exercise the
// all-or-nothing guarantee (a rejected multi-target rollback leaves NOTHING
// written), not just the eligibility branching.
//
// The load-bearing properties asserted here:
//  - restore values come ONLY from execution.targets[].before;
//  - only fields the execution actually wrote are restored, using exact
//    `!== undefined` presence (an executed empty string is a real field);
//  - a live value that no longer equals execution.after rejects the WHOLE
//    rollback rather than overwriting a newer change;
//  - Pass 1 performs ZERO Page writes;
//  - recommendation status/resolvedRunId and execution/verification/completion
//    history are never touched.
// No real DB is needed.
// =============================================================================

import mongoose from 'mongoose';

interface FakeFieldSnapshot {
  metaTitle?: string;
  metaDescription?: string;
}

interface FakeExecutedTarget {
  targetUrl: string;
  targetDocumentId: mongoose.Types.ObjectId;
  before: FakeFieldSnapshot;
  proposed: FakeFieldSnapshot;
  after: FakeFieldSnapshot;
}

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  targetType: string;
  status: string;
  targets: FakeExecutedTarget[];
}

interface FakePage {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'published';
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeRollback {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  rollbackUserId: mongoose.Types.ObjectId;
  rolledBackAt: Date;
  targetType: string;
  targets: unknown[];
  status: string;
  rollbackVersion: string;
  createdAt: Date;
}

let execStore: FakeExecution[] = [];
let pageStore: FakePage[] = [];
let rbStore: FakeRollback[] = [];

function pageUrl(slug: string, trailingSlash = true): string {
  return `https://rajhanstea.com/page/${slug}${trailingSlash ? '/' : ''}`;
}

function makePage(fields: Partial<FakePage> = {}): FakePage {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'About Us',
    slug: 'about-us',
    content: '<p>original content</p>',
    metaTitle: 'New Title',
    metaDescription: 'New description.',
    status: 'published',
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

function makeExecution(fields: Partial<FakeExecution> = {}): FakeExecution {
  return {
    _id: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    targetType: 'cms_page',
    status: 'succeeded',
    targets: [],
    ...fields,
  };
}

function makeRollback(fields: Partial<FakeRollback> = {}): FakeRollback {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    executionId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    rollbackUserId: new mongoose.Types.ObjectId(),
    rolledBackAt: now,
    targetType: 'cms_page',
    targets: [],
    status: 'succeeded',
    rollbackVersion: '',
    createdAt: now,
    ...fields,
  };
}

// ── Fake mongoose ClientSession — snapshots/restores pageStore + rbStore on
// startTransaction()/abortTransaction(), so an aborted transaction genuinely
// undoes any writes performed before the failure. ──
function makeSession() {
  let pageSnapshot: FakePage[] = [];
  let rbSnapshot: FakeRollback[] = [];
  return {
    startTransaction: jest.fn(() => {
      pageSnapshot = pageStore.map((p) => ({ ...p }));
      rbSnapshot = rbStore.map((r) => ({ ...r }));
    }),
    commitTransaction: jest.fn(async () => undefined),
    abortTransaction: jest.fn(async () => {
      pageStore.length = 0;
      pageStore.push(...pageSnapshot);
      rbStore.length = 0;
      rbStore.push(...rbSnapshot);
    }),
    endSession: jest.fn(),
  };
}

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return { ...actual, startSession: jest.fn(async () => makeSession()) };
});

interface SessionQuery<T> {
  session: jest.Mock;
  exec: () => Promise<T | null>;
}

function makeSessionQuery<T>(exec: () => Promise<T | null>): SessionQuery<T> {
  const query: SessionQuery<T> = { session: jest.fn(), exec };
  query.session.mockImplementation(() => query);
  return query;
}

jest.mock('../../../src/modules/seo/models/seo-change-execution.model', () => ({
  SeoChangeExecution: {
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => execStore.find((e) => String(e._id) === String(id)) ?? null),
    ),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-rollback.model', () => ({
  SeoChangeRollback: {
    init: jest.fn(async () => undefined),
    exists: jest.fn(async (query: { executionId?: unknown }) =>
      rbStore.some((r) => String(r.executionId) === String(query.executionId)) ? { _id: 'x' } : null,
    ),
    create: jest.fn(async (docs: Partial<FakeRollback>[]) => {
      const doc = docs[0];
      if (rbStore.some((r) => String(r.executionId) === String(doc.executionId))) {
        throw Object.assign(new Error('E11000 duplicate key error: executionId'), { code: 11000 });
      }
      const created = makeRollback(doc);
      rbStore.push(created);
      return [created];
    }),
    find: jest.fn((query: { executionId?: unknown }) => ({
      sort: () => ({
        exec: async () =>
          rbStore
            .filter((r) => String(r.executionId) === String(query.executionId))
            .sort((a, b) => b.rolledBackAt.getTime() - a.rolledBackAt.getTime()),
      }),
    })),
    findById: jest.fn((id: unknown) => ({
      exec: async () => rbStore.find((r) => String(r._id) === String(id)) ?? null,
    })),
  },
}));

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => pageStore.find((p) => String(p._id) === String(id)) ?? null),
    ),
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(
        async () =>
          pageStore.find((p) => p.slug === query.slug && (query.status === undefined || p.status === query.status)) ??
          null,
      ),
    ),
    findByIdAndUpdate: jest.fn((id: unknown, update: { $set: Record<string, unknown> }) => ({
      exec: async () => {
        const page = pageStore.find((p) => String(p._id) === String(id));
        if (!page) return null;
        Object.assign(page, update.$set);
        page.updatedAt = new Date();
        return page;
      },
    })),
  },
}));

// Pure spies — rollback must never reach for the recommendation, the draft, or
// the verification/completion history.
jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: { findById: jest.fn(), findByIdAndUpdate: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
}));

jest.mock('../../../src/modules/seo/models/seo-change-draft.model', () => ({
  SeoChangeDraft: { findById: jest.fn(), findByIdAndUpdate: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
}));

// Rollback must never delete or rewrite verification/completion history either.
jest.mock('../../../src/modules/seo/models/seo-change-verification.model', () => ({
  SeoChangeVerification: {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-completion.model', () => ({
  SeoChangeCompletion: {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
    updateOne: jest.fn(),
  },
}));

import {
  rollbackExecution,
  listRollbacksForExecution,
  getRollbackById,
  toRollbackView,
  wasFieldExecuted,
  ROLLBACK_VERSION,
} from '../../../src/modules/seo/services/change-rollback.service';
import { SeoChangeRollback } from '../../../src/modules/seo/models/seo-change-rollback.model';
import { SeoRecommendation } from '../../../src/modules/seo/models/seo-recommendation.model';
import { SeoChangeDraft } from '../../../src/modules/seo/models/seo-change-draft.model';
import { SeoChangeVerification } from '../../../src/modules/seo/models/seo-change-verification.model';
import { SeoChangeCompletion } from '../../../src/modules/seo/models/seo-change-completion.model';
import { Page } from '../../../src/modules/cms/models/page.model';
import { ExecutedTarget } from '../../../src/modules/seo/models/seo-change-execution.model';

const mockInit = SeoChangeRollback.init as jest.Mock;
const mockExists = SeoChangeRollback.exists as jest.Mock;
const mockCreate = SeoChangeRollback.create as jest.Mock;
const mockFindByIdAndUpdate = Page.findByIdAndUpdate as jest.Mock;

const rollbackUserId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  execStore = [];
  pageStore = [];
  rbStore = [];
  jest.clearAllMocks();
});

/** Every mocked accessor on the recommendation/draft/verification/completion models, for "was never touched" assertions. */
function untouchedModelSpies(): jest.Mock[] {
  return [
    ...Object.values(SeoRecommendation as unknown as Record<string, jest.Mock>),
    ...Object.values(SeoChangeDraft as unknown as Record<string, jest.Mock>),
    ...Object.values(SeoChangeVerification as unknown as Record<string, jest.Mock>),
    ...Object.values(SeoChangeCompletion as unknown as Record<string, jest.Mock>),
  ];
}

/** One published page + a single-target execution that wrote the given fields to it. */
function setupExecution(opts: {
  page?: Partial<FakePage>;
  before: FakeFieldSnapshot;
  proposed?: FakeFieldSnapshot;
  after: FakeFieldSnapshot;
  execution?: Partial<FakeExecution>;
  slug?: string;
}): { execution: FakeExecution; page: FakePage } {
  const slug = opts.slug ?? 'about-us';
  const page = makePage({ slug, ...opts.page });
  pageStore.push(page);
  const execution = makeExecution({
    targets: [
      {
        targetUrl: pageUrl(slug),
        targetDocumentId: page._id,
        before: opts.before,
        proposed: opts.proposed ?? opts.after,
        after: opts.after,
      },
    ],
    ...opts.execution,
  });
  execStore.push(execution);
  return { execution, page };
}

// -----------------------------------------------------------------------------
describe('rollbackExecution — eligibility gate', () => {
  it('rejects a malformed execution id', async () => {
    const result = await rollbackExecution({ executionId: 'not-an-object-id', rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_id');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the execution does not exist (404)', async () => {
    const result = await rollbackExecution({ executionId: String(new mongoose.Types.ObjectId()), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
    expect(rbStore).toHaveLength(0);
  });

  it('rejects an execution that is not in the succeeded state', async () => {
    const { execution } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
      execution: { status: 'failed' },
    });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an execution whose target type is outside the supported Phase 5.3 scope', async () => {
    const { execution } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
      execution: { targetType: 'product' },
    });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an execution with no recorded targets', async () => {
    const execution = makeExecution({ targets: [] });
    execStore.push(execution);
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
  });

  it('rejects a target that recorded no rollbackable metadata field at all', async () => {
    const { execution } = setupExecution({ before: {}, proposed: {}, after: {} });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — target resolution and identity', () => {
  it('rejects when the target Page no longer exists (404)', async () => {
    const execution = makeExecution({
      targets: [
        {
          targetUrl: pageUrl('about-us'),
          targetDocumentId: new mongoose.Types.ObjectId(),
          before: { metaTitle: 'Old Title' },
          proposed: { metaTitle: 'New Title' },
          after: { metaTitle: 'New Title' },
        },
      ],
    });
    execStore.push(execution);

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('target_not_found');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unpublished target page rather than editing a draft page', async () => {
    const { execution, page } = setupExecution({
      page: { status: 'draft' },
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('New Title');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the recorded URL no longer resolves to that same CMS page (re-slugged)', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
    // The page kept its _id but was given a new slug, so /page/about-us/ no
    // longer addresses it — rolling back under the stale URL is refused.
    pageStore.find((p) => String(p._id) === String(page._id))!.slug = 'about-us-2026';

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the recorded URL now resolves to a DIFFERENT page document', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
    pageStore.find((p) => String(p._id) === String(page._id))!.slug = 'about-us-old';
    pageStore.push(makePage({ slug: 'about-us', metaTitle: 'A totally different page' }));

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — restores only the fields the execution actually wrote', () => {
  it('rolls back a title-only execution and leaves the description untouched', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'New Title', metaDescription: 'Untouched description.' },
      before: { metaTitle: 'Old Title', metaDescription: 'Untouched description.' },
      proposed: { metaTitle: 'New Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const live = pageStore.find((p) => String(p._id) === String(page._id))!;
    expect(live.metaTitle).toBe('Old Title');
    expect(live.metaDescription).toBe('Untouched description.');

    // The write payload itself must not carry the untouched field at all.
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = mockFindByIdAndUpdate.mock.calls[0];
    expect(update.$set).toHaveProperty('metaTitle', 'Old Title');
    expect(update.$set).not.toHaveProperty('metaDescription');

    expect(result.rollback.targets[0].restored).toEqual({ metaTitle: 'Old Title' });
    expect(result.rollback.targets[0].beforeRollback).toEqual({ metaTitle: 'New Title' });
    expect(result.rollback.targets[0].afterRollback).toEqual({ metaTitle: 'Old Title' });
  });

  it('rolls back a description-only execution and leaves the title untouched', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'Untouched Title', metaDescription: 'New description.' },
      before: { metaTitle: 'Untouched Title', metaDescription: 'Old description.' },
      proposed: { metaDescription: 'New description.' },
      after: { metaDescription: 'New description.' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);

    const live = pageStore.find((p) => String(p._id) === String(page._id))!;
    expect(live.metaDescription).toBe('Old description.');
    expect(live.metaTitle).toBe('Untouched Title');

    const [, update] = mockFindByIdAndUpdate.mock.calls[0];
    expect(update.$set).toHaveProperty('metaDescription', 'Old description.');
    expect(update.$set).not.toHaveProperty('metaTitle');
  });

  it('rolls back a title + description execution', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'New Title', metaDescription: 'New description.' },
      before: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
      proposed: { metaTitle: 'New Title', metaDescription: 'New description.' },
      after: { metaTitle: 'New Title', metaDescription: 'New description.' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const live = pageStore.find((p) => String(p._id) === String(page._id))!;
    expect(live.metaTitle).toBe('Old Title');
    expect(live.metaDescription).toBe('Old description.');
    expect(result.rollback.targets[0].restored).toEqual({
      metaTitle: 'Old Title',
      metaDescription: 'Old description.',
    });
  });

  it('writes only the whitelisted metadata fields plus updatedBy, leaving the rest of the Page untouched', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
      after: { metaTitle: 'New Title', metaDescription: 'New description.' },
    });
    const snapshot = { ...page };

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);

    const live = pageStore.find((p) => String(p._id) === String(page._id))!;
    expect(live.title).toBe(snapshot.title);
    expect(live.slug).toBe(snapshot.slug);
    expect(live.content).toBe(snapshot.content);
    expect(live.status).toBe(snapshot.status);
    expect(live.createdAt).toEqual(snapshot.createdAt);
    expect(String(live.updatedBy)).toBe(rollbackUserId);
  });
});

// -----------------------------------------------------------------------------
// Exact field presence — `value !== undefined`, never truthiness. An execution
// that deliberately wrote an empty string DID execute that field.
// -----------------------------------------------------------------------------
describe('rollbackExecution — exact field presence (!== undefined)', () => {
  it('wasFieldExecuted treats an empty-string proposed/after value as executed and a missing one as not', () => {
    const base: ExecutedTarget = {
      targetUrl: pageUrl('about-us'),
      targetDocumentId: new mongoose.Types.ObjectId(),
      before: {},
      proposed: {},
      after: {},
    };
    expect(wasFieldExecuted({ ...base, proposed: { metaTitle: '' }, after: {} }, 'metaTitle')).toBe(true);
    expect(wasFieldExecuted({ ...base, proposed: {}, after: { metaTitle: '' } }, 'metaTitle')).toBe(true);
    expect(wasFieldExecuted({ ...base, proposed: {}, after: {} }, 'metaTitle')).toBe(false);
    expect(
      wasFieldExecuted({ ...base, proposed: { metaTitle: 'x' }, after: { metaTitle: 'x' } }, 'metaDescription'),
    ).toBe(false);
  });

  it('stale-checks an execution that deliberately wrote an EMPTY STRING and rolls it back', async () => {
    const { execution, page } = setupExecution({
      page: { metaDescription: '' },
      before: { metaDescription: 'Old description.' },
      proposed: { metaDescription: '' },
      after: { metaDescription: '' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaDescription).toBe('Old description.');
    expect(result.rollback.targets[0].beforeRollback).toEqual({ metaDescription: '' });
  });

  it('rejects as stale when an execution wrote an empty string but the live value is no longer empty', async () => {
    const { execution, page } = setupExecution({
      page: { metaDescription: 'Someone wrote a new description.' },
      before: { metaDescription: 'Old description.' },
      proposed: { metaDescription: '' },
      after: { metaDescription: '' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaDescription).toBe(
      'Someone wrote a new description.',
    );
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('restores an EMPTY-STRING original value faithfully instead of skipping the field', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'New Title' },
      before: { metaTitle: '' },
      proposed: { metaTitle: 'New Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('');
    const [, update] = mockFindByIdAndUpdate.mock.calls[0];
    expect(update.$set).toHaveProperty('metaTitle', '');
    expect(result.rollback.targets[0].restored).toEqual({ metaTitle: '' });
  });

  it('rolls back a field recorded ONLY in `after` (proposed absent) — presence is a union of both snapshots', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'New Title' },
      before: { metaTitle: 'Old Title' },
      proposed: {},
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('Old Title');
  });

  // The Page schema declares `default: ''` for metaTitle/metaDescription and
  // mongoose applies that default on hydration as well as on creation, so a
  // genuine Phase 5.3 execution's before/after snapshots always carry strings
  // and $unset is never needed. A record that somehow lacks one is refused
  // rather than being silently turned into an empty string.
  it('refuses to roll back a field whose original `before` value is absent, instead of writing an empty string', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'New Title' },
      before: {},
      proposed: { metaTitle: 'New Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('New Title');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses to roll back a field whose executed `after` value is absent (nothing to stale-check against)', async () => {
    const { execution } = setupExecution({
      page: { metaTitle: 'New Title' },
      before: { metaTitle: 'Old Title' },
      proposed: { metaTitle: 'New Title' },
      after: {},
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — stale / conflict protection', () => {
  it('rejects when the live title drifted from what the execution wrote', async () => {
    const { execution, page } = setupExecution({
      page: { metaTitle: 'Manual newer edit' },
      before: { metaTitle: 'Old' },
      proposed: { metaTitle: 'New' },
      after: { metaTitle: 'New' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    // The later human edit is preserved — never replaced by "Old".
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('Manual newer edit');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(rbStore).toHaveLength(0);
  });

  it('rejects when the live description drifted, even though the title still matches', async () => {
    const { execution } = setupExecution({
      page: { metaTitle: 'New Title', metaDescription: 'Edited by an admin later.' },
      before: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
      after: { metaTitle: 'New Title', metaDescription: 'New description.' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('ignores drift in a field the execution never wrote', async () => {
    const { execution } = setupExecution({
      page: { metaTitle: 'New Title', metaDescription: 'Changed by someone else entirely.' },
      before: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
      proposed: { metaTitle: 'New Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    expect(pageStore[0].metaDescription).toBe('Changed by someone else entirely.');
  });
});

// -----------------------------------------------------------------------------
// Genuinely two-pass: Pass 1 resolves/validates/stale-checks every target with
// NO writes; only once every target has passed does Pass 2 call
// cmsService.updatePageSeoMetadata (i.e. Page.findByIdAndUpdate).
// -----------------------------------------------------------------------------
describe('rollbackExecution — genuine two-pass multi-target rollback', () => {
  function twoTargetExecution(secondPage: Partial<FakePage> = {}): { execution: FakeExecution; pages: FakePage[] } {
    const one = makePage({ slug: 'page-one', metaTitle: 'New One' });
    const two = makePage({ slug: 'page-two', metaTitle: 'New Two', ...secondPage });
    pageStore.push(one, two);
    const execution = makeExecution({
      targets: [
        {
          targetUrl: pageUrl('page-one'),
          targetDocumentId: one._id,
          before: { metaTitle: 'Old One' },
          proposed: { metaTitle: 'New One' },
          after: { metaTitle: 'New One' },
        },
        {
          targetUrl: pageUrl('page-two'),
          targetDocumentId: two._id,
          before: { metaTitle: 'Old Two' },
          proposed: { metaTitle: 'New Two' },
          after: { metaTitle: 'New Two' },
        },
      ],
    });
    execStore.push(execution);
    return { execution, pages: [one, two] };
  }

  it('with 2 valid targets, both are restored in one transaction', async () => {
    const { execution } = twoTargetExecution();
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('Old One');
    expect(pageStore.find((p) => p.slug === 'page-two')!.metaTitle).toBe('Old Two');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(result.rollback.targets).toHaveLength(2);
    expect(rbStore).toHaveLength(1);
  });

  it('one stale target => updatePageSeoMetadata is called ZERO times and no rollback record is created', async () => {
    const { execution } = twoTargetExecution({ metaTitle: 'Someone edited page two' });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');

    // Two-pass: the second target fails during validation, so the first target
    // is never written in the first place — not written and then rolled back.
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('New One');
    expect(rbStore).toHaveLength(0);
  });

  it('one unpublished target => ZERO Page writes', async () => {
    const { execution } = twoTargetExecution({ status: 'draft' });
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('New One');
  });

  it('one missing target Page => ZERO Page writes', async () => {
    const { execution } = twoTargetExecution();
    execution.targets[1].targetDocumentId = new mongoose.Types.ObjectId();
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('target_not_found');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(rbStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — transaction behaviour', () => {
  it('aborts the transaction when a Page write fails, leaving no rollback record and no partial write', async () => {
    const one = makePage({ slug: 'page-one', metaTitle: 'New One' });
    const two = makePage({ slug: 'page-two', metaTitle: 'New Two' });
    pageStore.push(one, two);
    const execution = makeExecution({
      targets: [
        {
          targetUrl: pageUrl('page-one'),
          targetDocumentId: one._id,
          before: { metaTitle: 'Old One' },
          proposed: { metaTitle: 'New One' },
          after: { metaTitle: 'New One' },
        },
        {
          targetUrl: pageUrl('page-two'),
          targetDocumentId: two._id,
          before: { metaTitle: 'Old Two' },
          proposed: { metaTitle: 'New Two' },
          after: { metaTitle: 'New Two' },
        },
      ],
    });
    execStore.push(execution);

    // First write succeeds, the second blows up mid-Pass-2.
    const realImpl = mockFindByIdAndUpdate.getMockImplementation()!;
    mockFindByIdAndUpdate
      .mockImplementationOnce(realImpl)
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('write concern error');
        },
      }));

    await expect(rollbackExecution({ executionId: String(execution._id), rollbackUserId })).rejects.toThrow(
      'write concern error',
    );

    // The aborted transaction undid the first target's write.
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('New One');
    expect(pageStore.find((p) => p.slug === 'page-two')!.metaTitle).toBe('New Two');
    expect(rbStore).toHaveLength(0);
  });

  it('rolls the Page writes back when creating the rollback record fails', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
    mockCreate.mockRejectedValueOnce(new Error('record insert failed'));

    await expect(rollbackExecution({ executionId: String(execution._id), rollbackUserId })).rejects.toThrow(
      'record insert failed',
    );

    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('New Title');
    expect(rbStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — idempotency / double rollback', () => {
  function setup() {
    return setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
  }

  it('rejects a second rollback of the same execution', async () => {
    const { execution, page } = setup();
    const first = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(first.ok).toBe(true);

    const second = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_rolled_back');
    expect(rbStore.filter((r) => String(r.executionId) === String(execution._id))).toHaveLength(1);
    // The already-restored value is left exactly as the first rollback left it.
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('Old Title');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('maps a duplicate-key race (exists() missed it) to already_rolled_back rather than throwing', async () => {
    const { execution } = setup();
    mockExists.mockResolvedValueOnce(null);
    rbStore.push(makeRollback({ executionId: execution._id }));

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('already_rolled_back');
    expect(rbStore.filter((r) => String(r.executionId) === String(execution._id))).toHaveLength(1);
  });

  it('initializes the SeoChangeRollback model/index before relying on duplicate-key protection', async () => {
    const { execution } = setup();
    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);

    expect(mockInit).toHaveBeenCalledTimes(1);
    const initOrder = mockInit.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(mockExists.mock.invocationCallOrder[0]);
    expect(initOrder).toBeLessThan(mockCreate.mock.invocationCallOrder[0]);
  });

  it('propagates an index-initialization failure without touching the Page', async () => {
    const { execution, page } = setup();
    mockInit.mockRejectedValueOnce(new Error('index build failed'));
    await expect(rollbackExecution({ executionId: String(execution._id), rollbackUserId })).rejects.toThrow(
      'index build failed',
    );
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('New Title');
    expect(rbStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — forensic record and non-mutation guarantees', () => {
  it('records ids from the execution, the authenticated rollback user, and the version constant', async () => {
    const { execution } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(String(result.rollback.executionId)).toBe(String(execution._id));
    expect(String(result.rollback.recommendationId)).toBe(String(execution.recommendationId));
    expect(String(result.rollback.draftId)).toBe(String(execution.draftId));
    expect(String(result.rollback.rollbackUserId)).toBe(rollbackUserId);
    expect(result.rollback.status).toBe('succeeded');
    expect(result.rollback.targetType).toBe('cms_page');
    expect(result.rollback.rollbackVersion).toBe(ROLLBACK_VERSION);
    expect(ROLLBACK_VERSION).toBe('5.4b-rollback-v1');
    expect(String(pageStore[0].updatedBy)).toBe(rollbackUserId);
  });

  it('restores from execution.before only — never from the recommendation or the current draft', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    expect(pageStore.find((p) => String(p._id) === String(page._id))!.metaTitle).toBe('Old Title');
    // Neither the recommendation nor the draft is even read, so no later
    // regeneration can influence what gets written back.
    for (const spy of untouchedModelSpies()) expect(spy).not.toHaveBeenCalled();
  });

  it('leaves the execution, verification and completion history untouched — rollback only ADDS a record', async () => {
    const { execution } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    // No verification/completion document is read, rewritten or deleted: an
    // earlier completion stays exactly as it was written, and the presence of
    // the rollback record is what makes "rolled back" the current outcome.
    for (const spy of untouchedModelSpies()) expect(spy).not.toHaveBeenCalled();
    expect(rbStore).toHaveLength(1);
  });

  it('never mutates the execution record it rolled back', async () => {
    const { execution } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });
    const snapshot = JSON.stringify(execution);

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(execStore.find((e) => String(e._id) === String(execution._id)))).toBe(snapshot);
  });
});

// -----------------------------------------------------------------------------
describe('rollback history / views', () => {
  it('returns null for an invalid execution id and an array otherwise', async () => {
    expect(await listRollbacksForExecution('nope')).toBeNull();
    expect(await listRollbacksForExecution(String(new mongoose.Types.ObjectId()))).toEqual([]);
  });

  it('exposes rollback history as an array, newest first', async () => {
    const executionId = new mongoose.Types.ObjectId();
    const older = makeRollback({ executionId, rolledBackAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeRollback({ executionId, rolledBackAt: new Date('2026-02-01T00:00:00Z') });
    rbStore.push(older, newer);

    const history = await listRollbacksForExecution(String(executionId));
    expect(history).toHaveLength(2);
    expect(String(history![0]._id)).toBe(String(newer._id));
  });

  it('returns null from getRollbackById for an invalid or unknown id', async () => {
    expect(await getRollbackById('nope')).toBeNull();
    expect(await getRollbackById(String(new mongoose.Types.ObjectId()))).toBeNull();
  });

  it('serializes an immutable rollback view with string ids and no updatedAt', async () => {
    const { execution, page } = setupExecution({
      before: { metaTitle: 'Old Title' },
      after: { metaTitle: 'New Title' },
    });

    const result = await rollbackExecution({ executionId: String(execution._id), rollbackUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const view = toRollbackView(result.rollback);
    expect(view).toEqual({
      id: String(result.rollback._id),
      executionId: String(execution._id),
      recommendationId: String(execution.recommendationId),
      draftId: String(execution.draftId),
      rollbackUserId,
      rolledBackAt: result.rollback.rolledBackAt,
      targetType: 'cms_page',
      targets: [
        {
          targetUrl: pageUrl('about-us'),
          targetDocumentId: String(page._id),
          beforeRollback: { metaTitle: 'New Title' },
          restored: { metaTitle: 'Old Title' },
          afterRollback: { metaTitle: 'Old Title' },
        },
      ],
      status: 'succeeded',
      rollbackVersion: ROLLBACK_VERSION,
      createdAt: result.rollback.createdAt,
    });
    expect(view).not.toHaveProperty('updatedAt');
  });
});
