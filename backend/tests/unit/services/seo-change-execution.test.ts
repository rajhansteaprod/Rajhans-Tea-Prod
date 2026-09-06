// =============================================================================
// UNIT TESTS — SEO Phase 5.3 controlled execution service
// Mocks SeoRecommendation/SeoChangeDraft/SeoChangeExecution/Page the same way
// the Phase 5.2 generator tests do (plain in-memory `store` arrays), plus a fake
// mongoose ClientSession that tracks the writes made through it and undoes
// exactly those (and no other session's) on abortTransaction() — so these tests
// genuinely exercise the all-or-nothing guarantee (a rejected multi-target draft
// leaves NOTHING written) and real transaction isolation under concurrency, not
// just the eligibility branching. No real DB is needed.
//
// Phase 5.5 note: execution's Pass 1 is now the shared preflight evaluator
// (change-execution-preflight.service.ts), so these tests exercise it through
// the real execute entry point — the eligibility contract asserted here is the
// Phase 5.3 contract, unchanged.
// =============================================================================

import mongoose from 'mongoose';
import { MetadataProposedChange, ProposedChange } from '../../../src/modules/seo/models/seo-change-draft.model';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

interface FakeRec {
  _id: mongoose.Types.ObjectId;
  fingerprint: string;
  status: 'open' | 'resolved';
  reviewStatus: ReviewStatus;
}

interface FakeDraft {
  _id: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  status: 'draft' | 'superseded';
  generatorVersion: string;
  proposedChanges: ProposedChange[];
  validation: { isValid: boolean; warnings: string[]; errors: string[] };
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

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  targetType: string;
  targets: unknown[];
  executorUserId: mongoose.Types.ObjectId;
  executedAt: Date;
  status: string;
  generatorVersion: string;
  executorVersion: string;
  errorCode: null;
  errorMessage: null;
  createdAt: Date;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let pageStore: FakePage[] = [];
let execStore: FakeExecution[] = [];

interface FakePublication {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  status: 'pending' | 'building' | 'published' | 'failed';
}

let publicationStore: FakePublication[] = [];

function makeRec(fields: Partial<FakeRec> = {}): FakeRec {
  return {
    _id: new mongoose.Types.ObjectId(),
    fingerprint: 'fp-' + Math.random().toString(36).slice(2),
    status: 'open',
    reviewStatus: 'approved',
    ...fields,
  };
}

function makeDraft(fields: Partial<FakeDraft> = {}): FakeDraft {
  return {
    _id: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    recommendationFingerprint: '',
    status: 'draft',
    generatorVersion: '5.2.0-rule-v1',
    proposedChanges: [],
    validation: { isValid: true, warnings: [], errors: [] },
    ...fields,
  };
}

function makePage(fields: Partial<FakePage> = {}): FakePage {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'About Us',
    slug: 'about-us',
    content: '<p>original content</p>',
    metaTitle: 'Old Title',
    metaDescription: 'Old description.',
    status: 'published',
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

function makeExecution(fields: Partial<FakeExecution> = {}): FakeExecution {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    recommendationFingerprint: '',
    targetType: 'cms_page',
    targets: [],
    executorUserId: new mongoose.Types.ObjectId(),
    executedAt: now,
    status: 'succeeded',
    generatorVersion: '',
    executorVersion: '',
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    ...fields,
  };
}

function pageUrl(slug: string, trailingSlash = true): string {
  return `https://rajhanstea.com/page/${slug}${trailingSlash ? '/' : ''}`;
}

function metadataChange(overrides: Partial<MetadataProposedChange> = {}): MetadataProposedChange {
  return {
    kind: 'metadata',
    targetUrl: pageUrl('about-us'),
    fields: { title: { current: 'Old Title', proposed: 'New Title' } },
    ...overrides,
  } as MetadataProposedChange;
}

// ── Fake mongoose ClientSession. Writes performed through a session are tagged
// with it (the Page/execution mocks below read `options.session`), and
// abortTransaction() undoes ONLY that session's own writes — never another
// session's. That models real Mongo transaction isolation, so the concurrency
// test can assert the genuine safety property (exactly one persisted execution)
// instead of depending on how two interleaved runs happen to be scheduled. ──
interface FakeSession {
  createdExecutionIds: string[];
  createdPublicationIds: string[];
  pageBackups: Map<string, FakePage>;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  abortTransaction: jest.Mock;
  endSession: jest.Mock;
}

function makeSession(): FakeSession {
  const session = {
    createdExecutionIds: [] as string[],
    createdPublicationIds: [] as string[],
    pageBackups: new Map<string, FakePage>(),
  } as FakeSession;

  const forget = () => {
    session.createdExecutionIds.length = 0;
    session.createdPublicationIds.length = 0;
    session.pageBackups.clear();
  };

  session.startTransaction = jest.fn(forget);
  session.commitTransaction = jest.fn(async () => forget());
  session.abortTransaction = jest.fn(async () => {
    for (const [id, backup] of session.pageBackups) {
      const page = pageStore.find((p) => String(p._id) === id);
      if (page) Object.assign(page, backup);
    }
    for (const id of session.createdExecutionIds) {
      const index = execStore.findIndex((e) => String(e._id) === id);
      if (index >= 0) execStore.splice(index, 1);
    }
    for (const id of session.createdPublicationIds) {
      const index = publicationStore.findIndex((p) => String(p._id) === id);
      if (index >= 0) publicationStore.splice(index, 1);
    }
    forget();
  });
  session.endSession = jest.fn();
  return session;
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

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => recStore.find((d) => String(d._id) === String(id)) ?? null),
    ),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-draft.model', () => {
  const actual = jest.requireActual('../../../src/modules/seo/models/seo-change-draft.model');
  return {
    ...actual,
    SeoChangeDraft: {
      findById: jest.fn((id: unknown) =>
        makeSessionQuery(async () => draftStore.find((d) => String(d._id) === String(id)) ?? null),
      ),
    },
  };
});

jest.mock('../../../src/modules/seo/models/seo-change-execution.model', () => ({
  SeoChangeExecution: {
    init: jest.fn(async () => undefined),
    exists: jest.fn(async (query: { draftId?: unknown }) =>
      execStore.some((d) => String(d.draftId) === String(query.draftId)) ? { _id: 'x' } : null,
    ),
    find: jest.fn((query: { draftId?: unknown }) => ({
      sort: () => ({
        exec: async () =>
          execStore
            .filter((d) => String(d.draftId) === String(query.draftId))
            .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime()),
      }),
    })),
    create: jest.fn(async (docs: Partial<FakeExecution>[], options?: { session?: FakeSession }) => {
      const doc = docs[0];
      if (execStore.some((d) => String(d.draftId) === String(doc.draftId))) {
        throw Object.assign(new Error('E11000 duplicate key error: draftId'), { code: 11000 });
      }
      const created = makeExecution(doc);
      execStore.push(created);
      options?.session?.createdExecutionIds.push(String(created._id));
      return [created];
    }),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-publication.model', () => ({
  SeoChangePublication: {
    init: jest.fn(async () => undefined),
    create: jest.fn(async (docs: any[], options?: { session?: FakeSession }) => {
      const doc = docs[0];
      const created: FakePublication = {
        _id: new mongoose.Types.ObjectId(),
        executionId: doc.executionId,
        recommendationId: doc.recommendationId,
        draftId: doc.draftId,
        status: doc.status,
      };
      publicationStore.push(created);
      options?.session?.createdPublicationIds.push(String(created._id));
      return [created];
    }),
  },
}));

// ── Phase 5.5 duplicate-metadata lookup emulation ──
interface DuplicateQuery {
  _id?: { $ne?: unknown };
  status?: string;
  $or?: ({ metaTitle?: string } | { metaDescription?: string })[];
}

interface ChainQuery {
  select: jest.Mock;
  limit: jest.Mock;
  session: jest.Mock;
  exec: () => Promise<FakePage[]>;
}

function makeDuplicateQuery(query: DuplicateQuery): ChainQuery {
  let cap = Number.POSITIVE_INFINITY;
  const chain: ChainQuery = {
    select: jest.fn(),
    limit: jest.fn(),
    session: jest.fn(),
    exec: async () =>
      pageStore
        .filter((p) => {
          if (query._id?.$ne !== undefined && String(p._id) === String(query._id.$ne)) return false;
          if (query.status !== undefined && p.status !== query.status) return false;
          if (!query.$or?.length) return true;
          return query.$or.some((clause) =>
            Object.entries(clause).every(([field, value]) => (p as unknown as Record<string, unknown>)[field] === value),
          );
        })
        .slice(0, cap),
  };
  chain.select.mockImplementation(() => chain);
  chain.limit.mockImplementation((n: number) => {
    cap = n;
    return chain;
  });
  chain.session.mockImplementation(() => chain);
  return chain;
}

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(
        async () =>
          pageStore.find(
            (p) => p.slug === query.slug && (query.status === undefined || p.status === query.status),
          ) ?? null,
      ),
    ),
    // Phase 5.5 — the bounded duplicate-metadata lookup. Emulates the exact
    // filter shape the preflight evaluator uses ({ _id: { $ne }, status, $or })
    // plus the select/limit/session/exec chain, over the same in-memory store.
    find: jest.fn((query: DuplicateQuery) => makeDuplicateQuery(query)),
    findByIdAndUpdate: jest.fn(
      (id: unknown, update: { $set: Record<string, unknown> }, options?: { session?: FakeSession }) => ({
        exec: async () => {
          const page = pageStore.find((p) => String(p._id) === String(id));
          if (!page) return null;
          const key = String(page._id);
          if (options?.session && !options.session.pageBackups.has(key)) {
            options.session.pageBackups.set(key, { ...page });
          }
          Object.assign(page, update.$set);
          page.updatedAt = new Date();
          return page;
        },
      }),
    ),
  },
}));

import {
  executeApprovedChangeDraft,
  resolveCmsPageTarget,
  toExecutionView,
} from '../../../src/modules/seo/services/change-execution.service';
import {
  evaluateExecutionPreflight,
  PREFLIGHT_VERSION,
} from '../../../src/modules/seo/services/change-execution-preflight.service';
import { SeoChangeExecution } from '../../../src/modules/seo/models/seo-change-execution.model';
import { Page } from '../../../src/modules/cms/models/page.model';

const mockInit = SeoChangeExecution.init as jest.Mock;
const mockExists = SeoChangeExecution.exists as jest.Mock;
const mockCreate = SeoChangeExecution.create as jest.Mock;
const mockFindByIdAndUpdate = Page.findByIdAndUpdate as jest.Mock;

const executorUserId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  publicationStore = [];
  recStore = [];
  draftStore = [];
  pageStore = [];
  execStore = [];
  jest.clearAllMocks();
});

function setupApprovedDraft(opts: {
  proposedChanges: ProposedChange[];
  validationIsValid?: boolean;
  page?: Partial<FakePage>;
}): { rec: FakeRec; draft: FakeDraft } {
  const rec = makeRec();
  recStore.push(rec);
  if (opts.page) pageStore.push(makePage(opts.page));
  const draft = makeDraft({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    proposedChanges: opts.proposedChanges,
    validation: { isValid: opts.validationIsValid ?? true, warnings: [], errors: [] },
  });
  draftStore.push(draft);
  return { rec, draft };
}

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — eligibility gate', () => {
  it('rejects a malformed draft id', async () => {
    const result = await executeApprovedChangeDraft({ draftId: 'not-an-object-id', executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_id');
  });

  it('rejects when the draft does not exist (404)', async () => {
    const result = await executeApprovedChangeDraft({ draftId: String(new mongoose.Types.ObjectId()), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('rejects a superseded draft', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange()], page: {} });
    draft.status = 'superseded';
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_draft');
    expect(pageStore[0].metaTitle).toBe('Old Title');
  });

  it('rejects when the recommendation no longer exists', async () => {
    const draft = makeDraft({ recommendationId: new mongoose.Types.ObjectId(), proposedChanges: [metadataChange()] });
    draftStore.push(draft);
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('recommendation_not_found');
  });

  it('rejects a resolved recommendation', async () => {
    const { draft, rec } = setupApprovedDraft({ proposedChanges: [metadataChange()], page: {} });
    rec.status = 'resolved';
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_open');
  });

  it('rejects a recommendation that is no longer approved', async () => {
    const { draft, rec } = setupApprovedDraft({ proposedChanges: [metadataChange()], page: {} });
    rec.reviewStatus = 'needs_changes';
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_approved');
  });

  it('rejects on recommendation fingerprint mismatch', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange()], page: {} });
    draft.recommendationFingerprint = 'stale-fingerprint';
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fingerprint_mismatch');
  });

  it('rejects a draft that failed validation', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange()], validationIsValid: false, page: {} });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_draft');
  });

  it('rejects a draft with no proposed changes', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [] });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_draft');
  });

  it.each([
    ['structured_data', { kind: 'structured_data', targetUrl: pageUrl('about-us'), schemaType: 'Organization', jsonLd: {} }],
    ['internal_link', { kind: 'internal_link', targetUrl: pageUrl('about-us'), sourceUrl: null, anchorText: null }],
    ['content', { kind: 'content', targetUrl: pageUrl('about-us'), blocks: [] }],
    ['faq', { kind: 'faq', targetUrl: pageUrl('about-us'), items: [] }],
    ['generic', { kind: 'generic', targetUrl: pageUrl('about-us'), summary: 's', instructions: 'i' }],
  ])('rejects an unsupported %s change', async (_label, change) => {
    const { draft } = setupApprovedDraft({ proposedChanges: [change as ProposedChange], page: {} });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_kind');
    expect(pageStore[0].metaTitle).toBe('Old Title');
  });

  it('rejects a metadata change that includes h1', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New' }, h1: { current: 'Old H1', proposed: 'New H1' } } })],
      page: {},
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_field');
    expect(pageStore[0].metaTitle).toBe('Old Title');
  });

  it('rejects a metadata change proposing no allowed field', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange({ fields: {} })], page: {} });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_field');
  });

  it('mixed metadata + unsupported kind rejects the ENTIRE draft, writing nothing', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange(), { kind: 'faq', targetUrl: pageUrl('about-us'), items: [] }],
      page: {},
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_kind');
    expect(pageStore[0].metaTitle).toBe('Old Title');
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — target resolution', () => {
  it('rejects an external host', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://example.com/page/about-us/' })],
      page: {},
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a blog target', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/blog/how-to-brew/' })],
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a product target', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/product/darjeeling-gold/' })],
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a category target', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/catalog/black-tea/' })],
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects the homepage', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/' })] });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects an admin/api path', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/admin/pages/123' })],
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a malformed page URL (no slug segment)', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com/page//' })],
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a target with no matching Page document (404-mapped)', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [metadataChange({ targetUrl: pageUrl('does-not-exist') })] });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('target_not_found');
  });

  it('resolves the same page with and without a trailing slash', async () => {
    pageStore.push(makePage({ slug: 'about-us' }));
    const withoutSlash = await resolveCmsPageTarget(pageUrl('about-us', false));
    const withSlash = await resolveCmsPageTarget(pageUrl('about-us', true));
    expect(withoutSlash.ok).toBe(true);
    expect(withSlash.ok).toBe(true);
    if (withoutSlash.ok && withSlash.ok) {
      expect(String(withoutSlash.page._id)).toBe(String(withSlash.page._id));
    }
  });

  it('resolves a canonical URL slug to a Page stored under its legacy slug', async () => {
    pageStore.push(makePage({ slug: 'terms-conditions' })); // legacy DB slug
    const resolution = await resolveCmsPageTarget(pageUrl('terms-and-conditions')); // canonical URL slug
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.page.slug).toBe('terms-conditions');
  });

  it('resolves a canonical page URL', async () => {
    pageStore.push(makePage({ slug: 'about-us' }));
    const resolution = await resolveCmsPageTarget(pageUrl('about-us'));
    expect(resolution.ok).toBe(true);
  });

  it('resolves the same canonical page URL without a trailing slash', async () => {
    pageStore.push(makePage({ slug: 'about-us' }));
    const resolution = await resolveCmsPageTarget(pageUrl('about-us', false));
    expect(resolution.ok).toBe(true);
  });

  it('rejects a target URL carrying a tracking query parameter (?utm_source=...)', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: `${pageUrl('about-us')}?utm_source=newsletter` })],
      page: { slug: 'about-us' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a target URL carrying an arbitrary query parameter (?foo=bar)', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: `${pageUrl('about-us')}?foo=bar` })],
      page: { slug: 'about-us' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a target URL carrying a fragment', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: `${pageUrl('about-us')}#section-2` })],
      page: { slug: 'about-us' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects a target URL carrying embedded userinfo credentials', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://admin:secret@rajhanstea.com/page/about-us/' })],
      page: { slug: 'about-us' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('rejects an alternate port on the same host', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://rajhanstea.com:8443/page/about-us/' })],
      page: { slug: 'about-us' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
  });

  it('resolveCmsPageTarget directly rejects query/hash/credentials even when the page exists', async () => {
    pageStore.push(makePage({ slug: 'about-us' }));
    expect((await resolveCmsPageTarget(`${pageUrl('about-us')}?utm_source=x`)).ok).toBe(false);
    expect((await resolveCmsPageTarget(`${pageUrl('about-us')}#top`)).ok).toBe(false);
    expect((await resolveCmsPageTarget('https://user:pass@rajhanstea.com/page/about-us/')).ok).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Phase 5.3 v1 is explicitly for LIVE CMS Page metadata — an unpublished/draft
// Page must resolve exactly as if no Page existed at all (not_found), for both
// the canonical and legacy-slug lookup paths.
// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — executable targets are published CMS Pages only', () => {
  it('a published canonical CMS Page resolves successfully', async () => {
    pageStore.push(makePage({ slug: 'about-us', status: 'published' }));
    const resolution = await resolveCmsPageTarget(pageUrl('about-us'));
    expect(resolution.ok).toBe(true);
  });

  it('an unpublished canonical CMS Page is rejected as not_found', async () => {
    pageStore.push(makePage({ slug: 'about-us', status: 'draft' }));
    const resolution = await resolveCmsPageTarget(pageUrl('about-us'));
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toBe('not_found');
  });

  it('a published legacy-slug Page resolves from its canonical URL', async () => {
    pageStore.push(makePage({ slug: 'terms-conditions', status: 'published' })); // legacy DB slug
    const resolution = await resolveCmsPageTarget(pageUrl('terms-and-conditions')); // canonical URL slug
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.page.slug).toBe('terms-conditions');
  });

  it('an unpublished legacy-slug Page is rejected as not_found', async () => {
    pageStore.push(makePage({ slug: 'terms-conditions', status: 'draft' }));
    const resolution = await resolveCmsPageTarget(pageUrl('terms-and-conditions'));
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toBe('not_found');
  });

  it('execution against an unpublished page performs zero Page writes and creates no execution record', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { slug: 'about-us', metaTitle: 'Old Title', status: 'draft' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('target_not_found');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore[0].metaTitle).toBe('Old Title');
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — stale/current-value protection', () => {
  it('succeeds when the live value matches the draft-recorded current value', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
  });

  it('rejects with a conflict when the live metaTitle has changed, writing nothing', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Someone Edited This' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(pageStore[0].metaTitle).toBe('Someone Edited This');
    expect(execStore).toHaveLength(0);
  });

  it('rejects with a conflict when the live metaDescription has changed, writing nothing', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: 'New description.' } } }),
      ],
      page: { metaDescription: 'Someone edited this too.' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(pageStore[0].metaDescription).toBe('Someone edited this too.');
  });

  it('a stale SECOND target in a multi-target draft leaves the FIRST target unwritten too (all-or-nothing)', async () => {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'page-one', metaTitle: 'Title One' }));
    pageStore.push(makePage({ slug: 'page-two', metaTitle: 'Title Two' }));

    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        metadataChange({
          targetUrl: pageUrl('page-one'),
          fields: { title: { current: 'Title One', proposed: 'New One' } },
        }),
        metadataChange({
          targetUrl: pageUrl('page-two'),
          fields: { title: { current: 'STALE — not what is live', proposed: 'New Two' } },
        }),
      ],
    });
    draftStore.push(draft);

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');

    // Genuinely two-pass: the second target's stale check fails during Pass 1
    // (validation only), so the first target is never written in the first
    // place — this is not a rollback of an already-attempted write.
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('Title One');
    expect(pageStore.find((p) => p.slug === 'page-two')!.metaTitle).toBe('Title Two');
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Genuinely two-pass: Pass 1 resolves/validates/stale-checks every target with
// NO writes; only once every target has passed does Pass 2 call
// cmsService.updatePageSeoMetadata (i.e. Page.findByIdAndUpdate). A rejection
// on any target must leave updatePageSeoMetadata never invoked at all — not
// merely rolled back by the transaction.
// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — genuine two-pass multi-target execution', () => {
  function twoTargetDraft(second: { current: string; proposed?: string; targetUrlOverride?: string }) {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'page-one', metaTitle: 'Title One' }));
    pageStore.push(makePage({ slug: 'page-two', metaTitle: 'Title Two' }));

    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        metadataChange({
          targetUrl: pageUrl('page-one'),
          fields: { title: { current: 'Title One', proposed: 'New One' } },
        }),
        metadataChange({
          targetUrl: second.targetUrlOverride ?? pageUrl('page-two'),
          fields: { title: { current: second.current, proposed: second.proposed ?? 'New Two' } },
        }),
      ],
    });
    draftStore.push(draft);
    return draft;
  }

  it('with 2 valid targets, both are written', async () => {
    const draft = twoTargetDraft({ current: 'Title Two' });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('New One');
    expect(pageStore.find((p) => p.slug === 'page-two')!.metaTitle).toBe('New Two');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('a successful multi-target execution records correct before/proposed/after snapshots for BOTH targets', async () => {
    const draft = twoTargetDraft({ current: 'Title Two' });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.execution.targets).toHaveLength(2);
    const one = result.execution.targets.find((t) => t.targetUrl === pageUrl('page-one'))!;
    const two = result.execution.targets.find((t) => t.targetUrl === pageUrl('page-two'))!;
    expect(one.before.metaTitle).toBe('Title One');
    expect(one.proposed.metaTitle).toBe('New One');
    expect(one.after.metaTitle).toBe('New One');
    expect(two.before.metaTitle).toBe('Title Two');
    expect(two.proposed.metaTitle).toBe('New Two');
    expect(two.after.metaTitle).toBe('New Two');
  });

  it('target 1 valid + target 2 stale => updatePageSeoMetadata is called ZERO times and no execution record is created', async () => {
    const draft = twoTargetDraft({ current: 'STALE — not what is live' });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('Title One');
    expect(execStore).toHaveLength(0);
  });

  it('target 1 valid + target 2 unsupported/not-found => updatePageSeoMetadata is called ZERO times and no execution record is created', async () => {
    const draft = twoTargetDraft({ current: 'Title Two', targetUrlOverride: pageUrl('does-not-exist') });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('target_not_found');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('Title One');
    expect(execStore).toHaveLength(0);
  });

  it('target 1 valid + target 2 on an unsupported host => updatePageSeoMetadata is called ZERO times', async () => {
    const draft = twoTargetDraft({ current: 'Title Two', targetUrlOverride: 'https://example.com/page/page-two/' });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_target');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Phase 5.2 → 5.3 fix: once the generator records `current` in the CMS Page
// STORAGE representation (branding suffix already stripped), the stale
// comparison here must succeed against the plain stored value and still catch
// a genuine edit — it must never be loosened to paper over a representation
// mismatch.
// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — stale protection against the storage-form current (post Phase 5.2 fix)', () => {
  it('succeeds when the draft current is the storage-form title and the live Page.metaTitle is unchanged', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({
          targetUrl: pageUrl('shipping-policy'),
          fields: { title: { current: 'Shipping Policy', proposed: 'Shipping Policy — Shipping Policy' } },
        }),
      ],
      page: { slug: 'shipping-policy', metaTitle: 'Shipping Policy' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.execution.targets[0].before.metaTitle).toBe('Shipping Policy');
      expect(result.execution.targets[0].after.metaTitle).toBe('Shipping Policy — Shipping Policy');
    }
  });

  it('still rejects when the live Page.metaTitle has genuinely changed since the draft was generated', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({
          targetUrl: pageUrl('shipping-policy'),
          fields: { title: { current: 'Shipping Policy', proposed: 'Shipping Policy — Shipping Policy' } },
        }),
      ],
      page: { slug: 'shipping-policy', metaTitle: 'Shipping Policy (Updated By Admin)' },
    });
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(pageStore[0].metaTitle).toBe('Shipping Policy (Updated By Admin)');
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — write whitelist', () => {
  it('writes only metaTitle/metaDescription and updatedBy, leaving everything else untouched', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: 'Old Title', proposed: 'New Title' },
            metaDescription: { current: 'Old description.', proposed: 'New description.' },
          },
        }),
      ],
      page: {},
    });
    const before = { ...pageStore[0] };

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);

    const page = pageStore[0];
    expect(page.metaTitle).toBe('New Title');
    expect(page.metaDescription).toBe('New description.');
    expect(page.title).toBe(before.title);
    expect(page.slug).toBe(before.slug);
    expect(page.content).toBe(before.content);
    expect(page.status).toBe(before.status);
    expect(page.createdAt).toEqual(before.createdAt);
    expect(String(page.updatedBy)).toBe(executorUserId);
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — audit record', () => {
  it('a successful execution captures before/proposed/after and correct ids', async () => {
    const { draft, rec } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(String(result.execution.draftId)).toBe(String(draft._id));
    expect(String(result.execution.recommendationId)).toBe(String(rec._id));
    expect(result.execution.recommendationFingerprint).toBe(rec.fingerprint);
    expect(String(result.execution.executorUserId)).toBe(executorUserId);
    expect(result.execution.status).toBe('succeeded');
    expect(result.execution.targets).toHaveLength(1);
    expect(result.execution.targets[0].before).toEqual({ metaTitle: 'Old Title', metaDescription: 'Old description.' });
    expect(result.execution.targets[0].proposed).toEqual({ metaTitle: 'New Title' });
    expect(result.execution.targets[0].after.metaTitle).toBe('New Title');
  });

  it('lists execution history newest first', async () => {
    const draftId = new mongoose.Types.ObjectId();
    const older = makeExecution({ draftId, executedAt: new Date('2026-01-01T00:00:00Z') });
    const newer = makeExecution({ draftId, executedAt: new Date('2026-02-01T00:00:00Z') });
    execStore.push(older, newer);

    const { listExecutionsForDraft } = await import('../../../src/modules/seo/services/change-execution.service');
    const history = await listExecutionsForDraft(String(draftId));
    expect(history).toHaveLength(2);
    expect(String(history![0]._id)).toBe(String(newer._id));
    expect(String(history![1]._id)).toBe(String(older._id));
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — idempotency / double execution', () => {
  it('rejects a second execution of the same draft', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });

    const first = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(first.ok).toBe(true);

    const second = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_executed');
    expect(execStore.filter((d) => String(d.draftId) === String(draft._id))).toHaveLength(1);
  });

  it('two simultaneous executions of the same draft cannot both succeed', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });

    const [r1, r2] = await Promise.all([
      executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId }),
      executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId }),
    ]);

    // The mock's Page store isn't snapshot-isolated per "transaction" the way real
    // Mongo sessions are, so the loser may be caught either by the duplicate-key
    // guard (already_executed) or by seeing the winner's already-written value
    // (stale) — which check catches it is an artifact of the mock, not something
    // this test asserts. What matters, and IS asserted, is the actual safety
    // property: exactly one success, and exactly one persisted execution record.
    const results = [r1, r2];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(execStore.filter((d) => String(d.draftId) === String(draft._id))).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — idempotency index initialization', () => {
  it('initializes the SeoChangeExecution model/index before checking idempotency', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);

    expect(mockInit).toHaveBeenCalledTimes(1);
    const initOrder = mockInit.mock.invocationCallOrder[0];
    const existsOrder = mockExists.mock.invocationCallOrder[0];
    const createOrder = mockCreate.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(existsOrder);
    expect(initOrder).toBeLessThan(createOrder);
  });

  it('still initializes the index on the fast already-executed path (before the exists() check)', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });
    execStore.push(makeExecution({ draftId: draft._id }));

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('already_executed');
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.invocationCallOrder[0]).toBeLessThan(mockExists.mock.invocationCallOrder[0]);
  });

  it('propagates an index-initialization failure without fabricating success or touching the Page', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'New Title' } } })],
      page: { metaTitle: 'Old Title' },
    });
    mockInit.mockRejectedValueOnce(new Error('index build failed'));

    await expect(executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId })).rejects.toThrow(
      'index build failed',
    );
    expect(pageStore[0].metaTitle).toBe('Old Title');
    expect(execStore).toHaveLength(0);
  });

  it('does not skip the eligibility gate just because the index was already initialized', async () => {
    const { draft } = setupApprovedDraft({ proposedChanges: [] }); // invalid: no proposed changes
    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_draft');
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// Phase 5.5 — execution quality controls. The execute path runs the SAME
// authoritative evaluator the advisory preflight endpoint runs, rerun
// session-pinned inside the transaction immediately before Pass 2, and records
// the resulting evaluation as immutable evidence on success.
// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — Phase 5.5 quality controls', () => {
  const GOOD_TITLE = 'A Clearly Different Page Title';
  const GOOD_DESCRIPTION =
    'A genuinely descriptive meta description for this page, comfortably inside the guideline band.';

  it('records immutable quality-control evidence on a successful execution', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      page: { metaTitle: 'Old Title' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const qc = result.execution.qualityControl;
    expect(qc).toBeDefined();
    expect(qc!.preflightVersion).toBe(PREFLIGHT_VERSION);
    expect(qc!.riskLevel).toBe('low');
    expect(qc!.warnings).toEqual([]);
    expect(qc!.checks.length).toBeGreaterThan(0);
    expect(qc!.changedFields).toEqual([{ targetUrl: pageUrl('about-us'), fields: ['metaTitle'] }]);
    expect(qc!.evaluatedAt).toBeInstanceOf(Date);
  });

  it('executes a warning-only change and records the warnings and risk level as evidence', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'Tea' } } })],
      page: { metaTitle: 'Old Title' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(pageStore[0].metaTitle).toBe('Tea');
    expect(result.execution.qualityControl!.riskLevel).toBe('medium');
    expect(result.execution.qualityControl!.warnings.map((w) => w.code)).toEqual(['title_too_short']);
  });

  it('rejects a no-op proposal before any write', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: GOOD_TITLE, proposed: GOOD_TITLE } } })],
      page: { metaTitle: GOOD_TITLE },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_effective_change');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(execStore).toHaveLength(0);
  });

  it('rejects a malformed proposed value before any write', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({
          fields: { title: { current: 'Old Title', proposed: 42 } } as unknown as MetadataProposedChange['fields'],
        }),
      ],
      page: { metaTitle: 'Old Title' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('malformed_value');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(execStore).toHaveLength(0);
  });

  it('a single no-op target in a multi-target draft leaves ZERO pages written', async () => {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'page-one', metaTitle: 'Title One' }));
    pageStore.push(makePage({ slug: 'page-two', metaTitle: GOOD_TITLE }));
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        metadataChange({ targetUrl: pageUrl('page-one'), fields: { title: { current: 'Title One', proposed: GOOD_TITLE } } }),
        metadataChange({ targetUrl: pageUrl('page-two'), fields: { title: { current: GOOD_TITLE, proposed: GOOD_TITLE } } }),
      ],
    });
    draftStore.push(draft);

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_effective_change');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(pageStore.find((p) => p.slug === 'page-one')!.metaTitle).toBe('Title One');
    expect(execStore).toHaveLength(0);
  });

  it('rejects two targets resolving to the same CMS page, writing nothing', async () => {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'about-us', metaTitle: 'Old Title' }));
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        metadataChange({ targetUrl: pageUrl('about-us'), fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } }),
        metadataChange({
          targetUrl: pageUrl('about-us', false),
          fields: { title: { current: 'Old Title', proposed: 'Another Perfectly Fine Title' } },
        }),
      ],
    });
    draftStore.push(draft);

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('ambiguous_target');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('reruns the evaluation at execution time — an earlier clean preflight is never trusted', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      page: { metaTitle: 'Old Title' },
    });

    // Preview: clean and executable.
    const preview = await evaluateExecutionPreflight({ draftId: String(draft._id) });
    expect(preview.result.executable).toBe(true);

    // Live state then changes underneath the operator.
    pageStore[0].metaTitle = 'Someone Else Edited This';

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(execStore).toHaveLength(0);
  });

  it('derives risk and warnings server-side — nothing in the draft can dictate them', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'Tea' } } })],
      page: { metaTitle: 'Old Title' },
    });
    // A draft claiming to be low risk with no warnings must not be believed.
    (draft as unknown as Record<string, unknown>).qualityControl = { riskLevel: 'low', warnings: [] };
    (draft as unknown as Record<string, unknown>).riskLevel = 'low';

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution.qualityControl!.riskLevel).toBe('medium');
    expect(result.execution.qualityControl!.warnings.map((w) => w.code)).toEqual(['title_too_short']);
  });

  it('records evidence for a duplicate-metadata warning without blocking the execution', async () => {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'about-us', metaTitle: 'Old Title' }));
    pageStore.push(makePage({ slug: 'shipping-policy', metaTitle: GOOD_TITLE }));
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
    });
    draftStore.push(draft);

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution.qualityControl!.riskLevel).toBe('high');
    expect(result.execution.qualityControl!.warnings.map((w) => w.code)).toEqual(['duplicate_title']);
    expect(pageStore.find((p) => p.slug === 'about-us')!.metaTitle).toBe(GOOD_TITLE);
  });

  it('records the full mutation scope when both fields are written', async () => {
    const { draft } = setupApprovedDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: 'Old Title', proposed: GOOD_TITLE },
            metaDescription: { current: 'Old description.', proposed: GOOD_DESCRIPTION },
          },
        }),
      ],
      page: { metaTitle: 'Old Title', metaDescription: 'Old description.' },
    });

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution.qualityControl!.changedFields).toEqual([
      { targetUrl: pageUrl('about-us'), fields: ['metaTitle', 'metaDescription'] },
    ]);
    expect(result.execution.qualityControl!.riskLevel).toBe('medium');
  });
});

// -----------------------------------------------------------------------------
describe('toExecutionView — backward compatibility with pre-Phase-5.5 records', () => {
  it('serializes an execution recorded before Phase 5.5 (no qualityControl) without throwing', () => {
    const legacy = makeExecution({
      targets: [
        {
          targetUrl: pageUrl('about-us'),
          targetDocumentId: new mongoose.Types.ObjectId(),
          before: { metaTitle: 'Old' },
          proposed: { metaTitle: 'New' },
          after: { metaTitle: 'New' },
        },
      ],
    });

    const view = toExecutionView(legacy as unknown as Parameters<typeof toExecutionView>[0]);
    expect(view.qualityControl).toBeNull();
    expect(view.targets).toHaveLength(1);
  });

  it('serializes a Phase 5.5 execution with its quality-control evidence intact', () => {
    const modern = makeExecution({});
    (modern as unknown as Record<string, unknown>).qualityControl = {
      preflightVersion: PREFLIGHT_VERSION,
      riskLevel: 'medium',
      warnings: [{ code: 'title_too_short', message: 'short' }],
      checks: [{ code: 'draft_valid', status: 'pass', message: 'ok' }],
      changedFields: [{ targetUrl: pageUrl('about-us'), fields: ['metaTitle'] }],
      evaluatedAt: new Date(),
    };

    const view = toExecutionView(modern as unknown as Parameters<typeof toExecutionView>[0]);
    expect(view.qualityControl).not.toBeNull();
    expect(view.qualityControl!.riskLevel).toBe('medium');
    expect(view.qualityControl!.preflightVersion).toBe(PREFLIGHT_VERSION);
  });
});
