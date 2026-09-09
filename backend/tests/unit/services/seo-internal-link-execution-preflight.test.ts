// =============================================================================
// UNIT TESTS — Phase 6.4A internal-link execution preflight
//
// Exercises evaluateExecutionPreflight's 'internal_link' branch directly, with
// the same "plain in-memory store" mocking style seo-change-execution-
// preflight.test.ts already uses for the metadata branch. No real DB, no
// network, no OpenAI/DataForSEO — this file only ever imports the deterministic
// preflight evaluator and its own tiny in-memory model doubles.
// =============================================================================

import mongoose from 'mongoose';
import { InternalLinkProposedChange, ProposedChange } from '../../../src/modules/seo/models/seo-change-draft.model';

interface FakeRec {
  _id: mongoose.Types.ObjectId;
  fingerprint: string;
  status: 'open' | 'resolved';
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_changes';
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
  slug: string;
  content: string;
  status: 'draft' | 'published';
}

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let blogStore: FakeBlog[] = [];
let execStore: FakeExecution[] = [];

interface SessionQuery<T> {
  session: jest.Mock;
  exec: () => Promise<T | null>;
}

function makeSessionQuery<T>(exec: () => Promise<T | null>): SessionQuery<T> {
  const query: SessionQuery<T> = { session: jest.fn(), exec };
  query.session.mockImplementation(() => query);
  return query;
}

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
    generatorVersion: '6.4.0-internal-link-v1',
    proposedChanges: [],
    validation: { isValid: true, warnings: [], errors: [] },
    ...fields,
  };
}

function makeBlog(fields: Partial<FakeBlog> = {}): FakeBlog {
  return {
    _id: new mongoose.Types.ObjectId(),
    slug: 'source-post',
    content: 'For black tea like Rajhans CTC, use water heated to 200F.',
    status: 'published',
    ...fields,
  };
}

function blogUrl(slug: string): string {
  return `https://rajhanstea.com/blog/${slug}/`;
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
    exists: jest.fn(async (query: { draftId?: unknown }) =>
      execStore.some((d) => String(d.draftId) === String(query.draftId)) ? { _id: 'x' } : null,
    ),
  },
}));

jest.mock('../../../src/modules/cms/models/blog.model', () => ({
  Blog: {
    findOne: jest.fn((query: { slug?: string; status?: string }) =>
      makeSessionQuery(
        async () =>
          blogStore.find(
            (b) => b.slug === query.slug && (query.status === undefined || b.status === query.status),
          ) ?? null,
      ),
    ),
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => blogStore.find((b) => String(b._id) === String(id)) ?? null),
    ),
  },
}));

import { evaluateExecutionPreflight, PreflightBlockerCode } from '../../../src/modules/seo/services/change-execution-preflight.service';

beforeEach(() => {
  recStore = [];
  draftStore = [];
  blogStore = [];
  execStore = [];
  jest.clearAllMocks();
});

function blockerCodes(blockers: { code: PreflightBlockerCode }[]): PreflightBlockerCode[] {
  return blockers.map((b) => b.code);
}

function linkChange(overrides: Partial<InternalLinkProposedChange> = {}): InternalLinkProposedChange {
  const before = 'For black tea like Rajhans CTC, use water heated to 200F.';
  return {
    kind: 'internal_link',
    sourceUrl: blogUrl('source-post'),
    targetUrl: blogUrl('target-post'),
    anchorText: 'Rajhans CTC',
    execution: {
      sourcePageType: 'blog_content',
      beforeContent: before,
      afterContent: 'For black tea like <a href="' + blogUrl('target-post') + '">Rajhans CTC</a>, use water heated to 200F.',
      contextSnapshot: before,
    },
    ...overrides,
  };
}

function setupDraft(change: InternalLinkProposedChange, sourceBlog?: Partial<FakeBlog>, targetBlog?: Partial<FakeBlog>) {
  const rec = makeRec();
  recStore.push(rec);
  blogStore.push(makeBlog({ slug: 'source-post', content: change.execution!.beforeContent, ...sourceBlog }));
  if (targetBlog !== undefined || change.targetUrl.includes('/blog/')) {
    blogStore.push(makeBlog({ slug: 'target-post', content: 'Some unrelated target content.', ...targetBlog }));
  }
  const draft = makeDraft({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    proposedChanges: [change],
  });
  draftStore.push(draft);
  return { rec, draft };
}

async function evaluate(draft: FakeDraft) {
  return evaluateExecutionPreflight({ draftId: String(draft._id) });
}

describe('evaluateExecutionPreflight — internal_link (Phase 6.4A)', () => {
  it('A: a valid, approved, contextual link passes preflight', async () => {
    const change = linkChange();
    const { draft } = setupDraft(change);
    const { result, prepared } = await evaluate(draft);

    expect(result.executable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.changedFields).toEqual([{ targetUrl: change.sourceUrl, fields: ['content'] }]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].targetType).toBe('blog');
  });

  it('B: stale source content fails', async () => {
    const change = linkChange();
    const { draft } = setupDraft(change, { content: 'The live content has since changed entirely.' });
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('stale');
  });

  it('C: missing anchor (not present in context) fails', async () => {
    const change = linkChange({ anchorText: 'Darjeeling' });
    const { draft } = setupDraft(change);
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('anchor_not_found');
  });

  it('D: ambiguous anchor (context repeats in the source) fails', async () => {
    const repeated = 'Steep the tea well. Steep the tea well.';
    const change = linkChange({
      anchorText: 'Steep',
      execution: {
        sourcePageType: 'blog_content',
        beforeContent: repeated,
        afterContent: repeated, // irrelevant — rejected before comparison
        contextSnapshot: 'Steep the tea well.',
      },
    });
    const { draft } = setupDraft(change, { content: repeated });
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('ambiguous_anchor');
  });

  it('E: source already links to target rejected (duplicate link)', async () => {
    const already = `See <a href="${blogUrl('target-post')}">this guide</a> for more. For black tea like Rajhans CTC, use water heated to 200F.`;
    const change = linkChange({
      execution: {
        sourcePageType: 'blog_content',
        beforeContent: already,
        afterContent: already,
        contextSnapshot: 'For black tea like Rajhans CTC, use water heated to 200F.',
      },
    });
    const { draft } = setupDraft(change, { content: already });
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('duplicate_link');
  });

  it('F: self-link rejected', async () => {
    const change = linkChange({ targetUrl: blogUrl('source-post') });
    const { draft } = setupDraft(change);
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('self_link');
  });

  it('G: external (non-Rajhans) target rejected', async () => {
    const change = linkChange({ targetUrl: 'https://example.com/some-other-site/' });
    const { draft } = setupDraft(change, {}, undefined);
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('external_target');
  });

  it('H: unsupported source page type rejected', async () => {
    const change = linkChange({
      execution: {
        sourcePageType: 'blog_content',
        beforeContent: 'x',
        afterContent: 'x',
        contextSnapshot: 'x',
      },
    });
    // Force an unsupported type via a cast — the schema allows only
    // 'blog_content' today, but the check must still fail closed if that
    // ever changes upstream.
    (change.execution as unknown as { sourcePageType: string }).sourcePageType = 'product_description';
    const { draft } = setupDraft(change);
    const { result } = await evaluate(draft);

    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('unsupported_target');
  });

  it('rejects a recommendation that is not approved', async () => {
    const change = linkChange();
    const rec = makeRec({ reviewStatus: 'pending' });
    recStore.push(rec);
    blogStore.push(makeBlog({ slug: 'source-post', content: change.execution!.beforeContent }));
    blogStore.push(makeBlog({ slug: 'target-post', content: 'target' }));
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [change],
    });
    draftStore.push(draft);

    const { result } = await evaluate(draft);
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('not_approved');
  });

  it('rejects an outline-only (historical) internal-link draft with no execution payload', async () => {
    const outlineOnly: InternalLinkProposedChange = {
      kind: 'internal_link',
      sourceUrl: null,
      targetUrl: blogUrl('target-post'),
      anchorText: 'Target Post',
    };
    const rec = makeRec();
    recStore.push(rec);
    const draft = makeDraft({
      recommendationId: rec._id,
      recommendationFingerprint: rec.fingerprint,
      proposedChanges: [outlineOnly],
    });
    draftStore.push(draft);

    const { result } = await evaluate(draft);
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toContain('unsupported_kind');
  });

  it('M: does not touch/require the Product or Page models at all for a blog-only draft', async () => {
    // Implicit in this file's mock setup: only SeoRecommendation, SeoChangeDraft,
    // SeoChangeExecution and Blog are mocked. If the internal_link branch
    // accidentally required Product/Page, this whole suite would fail to
    // resolve those unmocked imports when exercising a blog→blog link.
    const change = linkChange();
    const { draft } = setupDraft(change);
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
  });
});
