// =============================================================================
// UNIT TESTS — Phase 6.6A controlled blog article creation
//
// Exercises the full detect→preflight→execute→verify→rollback lifecycle for
// the new "create a brand-new published Blog article" executor, using the
// same "plain in-memory store + fake mongoose session" mocking style already
// established in seo-faq-schema-executor.test.ts / seo-change-execution.test.ts.
// No real DB, no network, no OpenAI/DataForSEO.
// =============================================================================

import mongoose from 'mongoose';
import { BlogCreateProposedChange, ProposedChange } from '../../../src/modules/seo/models/seo-change-draft.model';

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

interface FakeBlog {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: mongoose.Types.ObjectId;
  tags: string[];
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'published';
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  recommendationFingerprint: string;
  targetType: string;
  targets: any[];
  executorUserId: mongoose.Types.ObjectId;
  executedAt: Date;
  status: string;
  generatorVersion: string;
  executorVersion: string;
  errorCode: null;
  errorMessage: null;
  createdAt: Date;
}

interface FakePublication {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  status: 'pending' | 'building' | 'published' | 'failed';
}

interface FakeRollback {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let blogStore: FakeBlog[] = [];
let execStore: FakeExecution[] = [];
let publicationStore: FakePublication[] = [];
let rollbackStore: FakeRollback[] = [];

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
    generatorVersion: '6.6.0-blog-create-v1',
    proposedChanges: [],
    validation: { isValid: true, warnings: [], errors: [] },
    ...fields,
  };
}

function pageUrl(kind: 'blog' | 'product', slug: string): string {
  return `https://rajhanstea.com/${kind}/${slug}/`;
}

const VALID_CONTENT =
  '<p>Rajhans Royal Assam is a strong, malty black tea grown in the Brahmaputra valley of Upper Assam.</p>' +
  '<h2>Where It Comes From</h2>' +
  '<p>Rajhans Royal Assam comes from Upper Assam. See <a href="https://rajhanstea.com/blog/garden-to-cup-tea-journey/">our sourcing journey</a>.</p>' +
  '<h2>How to Brew It</h2>' +
  '<p>See <a href="https://rajhanstea.com/blog/art-of-perfect-tea-brewing/">our complete brewing guide</a> and the <a href="https://rajhanstea.com/product/rajhans-royal-assam/">Rajhans Royal Assam product page</a>.</p>';

function blogCreateChange(overrides: Partial<BlogCreateProposedChange> = {}): BlogCreateProposedChange {
  return {
    kind: 'blog_create',
    targetUrl: pageUrl('blog', 'assam-tea-guide'),
    execution: {
      slug: 'assam-tea-guide',
      title: 'What Is Assam Tea?',
      metaTitle: 'Assam Tea Guide: Flavour, Origin & Brewing — Rajhans Tea',
      metaDescription: "Learn about Rajhans Royal Assam's strong, malty character.",
      excerpt: "Learn about Rajhans Royal Assam's strong, malty character.",
      content: VALID_CONTENT,
      tags: ['assam', 'guide'],
      status: 'published',
    },
    ...overrides,
  };
}

// ── Fake mongoose ClientSession ──
interface FakeSession {
  createdExecutionIds: string[];
  createdPublicationIds: string[];
  createdRollbackIds: string[];
  createdBlogIds: string[];
  blogBackups: Map<string, FakeBlog>;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  abortTransaction: jest.Mock;
  endSession: jest.Mock;
}

function makeSession(): FakeSession {
  const session = {
    createdExecutionIds: [] as string[],
    createdPublicationIds: [] as string[],
    createdRollbackIds: [] as string[],
    createdBlogIds: [] as string[],
    blogBackups: new Map<string, FakeBlog>(),
  } as FakeSession;

  const forget = () => {
    session.createdExecutionIds.length = 0;
    session.createdPublicationIds.length = 0;
    session.createdRollbackIds.length = 0;
    session.createdBlogIds.length = 0;
    session.blogBackups.clear();
  };

  session.startTransaction = jest.fn(forget);
  session.commitTransaction = jest.fn(async () => forget());
  session.abortTransaction = jest.fn(async () => {
    for (const [id, backup] of session.blogBackups) {
      const blog = blogStore.find((b) => String(b._id) === id);
      if (blog) Object.assign(blog, backup);
    }
    for (const id of session.createdBlogIds) {
      const index = blogStore.findIndex((b) => String(b._id) === id);
      if (index >= 0) blogStore.splice(index, 1);
    }
    for (const id of session.createdExecutionIds) {
      const index = execStore.findIndex((e) => String(e._id) === id);
      if (index >= 0) execStore.splice(index, 1);
    }
    for (const id of session.createdPublicationIds) {
      const index = publicationStore.findIndex((p) => String(p._id) === id);
      if (index >= 0) publicationStore.splice(index, 1);
    }
    for (const id of session.createdRollbackIds) {
      const index = rollbackStore.findIndex((r) => String(r._id) === id);
      if (index >= 0) rollbackStore.splice(index, 1);
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
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => execStore.find((d) => String(d._id) === String(id)) ?? null),
    ),
    create: jest.fn(async (docs: Partial<FakeExecution>[], options?: { session?: FakeSession }) => {
      const doc = docs[0]!;
      if (execStore.some((d) => String(d.draftId) === String(doc.draftId))) {
        throw Object.assign(new Error('E11000 duplicate key error: draftId'), { code: 11000 });
      }
      const created: FakeExecution = {
        _id: new mongoose.Types.ObjectId(),
        draftId: doc.draftId!,
        recommendationId: doc.recommendationId!,
        recommendationFingerprint: doc.recommendationFingerprint ?? '',
        targetType: doc.targetType ?? 'blog_create',
        targets: doc.targets ?? [],
        executorUserId: doc.executorUserId!,
        executedAt: doc.executedAt ?? new Date(),
        status: doc.status ?? 'succeeded',
        generatorVersion: doc.generatorVersion ?? '',
        executorVersion: doc.executorVersion ?? '',
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
      };
      execStore.push(created);
      options?.session?.createdExecutionIds.push(String(created._id));
      return [created];
    }),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-publication.model', () => ({
  SeoChangePublication: {
    init: jest.fn(async () => undefined),
    findOne: jest.fn((query: { executionId?: unknown }) => ({
      exec: async () => publicationStore.find((p) => String(p.executionId) === String(query.executionId)) ?? null,
    })),
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

jest.mock('../../../src/modules/seo/models/seo-change-rollback.model', () => ({
  SeoChangeRollback: {
    init: jest.fn(async () => undefined),
    exists: jest.fn(async (query: { executionId?: unknown }) =>
      rollbackStore.some((r) => String(r.executionId) === String(query.executionId)) ? { _id: 'x' } : null,
    ),
    create: jest.fn(async (docs: any[], options?: { session?: FakeSession }) => {
      const doc = docs[0];
      const created: FakeRollback = { _id: new mongoose.Types.ObjectId(), executionId: doc.executionId };
      rollbackStore.push(created);
      options?.session?.createdRollbackIds.push(String(created._id));
      return [created];
    }),
  },
}));

jest.mock('../../../src/modules/seo/models/seo-change-verification.model', () => ({
  SeoChangeVerification: {
    create: jest.fn(async (doc: any) => doc),
  },
}));

jest.mock('../../../src/modules/seo/services/fetcher.service', () => ({
  fetchUrl: jest.fn(),
}));

jest.mock('../../../src/modules/catalog/models/product.model', () => ({
  Product: {
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(async () =>
        query.slug === 'rajhans-royal-assam' && (query.status === undefined || query.status === 'active')
          ? { _id: new mongoose.Types.ObjectId(), slug: 'rajhans-royal-assam', status: 'active' }
          : null,
      ),
    ),
  },
}));

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findOne: jest.fn(() => makeSessionQuery(async () => null)),
  },
}));

jest.mock('../../../src/modules/cms/models/blog.model', () => ({
  Blog: {
    findOne: jest.fn((query: { slug?: string; status?: string; title?: unknown }) =>
      makeSessionQuery(async () => {
        if (query.title !== undefined) {
          const re = (query.title as { $regex: string; $options: string }).$regex;
          const flags = (query.title as { $regex: string; $options: string }).$options;
          const pattern = new RegExp(re, flags);
          return blogStore.find((b) => pattern.test(b.title)) ?? null;
        }
        return (
          blogStore.find((b) => b.slug === query.slug && (query.status === undefined || b.status === query.status)) ?? null
        );
      }),
    ),
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => blogStore.find((b) => String(b._id) === String(id)) ?? null),
    ),
    create: jest.fn(async (docs: Partial<FakeBlog>[], options?: { session?: FakeSession }) => {
      const doc = docs[0]!;
      if (blogStore.some((b) => b.slug === doc.slug)) {
        throw Object.assign(new Error('E11000 duplicate key error: slug'), { code: 11000 });
      }
      const now = new Date();
      const created: FakeBlog = {
        _id: new mongoose.Types.ObjectId(),
        title: doc.title ?? '',
        slug: doc.slug ?? '',
        excerpt: doc.excerpt ?? '',
        content: doc.content ?? '',
        coverImage: '',
        author: doc.author as mongoose.Types.ObjectId,
        tags: doc.tags ?? [],
        metaTitle: doc.metaTitle ?? '',
        metaDescription: doc.metaDescription ?? '',
        status: doc.status ?? 'draft',
        publishedAt: doc.status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      };
      blogStore.push(created);
      options?.session?.createdBlogIds.push(String(created._id));
      return [created];
    }),
    findOneAndUpdate: jest.fn(
      (query: { _id?: unknown; status?: string; slug?: string }, update: { $set: Record<string, unknown> }, options?: { session?: FakeSession }) => ({
        exec: async () => {
          const blog = blogStore.find(
            (b) =>
              String(b._id) === String(query._id) &&
              (query.status === undefined || b.status === query.status) &&
              (query.slug === undefined || b.slug === query.slug),
          );
          if (!blog) return null;
          const key = String(blog._id);
          if (options?.session && !options.session.blogBackups.has(key)) {
            options.session.blogBackups.set(key, { ...blog });
          }
          Object.assign(blog, update.$set);
          blog.updatedAt = new Date();
          return blog;
        },
      }),
    ),
  },
}));

import { evaluateExecutionPreflight, PreflightBlockerCode } from '../../../src/modules/seo/services/change-execution-preflight.service';
import { executeApprovedChangeDraft } from '../../../src/modules/seo/services/change-execution.service';
import { rollbackExecution } from '../../../src/modules/seo/services/change-rollback.service';
import { verifyExecution } from '../../../src/modules/seo/services/change-verification.service';
import { fetchUrl } from '../../../src/modules/seo/services/fetcher.service';

const mockFetchUrl = fetchUrl as jest.Mock;

function makeExistingBlog(fields: Partial<FakeBlog> = {}): FakeBlog {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'Existing Post',
    slug: 'existing-post',
    excerpt: '',
    content: '<p>x</p>',
    coverImage: '',
    author: new mongoose.Types.ObjectId(),
    tags: [],
    metaTitle: '',
    metaDescription: '',
    status: 'published',
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

beforeEach(() => {
  recStore = [];
  draftStore = [];
  blogStore = [];
  execStore = [];
  publicationStore = [];
  rollbackStore = [];
  jest.clearAllMocks();

  // Seed the two existing published posts the approved article's embedded
  // internal links point to, so isValidInternalLinkTarget can resolve them —
  // mirroring the real corpus (garden-to-cup-tea-journey / art-of-perfect-tea-brewing).
  blogStore.push(makeExistingBlog({ title: 'From Garden to Cup: Our Tea Journey', slug: 'garden-to-cup-tea-journey' }));
  blogStore.push(makeExistingBlog({ title: 'The Art of Perfect Tea Brewing', slug: 'art-of-perfect-tea-brewing' }));
});

function blockerCodes(blockers: { code: PreflightBlockerCode }[]): PreflightBlockerCode[] {
  return blockers.map((b) => b.code);
}

function setupApprovedDraft(change: BlogCreateProposedChange) {
  const rec = makeRec();
  recStore.push(rec);
  const draft = makeDraft({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    proposedChanges: [change],
  });
  draftStore.push(draft);
  return { rec, draft };
}

// -----------------------------------------------------------------------------
describe('evaluateExecutionPreflight — blog_create (Phase 6.6A)', () => {
  it('A: a valid, approved new-article draft passes preflight', async () => {
    const { draft } = setupApprovedDraft(blogCreateChange());
    const { result, prepared } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].targetType).toBe('blog_create');
  });

  it('B: a duplicate slug fails', async () => {
    blogStore.push({
      _id: new mongoose.Types.ObjectId(),
      title: 'Existing Post',
      slug: 'assam-tea-guide',
      excerpt: '',
      content: '<p>x</p>',
      coverImage: '',
      author: new mongoose.Types.ObjectId(),
      tags: [],
      metaTitle: '',
      metaDescription: '',
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { draft } = setupApprovedDraft(blogCreateChange());
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('slug_already_exists');
  });

  it('C: recommendation not approved fails', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [blogCreateChange()],
    });
    draftStore.push(draft);

    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('not_approved');
  });

  it('D: malformed/unsafe HTML (script tag) fails', async () => {
    const change = blogCreateChange({
      execution: {
        ...blogCreateChange().execution!,
        content: VALID_CONTENT + '<script>alert(1)</script>',
      },
    });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('unsafe_markup');
  });

  it('E: an external link fails', async () => {
    const change = blogCreateChange({
      execution: {
        ...blogCreateChange().execution!,
        content: VALID_CONTENT + '<p>See <a href="https://example.com/other-site/">this external site</a>.</p>',
      },
    });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('external_target');
  });

  it('F: a missing internal link target fails', async () => {
    const change = blogCreateChange({
      execution: {
        ...blogCreateChange().execution!,
        content: VALID_CONTENT + '<p>See <a href="https://rajhanstea.com/blog/nonexistent-post/">a post that does not exist</a>.</p>',
      },
    });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('target_not_found');
  });

  it('G: an unsupported/unverifiable claim is rejected', async () => {
    const change = blogCreateChange({
      execution: {
        ...blogCreateChange().execution!,
        content: VALID_CONTENT + '<p>This is India\'s best-known tea, guaranteed to delight.</p>',
      },
    });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('unsupported_claim');
  });

  it('rejects an outline-only (historical) blog_create draft with no execution payload', async () => {
    const outlineOnly: BlogCreateProposedChange = { kind: 'blog_create', targetUrl: pageUrl('blog', 'assam-tea-guide') };
    const rec = makeRec();
    recStore.push(rec);
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [outlineOnly],
    });
    draftStore.push(draft);

    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('unsupported_kind');
  });

  it('rejects a title that exactly collides with an existing post (cannibalization)', async () => {
    blogStore.push({
      _id: new mongoose.Types.ObjectId(),
      title: 'What Is Assam Tea?',
      slug: 'some-other-slug',
      excerpt: '',
      content: '<p>x</p>',
      coverImage: '',
      author: new mongoose.Types.ObjectId(),
      tags: [],
      metaTitle: '',
      metaDescription: '',
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { draft } = setupApprovedDraft(blogCreateChange());
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('cannibalizing_target');
  });
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — blog_create (H: creates only one intended Blog)', () => {
  it('creates exactly one Blog record with the approved fields', async () => {
    const { draft } = setupApprovedDraft(blogCreateChange());
    const executorUserId = String(new mongoose.Types.ObjectId());

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });

    expect(result.ok).toBe(true);
    expect(blogStore).toHaveLength(3);
    const created = blogStore.find((b) => b.slug === 'assam-tea-guide')!;
    expect(created.slug).toBe('assam-tea-guide');
    expect(created.title).toBe('What Is Assam Tea?');
    expect(created.status).toBe('published');
    expect(String(created.author)).toBe(executorUserId);
    expect(execStore).toHaveLength(1);
    expect(execStore[0]!.targetType).toBe('blog_create');
    expect(publicationStore).toHaveLength(1);
    expect(publicationStore[0]!.status).toBe('pending');
  });

  it('I: duplicate execution of the same draft is prevented', async () => {
    const { draft } = setupApprovedDraft(blogCreateChange());
    const executorUserId = String(new mongoose.Types.ObjectId());

    const first = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(first.ok).toBe(true);

    const second = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_executed');
    expect(blogStore.filter((b) => b.slug === 'assam-tea-guide')).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — blog_create (J: reverses only the execution-created article)', () => {
  it('unpublishes only the created article, leaving other blogs untouched', async () => {
    blogStore.push({
      _id: new mongoose.Types.ObjectId(),
      title: 'Unrelated Post',
      slug: 'unrelated-post',
      excerpt: '',
      content: '<p>x</p>',
      coverImage: '',
      author: new mongoose.Types.ObjectId(),
      tags: [],
      metaTitle: '',
      metaDescription: '',
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { draft } = setupApprovedDraft(blogCreateChange());
    const executorUserId = String(new mongoose.Types.ObjectId());
    const execResult = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(execResult.ok).toBe(true);
    if (!execResult.ok) return;

    const created = blogStore.find((b) => b.slug === 'assam-tea-guide')!;
    expect(created.status).toBe('published');

    const rollbackResult = await rollbackExecution({
      executionId: String(execResult.execution._id),
      rollbackUserId: String(new mongoose.Types.ObjectId()),
    });

    expect(rollbackResult.ok).toBe(true);
    expect(blogStore.find((b) => b.slug === 'assam-tea-guide')!.status).toBe('draft');
    expect(blogStore.find((b) => b.slug === 'unrelated-post')!.status).toBe('published');
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — blog_create (K/L: live article verification)', () => {
  async function executeAndPublish(change = blogCreateChange()): Promise<{ executionId: string }> {
    const { draft } = setupApprovedDraft(change);
    const executorUserId = String(new mongoose.Types.ObjectId());
    const execResult = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    if (!execResult.ok) throw new Error('setup: execution failed');
    const executionId = String(execResult.execution._id);
    const publication = publicationStore.find((p) => String(p.executionId) === executionId)!;
    publication.status = 'published';
    return { executionId };
  }

  function pageHtml(overrides: Partial<{ title: string; h1: string; description: string; content: string }> = {}): string {
    const title = overrides.title ?? 'Assam Tea Guide: Flavour, Origin & Brewing — Rajhans Tea';
    const description = overrides.description ?? "Learn about Rajhans Royal Assam's strong, malty character.";
    const h1 = overrides.h1 ?? 'What Is Assam Tea?';
    const content = overrides.content ?? VALID_CONTENT;
    return `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body><h1>${h1}</h1><div>${content}</div></body></html>`;
  }

  it('K: passes when the live article matches exactly', async () => {
    const { executionId } = await executeAndPublish();
    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('blog', 'assam-tea-guide'),
      finalUrl: pageUrl('blog', 'assam-tea-guide'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html: pageHtml(),
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('verified');
      expect(result.verification.targets[0]!.mismatchFields).toEqual([]);
    }
  });

  it('L: fails when the H1 is wrong', async () => {
    const { executionId } = await executeAndPublish();
    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('blog', 'assam-tea-guide'),
      finalUrl: pageUrl('blog', 'assam-tea-guide'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html: pageHtml({ h1: 'Wrong Heading' }),
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('mismatch');
      expect(result.verification.targets[0]!.mismatchFields).toContain('h1');
    }
  });

  it('L: fails when a required internal link is missing', async () => {
    const { executionId } = await executeAndPublish();
    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('blog', 'assam-tea-guide'),
      finalUrl: pageUrl('blog', 'assam-tea-guide'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html: pageHtml({ content: '<p>Rajhans Royal Assam is a strong, malty black tea grown in the Brahmaputra valley of Upper Assam.</p><h2>Where It Comes From</h2><p>Rajhans Royal Assam comes from Upper Assam.</p>' }),
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('mismatch');
      expect(result.verification.targets[0]!.mismatchFields).toContain('links_missing');
    }
  });

  it('L: fails when meta title is missing/wrong', async () => {
    const { executionId } = await executeAndPublish();
    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('blog', 'assam-tea-guide'),
      finalUrl: pageUrl('blog', 'assam-tea-guide'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html: pageHtml({ title: 'Some Other Title — Rajhans Tea' }),
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('mismatch');
      expect(result.verification.targets[0]!.mismatchFields).toContain('title');
    }
  });
});

// -----------------------------------------------------------------------------
describe('M: existing product/metadata/internal-link/schema executors remain unaffected', () => {
  it('a plain metadata (cms_page) execution path is untouched by the blog_create branch', async () => {
    // Regression guard only: the blog_create branch must never be entered for
    // a non-blog_create draft. Full metadata-executor coverage already lives
    // in seo-change-execution.test.ts; this just proves the new branch is
    // additive, not a replacement of the existing dispatch chain.
    const rec = makeRec();
    recStore.push(rec);
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        {
          kind: 'metadata',
          targetUrl: 'https://rajhanstea.com/page/about-us/',
          fields: { title: { current: 'Old', proposed: 'New' } },
        } as any,
      ],
    });
    draftStore.push(draft);

    // No Page mock data is set up (Page.findOne always returns null here), so
    // this should fail with target_not_found — proving control flow reached
    // the EXISTING metadata/cms_page branch, not blog_create.
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });
    expect(result.executable).toBe(false);
    expect(result.blockers.some((b) => b.code === 'target_not_found')).toBe(true);
  });
});
