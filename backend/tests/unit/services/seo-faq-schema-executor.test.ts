// =============================================================================
// UNIT TESTS — Phase 6.5A controlled FAQPage schema execution
//
// Exercises the full detect→preflight→execute→verify→rollback lifecycle for
// the new FAQ schema executor, using the same "plain in-memory store + fake
// mongoose session" mocking style already established in
// seo-change-execution.test.ts / seo-internal-link-execution-preflight.test.ts.
// No real DB, no network, no OpenAI/DataForSEO.
// =============================================================================

import mongoose from 'mongoose';
import { FaqProposedChange, ProposedChange } from '../../../src/modules/seo/models/seo-change-draft.model';
import { buildFaqJsonLd, serializeFaqJsonLd } from '../../../src/modules/seo/services/faq-schema.util';

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
  faqSchema: string;
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
let pageStore: FakePage[] = [];
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
    generatorVersion: '6.5.0-faq-schema-v1',
    proposedChanges: [],
    validation: { isValid: true, warnings: [], errors: [] },
    ...fields,
  };
}

function makePage(fields: Partial<FakePage> = {}): FakePage {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'FAQs',
    slug: 'faq',
    content: FAQ_HTML,
    metaTitle: 'Frequently Asked Questions',
    metaDescription: 'FAQ',
    status: 'published',
    faqSchema: '',
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

function pageUrl(slug: string): string {
  return `https://rajhanstea.com/page/${slug}/`;
}

const FAQ_HTML =
  '<h2>Frequently Asked Questions</h2>\n' +
  '<h3>What makes Rajhans Tea different?</h3>\n' +
  '<p>We source directly from Assam gardens.</p>\n' +
  '<h3>Is Rajhans Tea 100% natural?</h3>\n' +
  '<p>Yes, absolutely no additives.</p>\n';

const FAQ_ITEMS = [
  { question: 'What makes Rajhans Tea different?', answer: 'We source directly from Assam gardens.' },
  { question: 'Is Rajhans Tea 100% natural?', answer: 'Yes, absolutely no additives.' },
];

function faqChange(overrides: Partial<FaqProposedChange> = {}): FaqProposedChange {
  const jsonLd = buildFaqJsonLd(FAQ_ITEMS);
  return {
    kind: 'faq',
    targetUrl: pageUrl('faq'),
    items: FAQ_ITEMS,
    execution: {
      sourceContentSnapshot: FAQ_HTML,
      proposedJsonLd: jsonLd,
    },
    ...overrides,
  };
}

// ── Fake mongoose ClientSession (same shape as seo-change-execution.test.ts). ──
interface FakeSession {
  createdExecutionIds: string[];
  createdPublicationIds: string[];
  createdRollbackIds: string[];
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
    createdRollbackIds: [] as string[],
    pageBackups: new Map<string, FakePage>(),
  } as FakeSession;

  const forget = () => {
    session.createdExecutionIds.length = 0;
    session.createdPublicationIds.length = 0;
    session.createdRollbackIds.length = 0;
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

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    find: jest.fn(() => ({
      select: () => ({
        limit: () => ({
          session: () => ({
            exec: async () => [],
          }),
        }),
      }),
    })),
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(
        async () =>
          pageStore.find((p) => p.slug === query.slug && (query.status === undefined || p.status === query.status)) ?? null,
      ),
    ),
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => pageStore.find((p) => String(p._id) === String(id)) ?? null),
    ),
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
    findOneAndUpdate: jest.fn(
      (
        query: { _id?: unknown; status?: string; faqSchema?: string },
        update: { $set: Record<string, unknown> },
        options?: { session?: FakeSession },
      ) => ({
        exec: async () => {
          const page = pageStore.find(
            (p) =>
              String(p._id) === String(query._id) &&
              (query.status === undefined || p.status === query.status) &&
              (query.faqSchema === undefined || p.faqSchema === query.faqSchema),
          );
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

import { evaluateExecutionPreflight, PreflightBlockerCode } from '../../../src/modules/seo/services/change-execution-preflight.service';
import { executeApprovedChangeDraft } from '../../../src/modules/seo/services/change-execution.service';
import { rollbackExecution } from '../../../src/modules/seo/services/change-rollback.service';
import { verifyExecution } from '../../../src/modules/seo/services/change-verification.service';
import { fetchUrl } from '../../../src/modules/seo/services/fetcher.service';

const mockFetchUrl = fetchUrl as jest.Mock;

beforeEach(() => {
  recStore = [];
  draftStore = [];
  pageStore = [];
  execStore = [];
  publicationStore = [];
  rollbackStore = [];
  jest.clearAllMocks();
});

function blockerCodes(blockers: { code: PreflightBlockerCode }[]): PreflightBlockerCode[] {
  return blockers.map((b) => b.code);
}

function setupApprovedDraft(change: FaqProposedChange, page: Partial<FakePage> = {}) {
  const rec = makeRec();
  recStore.push(rec);
  pageStore.push(makePage(page));
  const draft = makeDraft({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    proposedChanges: [change],
  });
  draftStore.push(draft);
  return { rec, draft };
}

// -----------------------------------------------------------------------------
describe('evaluateExecutionPreflight — faq (Phase 6.5A)', () => {
  it('A: a valid, visible FAQ passes preflight', async () => {
    const { draft } = setupApprovedDraft(faqChange());
    const { result, prepared } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.changedFields).toEqual([{ targetUrl: pageUrl('faq'), fields: ['faqSchema'] }]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].targetType).toBe('cms_page');
  });

  it('B: stale FAQ content fails', async () => {
    const { draft } = setupApprovedDraft(faqChange(), { content: '<h3>Changed?</h3><p>Yes.</p>' });
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('stale');
  });

  it('C: an invented/non-visible answer (proposed items diverge from live content) fails', async () => {
    const change = faqChange({
      items: [
        { question: 'What makes Rajhans Tea different?', answer: 'We source directly from Assam gardens.' },
        { question: 'Is Rajhans Tea 100% natural?', answer: 'Invented answer not on the page.' },
      ],
    });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('schema_mismatch');
  });

  it('D: a duplicate question in the live content fails', async () => {
    const dupHtml =
      '<h3>Same question?</h3><p>Answer one.</p>' + '<h3>Same question?</h3><p>Answer two.</p>';
    const { draft } = setupApprovedDraft(
      faqChange({ execution: { sourceContentSnapshot: dupHtml, proposedJsonLd: {} } }),
      { content: dupHtml },
    );
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('duplicate_question');
  });

  it('E: empty question/answer (no FAQ entries at all) fails', async () => {
    const emptyHtml = '<h2>Frequently Asked Questions</h2><p>No h3 pairs here.</p>';
    const { draft } = setupApprovedDraft(
      faqChange({ execution: { sourceContentSnapshot: emptyHtml, proposedJsonLd: {} } }),
      { content: emptyHtml },
    );
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('empty_faq_items');
  });

  it('F: an equivalent FAQPage schema already present fails/no-ops', async () => {
    const jsonLd = buildFaqJsonLd(FAQ_ITEMS);
    const serialized = serializeFaqJsonLd(jsonLd);
    const { draft } = setupApprovedDraft(faqChange(), { faqSchema: serialized });
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('schema_already_present');
  });

  it('G: malformed schema (proposedJsonLd does not match deterministic derivation) fails', async () => {
    const change = faqChange({ execution: { sourceContentSnapshot: FAQ_HTML, proposedJsonLd: { '@type': 'WrongType' } } });
    const { draft } = setupApprovedDraft(change);
    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('schema_mismatch');
  });

  it('rejects a recommendation that is not approved', async () => {
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    pageStore.push(makePage());
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [faqChange()],
    });
    draftStore.push(draft);

    const { result } = await evaluateExecutionPreflight({ draftId: String(draft._id) });
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('not_approved');
  });

  it('rejects an outline-only (historical) FAQ draft with no execution payload', async () => {
    const outlineOnly: FaqProposedChange = { kind: 'faq', targetUrl: pageUrl('faq'), items: [] };
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
});

// -----------------------------------------------------------------------------
describe('executeApprovedChangeDraft — faq (H: changes only faqSchema)', () => {
  it('writes only Page.faqSchema and leaves every other field untouched', async () => {
    const { draft } = setupApprovedDraft(faqChange(), {
      metaTitle: 'Untouched Title',
      metaDescription: 'Untouched description',
    });
    const executorUserId = String(new mongoose.Types.ObjectId());

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });

    expect(result.ok).toBe(true);
    const page = pageStore[0]!;
    expect(page.faqSchema).toBe(serializeFaqJsonLd(buildFaqJsonLd(FAQ_ITEMS)));
    expect(page.content).toBe(FAQ_HTML);
    expect(page.metaTitle).toBe('Untouched Title');
    expect(page.metaDescription).toBe('Untouched description');
    expect(execStore).toHaveLength(1);
    expect(execStore[0]!.targetType).toBe('cms_page');
    expect(publicationStore).toHaveLength(1);
    expect(publicationStore[0]!.status).toBe('pending');
  });

  it('rejects (stale) when the FAQ content changed before commit', async () => {
    const { draft } = setupApprovedDraft(faqChange());
    // Simulate a concurrent edit landing between preflight preview and execution.
    pageStore[0]!.content = '<h3>Changed?</h3><p>Yes.</p>';
    const executorUserId = String(new mongoose.Types.ObjectId());

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('stale');
    expect(execStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('rollbackExecution — faq (I: restores exact previous state)', () => {
  it('restores Page.faqSchema to its exact pre-execution value', async () => {
    const { draft } = setupApprovedDraft(faqChange());
    const executorUserId = String(new mongoose.Types.ObjectId());
    const execResult = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    expect(execResult.ok).toBe(true);
    if (!execResult.ok) return;

    expect(pageStore[0]!.faqSchema).not.toBe('');

    const rollbackUserId = String(new mongoose.Types.ObjectId());
    const rollbackResult = await rollbackExecution({
      executionId: String(execResult.execution._id),
      rollbackUserId,
    });

    expect(rollbackResult.ok).toBe(true);
    expect(pageStore[0]!.faqSchema).toBe('');
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — faq (J/K: live schema verification)', () => {
  async function executeAndPublish(): Promise<{ executionId: string }> {
    const { draft } = setupApprovedDraft(faqChange());
    const executorUserId = String(new mongoose.Types.ObjectId());
    const execResult = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId });
    if (!execResult.ok) throw new Error('setup: execution failed');
    const executionId = String(execResult.execution._id);
    const publication = publicationStore.find((p) => String(p.executionId) === executionId)!;
    publication.status = 'published';
    return { executionId };
  }

  it('J: passes when the live page has exactly the expected FAQPage schema visibly present', async () => {
    const { executionId } = await executeAndPublish();
    const expectedJsonLd = buildFaqJsonLd(FAQ_ITEMS);
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(expectedJsonLd)}</script></head><body>${FAQ_HTML}</body></html>`;

    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('faq'),
      finalUrl: pageUrl('faq'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html,
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('verified');
      expect(result.verification.targets[0]!.matches.faqSchema).toBe(true);
    }
  });

  it('K: fails when the live page is missing the FAQPage schema block', async () => {
    const { executionId } = await executeAndPublish();
    const html = `<html><head></head><body>${FAQ_HTML}</body></html>`;

    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('faq'),
      finalUrl: pageUrl('faq'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html,
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('mismatch');
      expect(result.verification.targets[0]!.mismatchFields).toContain('faq_schema_missing_on_page');
    }
  });

  it('K: fails when the live schema has a wrong/invented answer not present on the visible page', async () => {
    const { executionId } = await executeAndPublish();
    const wrongJsonLd = buildFaqJsonLd([
      { question: 'What makes Rajhans Tea different?', answer: 'We source directly from Assam gardens.' },
      { question: 'Is Rajhans Tea 100% natural?', answer: 'A completely invented answer.' },
    ]);
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(wrongJsonLd)}</script></head><body>${FAQ_HTML}</body></html>`;

    mockFetchUrl.mockResolvedValue({
      requestedUrl: pageUrl('faq'),
      finalUrl: pageUrl('faq'),
      finalStatus: 200,
      redirectChain: [],
      error: null,
      transient: false,
      html,
    });

    const result = await verifyExecution({ executionId, verifierUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('mismatch');
      expect(result.verification.targets[0]!.mismatchFields.length).toBeGreaterThan(0);
    }
  });
});

// -----------------------------------------------------------------------------
describe('L: existing product/metadata/internal-link executors remain unaffected', () => {
  it('a plain metadata execution still writes only metaTitle/metaDescription, never faqSchema', async () => {
    const rec = makeRec();
    recStore.push(rec);
    pageStore.push(makePage({ slug: 'about-us', metaTitle: 'Old', metaDescription: 'Old desc' }));
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [
        {
          kind: 'metadata',
          targetUrl: pageUrl('about-us'),
          fields: { title: { current: 'Old', proposed: 'New Title' } },
        } as any,
      ],
    });
    draftStore.push(draft);

    const result = await executeApprovedChangeDraft({ draftId: String(draft._id), executorUserId: String(new mongoose.Types.ObjectId()) });
    expect(result.ok).toBe(true);
    expect(pageStore[0]!.metaTitle).toBe('New Title');
    expect(pageStore[0]!.faqSchema).toBe('');
  });
});
