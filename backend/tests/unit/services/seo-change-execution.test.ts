// =============================================================================
// UNIT TESTS — SEO Phase 5.3 controlled execution service
// Mocks SeoRecommendation/SeoChangeDraft/SeoChangeExecution/Page the same way
// the Phase 5.2 generator tests do (plain in-memory `store` arrays), plus a fake
// mongoose ClientSession whose startTransaction()/abortTransaction() snapshot
// and restore the Page/execution stores — so these tests genuinely exercise
// the all-or-nothing guarantee (a rejected multi-target draft leaves NOTHING
// written), not just the eligibility branching. No real DB is needed.
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

// ── Fake mongoose ClientSession — snapshots/restores pageStore + execStore on
// startTransaction()/abortTransaction(), so an aborted transaction genuinely
// undoes any writes the code performed before the failure. ──
function makeSession() {
  let pageSnapshot: FakePage[] = [];
  let execSnapshot: FakeExecution[] = [];
  return {
    startTransaction: jest.fn(() => {
      pageSnapshot = pageStore.map((p) => ({ ...p }));
      execSnapshot = execStore.map((e) => ({ ...e }));
    }),
    commitTransaction: jest.fn(async () => undefined),
    abortTransaction: jest.fn(async () => {
      pageStore.length = 0;
      pageStore.push(...pageSnapshot);
      execStore.length = 0;
      execStore.push(...execSnapshot);
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
    create: jest.fn(async (docs: Partial<FakeExecution>[]) => {
      const doc = docs[0];
      if (execStore.some((d) => String(d.draftId) === String(doc.draftId))) {
        throw Object.assign(new Error('E11000 duplicate key error: draftId'), { code: 11000 });
      }
      const created = makeExecution(doc);
      execStore.push(created);
      return [created];
    }),
  },
}));

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

import { executeApprovedChangeDraft, resolveCmsPageTarget } from '../../../src/modules/seo/services/change-execution.service';
import { SeoChangeExecution } from '../../../src/modules/seo/models/seo-change-execution.model';
import { Page } from '../../../src/modules/cms/models/page.model';

const mockInit = SeoChangeExecution.init as jest.Mock;
const mockExists = SeoChangeExecution.exists as jest.Mock;
const mockCreate = SeoChangeExecution.create as jest.Mock;
const mockFindByIdAndUpdate = Page.findByIdAndUpdate as jest.Mock;

const executorUserId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
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
