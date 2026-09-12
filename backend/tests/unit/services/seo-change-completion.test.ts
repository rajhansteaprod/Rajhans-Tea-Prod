// =============================================================================
// UNIT TESTS — SEO Phase 5.4B human completion service
// Mocks SeoChangeExecution/SeoChangeVerification/SeoChangeCompletion the same
// way the Phase 5.3/5.4A tests do (plain in-memory `store` arrays). The
// SeoRecommendation and Page models are mocked as pure spies so the tests can
// assert the load-bearing safety property directly: completing an execution
// creates its immutable record and touches NOTHING else — no Page write, and
// in particular no write to SeoRecommendation.status/resolvedRunId, which stay
// owned by audit/GSC/market evidence reconciliation. No real DB is needed.
// =============================================================================

import mongoose from 'mongoose';

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  targetType: string;
  status: string;
  targets: unknown[];
}

interface FakeVerification {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  verifiedAt: Date;
  status: 'verified' | 'mismatch' | 'fetch_failed';
  targets: { mismatchFields: string[] }[];
}

interface FakePublication {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  status: 'pending' | 'building' | 'published' | 'failed';
}

interface FakeCompletion {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  verificationId: mongoose.Types.ObjectId;
  completedByUserId: mongoose.Types.ObjectId;
  completedAt: Date;
  status: string;
  completionVersion: string;
  createdAt: Date;
}

let execStore: FakeExecution[] = [];
let verStore: FakeVerification[] = [];
let compStore: FakeCompletion[] = [];
let pubStore: FakePublication[] = [];

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

function makeVerification(execution: FakeExecution, fields: Partial<FakeVerification> = {}): FakeVerification {
  return {
    _id: new mongoose.Types.ObjectId(),
    executionId: execution._id,
    recommendationId: execution.recommendationId,
    draftId: execution.draftId,
    verifiedAt: new Date('2026-03-01T00:00:00Z'),
    status: 'verified',
    targets: [{ mismatchFields: [] }],
    ...fields,
  };
}

function makePublication(execution: FakeExecution, fields: Partial<FakePublication> = {}): FakePublication {
  return {
    _id: new mongoose.Types.ObjectId(),
    executionId: execution._id,
    status: 'published',
    ...fields,
  };
}

function makeCompletion(fields: Partial<FakeCompletion> = {}): FakeCompletion {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    executionId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    verificationId: new mongoose.Types.ObjectId(),
    completedByUserId: new mongoose.Types.ObjectId(),
    completedAt: now,
    status: 'completed',
    completionVersion: '',
    createdAt: now,
    ...fields,
  };
}

jest.mock('../../../src/modules/seo/models/seo-change-execution.model', () => ({
  SeoChangeExecution: {
    findById: jest.fn((id: unknown) => ({
      exec: async () => execStore.find((e) => String(e._id) === String(id)) ?? null,
    })),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-verification.model', () => ({
  SeoChangeVerification: {
    findOne: jest.fn((query: { executionId?: unknown; status?: string }) => ({
      sort: () => ({
        exec: async () =>
          verStore
            .filter(
              (v) =>
                String(v.executionId) === String(query.executionId) &&
                (query.status === undefined || v.status === query.status),
            )
            .sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime())[0] ?? null,
      }),
    })),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-completion.model', () => ({
  SeoChangeCompletion: {
    init: jest.fn(async () => undefined),
    exists: jest.fn(async (query: { executionId?: unknown }) =>
      compStore.some((c) => String(c.executionId) === String(query.executionId)) ? { _id: 'x' } : null,
    ),
    create: jest.fn(async (doc: Partial<FakeCompletion>) => {
      if (compStore.some((c) => String(c.executionId) === String(doc.executionId))) {
        throw Object.assign(new Error('E11000 duplicate key error: executionId'), { code: 11000 });
      }
      const created = makeCompletion(doc);
      compStore.push(created);
      return created;
    }),
    find: jest.fn((query: { executionId?: unknown }) => ({
      sort: () => ({
        exec: async () =>
          compStore
            .filter((c) => String(c.executionId) === String(query.executionId))
            .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()),
      }),
    })),
    findById: jest.fn((id: unknown) => ({
      exec: async () => compStore.find((c) => String(c._id) === String(id)) ?? null,
    })),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-publication.model', () => ({
  SeoChangePublication: {
    findOne: jest.fn((query: { executionId?: unknown; status?: string }) => ({
      exec: async () =>
        pubStore.find(
          (p) => String(p.executionId) === String(query.executionId) && (query.status === undefined || p.status === query.status),
        ) ?? null,
    })),
  },
}));

// Pure spies — completion must never reach for either of these models at all.
jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

import {
  completeExecution,
  listCompletionsForExecution,
  getCompletionById,
  toCompletionView,
  COMPLETION_VERSION,
} from '../../../src/modules/seo/services/change-completion.service';
import { SeoChangeCompletion } from '../../../src/modules/seo/models/seo-change-completion.model';
import { SeoRecommendation } from '../../../src/modules/seo/models/seo-recommendation.model';
import { Page } from '../../../src/modules/cms/models/page.model';

const mockInit = SeoChangeCompletion.init as jest.Mock;
const mockExists = SeoChangeCompletion.exists as jest.Mock;
const mockCreate = SeoChangeCompletion.create as jest.Mock;

const completedByUserId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  execStore = [];
  verStore = [];
  compStore = [];
  pubStore = [];
  jest.clearAllMocks();
});

/** Every mocked accessor on the recommendation/page models, for "was never touched" assertions. */
function untouchedModelSpies(): jest.Mock[] {
  return [
    ...Object.values(SeoRecommendation as unknown as Record<string, jest.Mock>),
    ...Object.values(Page as unknown as Record<string, jest.Mock>),
  ];
}

// -----------------------------------------------------------------------------
describe('completeExecution — eligibility gate', () => {
  it('rejects a malformed execution id', async () => {
    const result = await completeExecution({ executionId: 'not-an-object-id', completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_id');
    expect(compStore).toHaveLength(0);
  });

  it('rejects when the execution does not exist (404)', async () => {
    const result = await completeExecution({
      executionId: String(new mongoose.Types.ObjectId()),
      completedByUserId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('rejects an execution that is not in the succeeded state', async () => {
    const execution = makeExecution({ status: 'failed' });
    execStore.push(execution);
    const verification = makeVerification(execution);
    verStore.push(verification);

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(compStore).toHaveLength(0);
  });

  it('rejects an execution whose target type is outside the supported Phase 5.3 scope', async () => {
    const execution = makeExecution({ targetType: 'blog' as unknown as 'cms_page' });
    execStore.push(execution);
    verStore.push(makeVerification(execution));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(compStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('completeExecution — verification requirement', () => {
  it('rejects when the execution has NO verification at all', async () => {
    const execution = makeExecution();
    execStore.push(execution);

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
    expect(compStore).toHaveLength(0);
  });

  it('rejects when the only verification is a mismatch', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    verStore.push(makeVerification(execution, { status: 'mismatch' }));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
  });

  it('rejects when the only verification is a fetch_failed attempt', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    verStore.push(makeVerification(execution, { status: 'fetch_failed' }));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
  });

  it('ignores a verified verification that belongs to a DIFFERENT execution', async () => {
    const execution = makeExecution();
    const other = makeExecution();
    execStore.push(execution, other);
    verStore.push(makeVerification(other));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
  });

  it('selects the NEWEST verified verification, ignoring older verified and newer non-verified attempts', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    const olderVerified = makeVerification(execution, { verifiedAt: new Date('2026-01-01T00:00:00Z') });
    const newerVerified = makeVerification(execution, { verifiedAt: new Date('2026-02-01T00:00:00Z') });
    const newestMismatch = makeVerification(execution, {
      verifiedAt: new Date('2026-03-01T00:00:00Z'),
      status: 'mismatch',
    });
    verStore.push(olderVerified, newestMismatch, newerVerified);

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.completion.verificationId)).toBe(String(newerVerified._id));
  });

  it('fails closed when the newest verified verification does not match the execution recommendation/draft', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    verStore.push(makeVerification(execution, { recommendationId: new mongoose.Types.ObjectId() }));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(compStore).toHaveLength(0);
  });

  it('fails closed when the newest verified verification points at a different draft', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    verStore.push(makeVerification(execution, { draftId: new mongoose.Types.ObjectId() }));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
  });
});

// -----------------------------------------------------------------------------
// Regression tests for blog_create completion support (the narrow addition on
// top of the otherwise-unchanged Phase 5.3/5.4A/5.4B gate above).
// -----------------------------------------------------------------------------
describe('completeExecution — blog_create support', () => {
  function setupBlog(overrides: { publication?: Partial<FakePublication> | null; verification?: Partial<FakeVerification> } = {}) {
    const execution = makeExecution({ targetType: 'blog_create' });
    execStore.push(execution);
    const verification = makeVerification(execution, overrides.verification);
    verStore.push(verification);
    if (overrides.publication !== null) {
      pubStore.push(makePublication(execution, overrides.publication ?? {}));
    }
    return { execution, verification };
  }

  it('A: a succeeded blog_create execution with a published publication and a clean verified verification completes', async () => {
    const { execution, verification } = setupBlog();

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.completion.executionId)).toBe(String(execution._id));
    expect(String(result.completion.verificationId)).toBe(String(verification._id));
    expect(compStore).toHaveLength(1);
  });

  it('B: rejects a blog_create execution with no associated publication at all', async () => {
    const { execution } = setupBlog({ publication: null });

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(compStore).toHaveLength(0);
  });

  it('C: rejects a blog_create execution whose publication is still pending/building (not yet live)', async () => {
    const { execution } = setupBlog({ publication: { status: 'building' } });

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
  });

  it('D: rejects a blog_create execution whose publication failed', async () => {
    const { execution } = setupBlog({ publication: { status: 'failed' } });

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
  });

  it('E: rejects a blog_create execution whose newest verification is mismatch (existing generic gate, unchanged)', async () => {
    const execution = makeExecution({ targetType: 'blog_create' });
    execStore.push(execution);
    verStore.push(makeVerification(execution, { status: 'mismatch' }));
    pubStore.push(makePublication(execution));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
  });

  it('F: rejects a blog_create execution whose "verified" verification still carries a non-empty mismatchFields (defensive double-check)', async () => {
    const { execution } = setupBlog({ verification: { targets: [{ mismatchFields: ['title'] }] } });

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
    expect(compStore).toHaveLength(0);
  });

  it('G: an UNRELATED execution\'s published publication cannot authorize completion of this execution', async () => {
    const execution = makeExecution({ targetType: 'blog_create' });
    const otherExecution = makeExecution({ targetType: 'blog_create' });
    execStore.push(execution, otherExecution);
    verStore.push(makeVerification(execution));
    // Publication belongs to a DIFFERENT execution — must not satisfy this one.
    pubStore.push(makePublication(otherExecution));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
  });

  it('H: an UNRELATED execution\'s verification cannot authorize completion of this execution (existing identity check, unchanged)', async () => {
    const execution = makeExecution({ targetType: 'blog_create' });
    const otherExecution = makeExecution({ targetType: 'blog_create' });
    execStore.push(execution, otherExecution);
    verStore.push(makeVerification(otherExecution));
    pubStore.push(makePublication(execution));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_verified');
  });

  it('I: a second completion attempt on an already-completed blog_create execution is rejected — no duplicate completion record', async () => {
    const { execution } = setupBlog();

    const first = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(first.ok).toBe(true);

    const second = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_completed');
    expect(compStore).toHaveLength(1);
  });

  it('J: completion never creates a Blog, execution, or publication — the mocked models here expose no create() for any of them', () => {
    // Structural guarantee: the SeoChangePublication mock above only exposes
    // findOne (a read). There is no create/save path completeExecution could
    // reach even by accident, and the SeoChangeExecution mock (from the top
    // of this file) exposes only findById.
    expect((require('../../../src/modules/seo/models/seo-change-publication.model').SeoChangePublication as Record<string, unknown>).create).toBeUndefined();
  });

  it('K: completion for a blog_create execution never reads or writes the CMS Blog model', () => {
    // change-completion.service.ts does not import the Blog model at all —
    // asserted directly against the source so this can never silently regress.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/modules/seo/services/change-completion.service.ts'),
      'utf8',
    );
    expect(src.includes("models/blog.model")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('completeExecution — successful completion record', () => {
  function setup() {
    const execution = makeExecution();
    execStore.push(execution);
    const verification = makeVerification(execution);
    verStore.push(verification);
    return { execution, verification };
  }

  it('creates exactly one immutable completion record with ids taken from the execution', async () => {
    const { execution, verification } = setup();
    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(compStore).toHaveLength(1);
    expect(String(result.completion.executionId)).toBe(String(execution._id));
    expect(String(result.completion.recommendationId)).toBe(String(execution.recommendationId));
    expect(String(result.completion.draftId)).toBe(String(execution.draftId));
    expect(String(result.completion.verificationId)).toBe(String(verification._id));
    expect(result.completion.status).toBe('completed');
    expect(result.completion.completionVersion).toBe(COMPLETION_VERSION);
    expect(COMPLETION_VERSION).toBe('5.4b-completion-v1');
  });

  it('records the AUTHENTICATED admin as the completing user', async () => {
    const { execution } = setup();
    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.completion.completedByUserId)).toBe(completedByUserId);
    expect(result.completion.completedAt).toBeInstanceOf(Date);
  });

  it('never touches the recommendation (status/resolvedRunId) or any Page', async () => {
    const { execution } = setup();
    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    for (const spy of untouchedModelSpies()) expect(spy).not.toHaveBeenCalled();
  });

  it('never mutates the execution or the verification it was based on', async () => {
    const { execution, verification } = setup();
    const execSnapshot = JSON.stringify(execution);
    const verSnapshot = JSON.stringify(verification);

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(execStore.find((e) => String(e._id) === String(execution._id)))).toBe(execSnapshot);
    expect(JSON.stringify(verStore.find((v) => String(v._id) === String(verification._id)))).toBe(verSnapshot);
  });
});

// -----------------------------------------------------------------------------
describe('completeExecution — idempotency / double completion', () => {
  function setup() {
    const execution = makeExecution();
    execStore.push(execution);
    verStore.push(makeVerification(execution));
    return execution;
  }

  it('rejects a second completion of the same execution', async () => {
    const execution = setup();
    const first = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(first.ok).toBe(true);

    const second = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_completed');
    expect(compStore.filter((c) => String(c.executionId) === String(execution._id))).toHaveLength(1);
  });

  it('maps a duplicate-key race (exists() missed it) to already_completed rather than throwing', async () => {
    const execution = setup();
    mockExists.mockResolvedValueOnce(null);
    compStore.push(makeCompletion({ executionId: execution._id }));

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('already_completed');
    expect(compStore.filter((c) => String(c.executionId) === String(execution._id))).toHaveLength(1);
  });

  it('two simultaneous completions of the same execution cannot both succeed', async () => {
    const execution = setup();
    const [r1, r2] = await Promise.all([
      completeExecution({ executionId: String(execution._id), completedByUserId }),
      completeExecution({ executionId: String(execution._id), completedByUserId }),
    ]);
    expect([r1, r2].filter((r) => r.ok)).toHaveLength(1);
    expect(compStore.filter((c) => String(c.executionId) === String(execution._id))).toHaveLength(1);
  });

  it('initializes the SeoChangeCompletion model/index before relying on duplicate-key idempotency', async () => {
    const execution = setup();
    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);

    expect(mockInit).toHaveBeenCalledTimes(1);
    const initOrder = mockInit.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(mockExists.mock.invocationCallOrder[0]);
    expect(initOrder).toBeLessThan(mockCreate.mock.invocationCallOrder[0]);
  });

  it('propagates an index-initialization failure without fabricating a completion', async () => {
    const execution = setup();
    mockInit.mockRejectedValueOnce(new Error('index build failed'));
    await expect(completeExecution({ executionId: String(execution._id), completedByUserId })).rejects.toThrow(
      'index build failed',
    );
    expect(compStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('completion history / views', () => {
  it('returns null for an invalid execution id and an array otherwise', async () => {
    expect(await listCompletionsForExecution('nope')).toBeNull();
    expect(await listCompletionsForExecution(String(new mongoose.Types.ObjectId()))).toEqual([]);
  });

  it('exposes completion history as an array, newest first', async () => {
    const executionId = new mongoose.Types.ObjectId();
    const older = makeCompletion({ executionId, completedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeCompletion({ executionId, completedAt: new Date('2026-02-01T00:00:00Z') });
    compStore.push(older, newer);

    const history = await listCompletionsForExecution(String(executionId));
    expect(history).toHaveLength(2);
    expect(String(history![0]._id)).toBe(String(newer._id));
  });

  it('returns null from getCompletionById for an invalid or unknown id', async () => {
    expect(await getCompletionById('nope')).toBeNull();
    expect(await getCompletionById(String(new mongoose.Types.ObjectId()))).toBeNull();
  });

  it('serializes an immutable completion view with string ids and no updatedAt', async () => {
    const execution = makeExecution();
    execStore.push(execution);
    const verification = makeVerification(execution);
    verStore.push(verification);

    const result = await completeExecution({ executionId: String(execution._id), completedByUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const view = toCompletionView(result.completion);
    expect(view).toEqual({
      id: String(result.completion._id),
      executionId: String(execution._id),
      recommendationId: String(execution.recommendationId),
      draftId: String(execution.draftId),
      verificationId: String(verification._id),
      completedByUserId,
      completedAt: result.completion.completedAt,
      status: 'completed',
      completionVersion: COMPLETION_VERSION,
      createdAt: result.completion.createdAt,
    });
    expect(view).not.toHaveProperty('updatedAt');
  });
});
