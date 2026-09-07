// =============================================================================
// UNIT TESTS — SEO Phase 5.5 execution preflight / quality controls
//
// Exercises the shared authoritative evaluator directly: eligibility blockers,
// the new fail-closed Phase 5.5 blockers, the advisory SEO quality warnings, the
// deterministic risk model, and the hard guarantee that evaluating writes
// NOTHING. Model access is mocked with the same plain in-memory `store` arrays
// the Phase 5.2/5.3 tests use, so no real DB is needed and no network, provider
// or LLM is ever reachable from this code path.
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
}

interface FakeExecution {
  _id: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
}

let recStore: FakeRec[] = [];
let draftStore: FakeDraft[] = [];
let pageStore: FakePage[] = [];
let execStore: FakeExecution[] = [];

// Every write entry point the SEO module can reach. A preflight evaluation must
// never call ANY of them — asserted explicitly below.
const writeSpies = {
  pageFindByIdAndUpdate: jest.fn(),
  pageUpdateOne: jest.fn(),
  pageCreate: jest.fn(),
  draftUpdateMany: jest.fn(),
  recUpdateOne: jest.fn(),
  executionCreate: jest.fn(),
  executionInit: jest.fn(),
};

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
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'About Us',
    slug: 'about-us',
    content: '<p>original content</p>',
    metaTitle: 'Old Title',
    metaDescription: 'Old description.',
    status: 'published',
    updatedBy: null,
    ...fields,
  };
}

function pageUrl(slug: string, trailingSlash = true): string {
  return `https://rajhanstea.com/page/${slug}${trailingSlash ? '/' : ''}`;
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

// ── Duplicate-metadata lookup: emulates the exact { _id: { $ne }, status, $or }
// filter shape plus the select/limit/session/exec chain the evaluator uses. ──
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

let lastDuplicateQuery: DuplicateQuery | null = null;
let lastDuplicateLimit: number | null = null;

function makeDuplicateQuery(query: DuplicateQuery): ChainQuery {
  lastDuplicateQuery = query;
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
            Object.entries(clause).every(
              ([field, value]) => (p as unknown as Record<string, unknown>)[field] === value,
            ),
          );
        })
        .slice(0, cap),
  };
  chain.select.mockImplementation(() => chain);
  chain.limit.mockImplementation((n: number) => {
    lastDuplicateLimit = n;
    cap = n;
    return chain;
  });
  chain.session.mockImplementation(() => chain);
  return chain;
}

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findById: jest.fn((id: unknown) =>
      makeSessionQuery(async () => recStore.find((d) => String(d._id) === String(id)) ?? null),
    ),
    updateOne: jest.fn((...args: unknown[]) => writeSpies.recUpdateOne(...args)),
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
      updateMany: jest.fn((...args: unknown[]) => writeSpies.draftUpdateMany(...args)),
    },
  };
});

jest.mock('../../../src/modules/seo/models/seo-change-execution.model', () => ({
  SeoChangeExecution: {
    init: jest.fn((...args: unknown[]) => writeSpies.executionInit(...args)),
    exists: jest.fn(async (query: { draftId?: unknown }) =>
      execStore.some((d) => String(d.draftId) === String(query.draftId)) ? { _id: 'x' } : null,
    ),
    create: jest.fn((...args: unknown[]) => writeSpies.executionCreate(...args)),
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
    find: jest.fn((query: DuplicateQuery) => makeDuplicateQuery(query)),
    findByIdAndUpdate: jest.fn((...args: unknown[]) => writeSpies.pageFindByIdAndUpdate(...args)),
    updateOne: jest.fn((...args: unknown[]) => writeSpies.pageUpdateOne(...args)),
    create: jest.fn((...args: unknown[]) => writeSpies.pageCreate(...args)),
  },
}));

import {
  evaluateExecutionPreflight,
  toPreflightView,
  PREFLIGHT_VERSION,
  PREFLIGHT_THRESHOLDS,
  PreflightBlockerCode,
  PreflightWarningCode,
  PreflightCheckCode,
} from '../../../src/modules/seo/services/change-execution-preflight.service';
import { seoConfig } from '../../../src/modules/seo/seo.config';

beforeEach(() => {
  recStore = [];
  draftStore = [];
  pageStore = [];
  execStore = [];
  lastDuplicateQuery = null;
  lastDuplicateLimit = null;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function metadataChange(overrides: Partial<MetadataProposedChange> = {}): MetadataProposedChange {
  return {
    kind: 'metadata',
    targetUrl: pageUrl('about-us'),
    fields: { title: { current: 'Old Title', proposed: 'A Clearly Different Page Title' } },
    ...overrides,
  } as MetadataProposedChange;
}

function setupDraft(opts: {
  proposedChanges: ProposedChange[];
  validationIsValid?: boolean;
  pages?: Partial<FakePage>[];
}): { rec: FakeRec; draft: FakeDraft } {
  const rec = makeRec();
  recStore.push(rec);
  for (const page of opts.pages ?? []) pageStore.push(makePage(page));
  const draft = makeDraft({
    recommendationId: rec._id,
    recommendationFingerprint: rec.fingerprint,
    proposedChanges: opts.proposedChanges,
    validation: { isValid: opts.validationIsValid ?? true, warnings: [], errors: [] },
  });
  draftStore.push(draft);
  return { rec, draft };
}

async function evaluate(draft: FakeDraft) {
  return evaluateExecutionPreflight({ draftId: String(draft._id) });
}

function blockerCodes(blockers: { code: PreflightBlockerCode }[]): PreflightBlockerCode[] {
  return blockers.map((b) => b.code);
}

function warningCodes(warnings: { code: PreflightWarningCode }[]): PreflightWarningCode[] {
  return warnings.map((w) => w.code);
}

function checkStatus(
  checks: { code: PreflightCheckCode; status: string }[],
  code: PreflightCheckCode,
): string | undefined {
  return checks.find((c) => c.code === code)?.status;
}

/** A title whose RENDERED length (stored + the 14-char brand suffix) is inside the guideline band. */
const GOOD_TITLE = 'A Clearly Different Page Title'; // 30 stored → 44 rendered
const GOOD_DESCRIPTION =
  'A genuinely descriptive meta description for this page, comfortably inside the guideline band.'; // 94 chars

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — eligibility blockers (Phase 5.3 rules, one implementation)', () => {
  it('rejects a malformed draft id without touching the database', async () => {
    const { result, draft } = await evaluateExecutionPreflight({ draftId: 'not-an-object-id' });
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toEqual(['invalid_id']);
    expect(draft).toBeNull();
  });

  it('rejects a draft that does not exist', async () => {
    const { result, draft } = await evaluateExecutionPreflight({ draftId: String(new mongoose.Types.ObjectId()) });
    expect(blockerCodes(result.blockers)).toEqual(['not_found']);
    expect(checkStatus(result.checks, 'draft_exists')).toBe('fail');
    expect(draft).toBeNull();
  });

  it('reports an already-executed draft, and still returns the draft so the API can tell it apart from a missing one', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}] });
    execStore.push({ _id: new mongoose.Types.ObjectId(), draftId: draft._id });

    const { result, draft: loaded } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['already_executed']);
    expect(checkStatus(result.checks, 'not_already_executed')).toBe('fail');
    expect(loaded).not.toBeNull();
  });

  it('rejects a superseded draft', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}] });
    draft.status = 'superseded';
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['not_draft']);
  });

  it('rejects a draft whose recommendation no longer exists', async () => {
    const draft = makeDraft({ recommendationId: new mongoose.Types.ObjectId(), proposedChanges: [metadataChange()] });
    draftStore.push(draft);
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['recommendation_not_found']);
  });

  it('rejects a resolved (non-open) recommendation', async () => {
    const { draft, rec } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}] });
    rec.status = 'resolved';
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['not_open']);
  });

  it.each<ReviewStatus>(['pending', 'rejected', 'needs_changes'])(
    'rejects a recommendation whose review status is "%s"',
    async (reviewStatus) => {
      const { draft, rec } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}] });
      rec.reviewStatus = reviewStatus;
      const { result } = await evaluate(draft);
      expect(blockerCodes(result.blockers)).toEqual(['not_approved']);
    },
  );

  it('rejects a fingerprint mismatch', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}] });
    draft.recommendationFingerprint = 'fp-stale';
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['fingerprint_mismatch']);
    expect(checkStatus(result.checks, 'fingerprint_match')).toBe('fail');
  });

  it('rejects a draft that failed its own generation-time validation', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange()], pages: [{}], validationIsValid: false });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['invalid_draft']);
  });

  it('rejects a draft with no proposed changes', async () => {
    const { draft } = setupDraft({ proposedChanges: [] });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['invalid_draft']);
  });

  it.each<[string, ProposedChange]>([
    ['structured_data', { kind: 'structured_data', targetUrl: pageUrl('about-us'), schemaType: 'Organization', jsonLd: {} }],
    ['internal_link', { kind: 'internal_link', targetUrl: pageUrl('about-us'), sourceUrl: null, anchorText: null }],
    ['content', { kind: 'content', targetUrl: pageUrl('about-us'), blocks: [] }],
    ['faq', { kind: 'faq', targetUrl: pageUrl('about-us'), items: [] }],
    ['generic', { kind: 'generic', targetUrl: pageUrl('about-us'), summary: 's', instructions: 'i' }],
  ])('rejects the unsupported change kind "%s"', async (_kind, change) => {
    const { draft } = setupDraft({ proposedChanges: [change], pages: [{}] });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_kind']);
  });

  it('rejects an h1 field, which is outside the executable Phase 5.3 scope', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { h1: { current: 'Old', proposed: 'New' } } })],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_field']);
  });

  it('rejects an unknown metadata field key', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { canonical: { current: null, proposed: 'x' } } as unknown as MetadataProposedChange['fields'] }),
      ],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_field']);
  });

  it('rejects a metadata change proposing no executable field at all', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange({ fields: {} })], pages: [{}] });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_field']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — target resolution', () => {
  it('rejects a target on a foreign host', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ targetUrl: 'https://example.com/page/about-us/' })],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_target']);
    expect(checkStatus(result.checks, 'target_resolvable')).toBe('fail');
  });

  it.each([
    ['a product URL', 'https://rajhanstea.com/product/assam-ctc/'],
    ['a blog URL', 'https://rajhanstea.com/blog/brewing/'],
    ['the homepage', 'https://rajhanstea.com/'],
    ['a query string', 'https://rajhanstea.com/page/about-us/?utm_source=x'],
    ['a fragment', 'https://rajhanstea.com/page/about-us/#top'],
    ['embedded credentials', 'https://admin:secret@rajhanstea.com/page/about-us/'],
  ])('rejects %s as an unsupported target', async (_label, targetUrl) => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange({ targetUrl })], pages: [{}] });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['unsupported_target']);
  });

  it('rejects a target with no matching CMS page', async () => {
    const { draft } = setupDraft({ proposedChanges: [metadataChange({ targetUrl: pageUrl('nope') })], pages: [{}] });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['target_not_found']);
    expect(result.blockers[0].message).toContain('No CMS page found');
  });

  it('rejects an unpublished target, and says so explicitly rather than claiming the page is missing', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange()],
      pages: [{ slug: 'about-us', status: 'draft' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['target_not_found']);
    expect(result.blockers[0].message).toContain('no longer published');
  });

  it('rejects two targets that resolve to the same CMS page as ambiguous', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ targetUrl: pageUrl('about-us'), fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } }),
        metadataChange({
          targetUrl: pageUrl('about-us', false),
          fields: { title: { current: 'Old Title', proposed: 'Another Perfectly Fine Title' } },
        }),
      ],
      pages: [{ slug: 'about-us' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['ambiguous_target']);
    // The first target legitimately claims the page; the second is the ambiguous one.
    expect(result.checks.filter((c) => c.code === 'target_unique').map((c) => c.status)).toEqual(['pass', 'fail']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — staleness (exact comparison, never normalized)', () => {
  it('rejects a stale title', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'What The Draft Recorded', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Someone Else Changed This' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['stale']);
    expect(checkStatus(result.checks, 'live_state_unchanged')).toBe('fail');
  });

  it('rejects a stale description', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { metaDescription: { current: 'Recorded description.', proposed: GOOD_DESCRIPTION } } }),
      ],
      pages: [{ metaDescription: 'A newer description written by an admin.' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['stale']);
  });

  it('treats a whitespace-only difference in the CURRENT value as stale — normalization never loosens this', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old  Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['stale']);
  });

  it('accepts a null recorded current against the Mongo default empty string', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: null, proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: '' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — no-op detection (fail closed, per target)', () => {
  it('rejects a title-only proposal identical to the current value', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: GOOD_TITLE, proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: GOOD_TITLE }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['no_effective_change']);
    expect(checkStatus(result.checks, 'effective_change')).toBe('fail');
  });

  it('rejects a both-fields proposal where both values are identical to current', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: GOOD_TITLE, proposed: GOOD_TITLE },
            metaDescription: { current: GOOD_DESCRIPTION, proposed: GOOD_DESCRIPTION },
          },
        }),
      ],
      pages: [{ metaTitle: GOOD_TITLE, metaDescription: GOOD_DESCRIPTION }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['no_effective_change']);
  });

  it('accepts a proposal where only ONE of two fields actually changes', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: 'Old Title', proposed: GOOD_TITLE },
            metaDescription: { current: GOOD_DESCRIPTION, proposed: GOOD_DESCRIPTION },
          },
        }),
      ],
      pages: [{ metaTitle: 'Old Title', metaDescription: GOOD_DESCRIPTION }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
  });

  it('blocks the WHOLE draft when a single target in a multi-target draft is a no-op', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ targetUrl: pageUrl('page-one'), fields: { title: { current: 'One', proposed: GOOD_TITLE } } }),
        metadataChange({ targetUrl: pageUrl('page-two'), fields: { title: { current: GOOD_TITLE, proposed: GOOD_TITLE } } }),
      ],
      pages: [
        { slug: 'page-one', metaTitle: 'One' },
        { slug: 'page-two', metaTitle: GOOD_TITLE },
      ],
    });
    const { result, prepared } = await evaluate(draft);
    expect(result.executable).toBe(false);
    expect(blockerCodes(result.blockers)).toEqual(['no_effective_change']);
    expect(prepared).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — malformed value rejection', () => {
  it('rejects a non-string proposed value', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { title: { current: 'Old Title', proposed: 42 } } as unknown as MetadataProposedChange['fields'] }),
      ],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
    expect(result.blockers[0].message).toContain('not a string');
  });

  it('rejects a non-string, non-null recorded current value', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: { title: { current: { nested: true }, proposed: GOOD_TITLE } } as unknown as MetadataProposedChange['fields'],
        }),
      ],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
  });

  it('rejects a proposed value containing control characters', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'Line one\nLine two' } } })],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
    expect(result.blockers[0].message).toContain('control characters');
  });

  it('rejects a proposed title beyond the structural length limit', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: { title: { current: 'Old Title', proposed: 'x'.repeat(PREFLIGHT_THRESHOLDS.hardMaxTitleLength + 1) } },
        }),
      ],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
    expect(result.blockers[0].message).toContain('structural limit');
  });

  it('rejects a proposed description beyond the structural length limit', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            metaDescription: {
              current: 'Old description.',
              proposed: 'x'.repeat(PREFLIGHT_THRESHOLDS.hardMaxDescriptionLength + 1),
            },
          },
        }),
      ],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
  });

  it('rejects a whitespace-only proposed TITLE — a page with no title is a correctness fault', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: '   ' } } })],
      pages: [{}],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
    expect(result.blockers[0].message).toContain('empty or whitespace only');
  });

  it('ALLOWS an empty proposed meta description, warning instead of blocking', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: '' } } })],
      pages: [{ metaDescription: 'Old description.' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toContain('blank_description');
  });

  it('is checked before the stale comparison, so a corrupt value is never reported as merely stale', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: { title: { current: 'Something Else Entirely', proposed: 42 } } as unknown as MetadataProposedChange['fields'],
        }),
      ],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    expect(blockerCodes(result.blockers)).toEqual(['malformed_value']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — valid proposals', () => {
  it('accepts a title-only proposal', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result, prepared } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].proposed).toEqual({ metaTitle: GOOD_TITLE });
    expect(result.changedFields).toEqual([{ targetUrl: pageUrl('about-us'), fields: ['metaTitle'] }]);
  });

  it('accepts a description-only proposal', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: GOOD_DESCRIPTION } } }),
      ],
      pages: [{ metaDescription: 'Old description.' }],
    });
    const { result, prepared } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(prepared[0].proposed).toEqual({ metaDescription: GOOD_DESCRIPTION });
    expect(result.changedFields[0].fields).toEqual(['metaDescription']);
  });

  it('accepts a both-fields proposal and reports the full mutation scope', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: 'Old Title', proposed: GOOD_TITLE },
            metaDescription: { current: 'Old description.', proposed: GOOD_DESCRIPTION },
          },
        }),
      ],
      pages: [{ metaTitle: 'Old Title', metaDescription: 'Old description.' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(result.changedFields[0].fields).toEqual(['metaTitle', 'metaDescription']);
  });

  it('resolves a published legacy-slug page from its canonical URL', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          targetUrl: pageUrl('terms-and-conditions'),
          fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } },
        }),
      ],
      pages: [{ slug: 'terms-conditions', metaTitle: 'Old Title' }],
    });
    const { result, prepared } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(prepared[0].targetType).toBe('cms_page');
    if (prepared[0].targetType !== 'cms_page') {
      throw new Error('Expected cms_page prepared target');
    }
    expect(prepared[0].page.slug).toBe('terms-conditions');
  });

  it('captures the live before-snapshot for BOTH whitelisted fields, whatever the draft proposes', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title', metaDescription: 'Untouched description.' }],
    });
    const { prepared } = await evaluate(draft);
    expect(prepared[0].before).toEqual({ metaTitle: 'Old Title', metaDescription: 'Untouched description.' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — quality warnings never block', () => {
  it('warns on an unusually short title but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'Tea' } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['title_too_short']);
    expect(checkStatus(result.checks, 'value_lengths')).toBe('warn');
  });

  it('warns on an unusually long title but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'x'.repeat(60) } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['title_too_long']);
  });

  it('judges title length on the RENDERED value, including the brand suffix the frontend appends', async () => {
    // 50 stored characters renders as 64 — over the 60 guideline only once the
    // suffix is counted, which is what a search engine actually sees.
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'x'.repeat(50) } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    expect(warningCodes(result.warnings)).toEqual(['title_too_long']);
    expect(result.warnings[0].message).toContain('64 characters');
  });

  it('warns on a short meta description but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: 'Too short.' } } })],
      pages: [{ metaDescription: 'Old description.' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['description_too_short']);
  });

  it('warns on a long meta description but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            metaDescription: { current: 'Old description.', proposed: 'x'.repeat(PREFLIGHT_THRESHOLDS.descriptionMaxLength + 1) },
          },
        }),
      ],
      pages: [{ metaDescription: 'Old description.' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['description_too_long']);
  });

  it('uses the audit engine’s own description bounds, so the two can never contradict each other', () => {
    expect(PREFLIGHT_THRESHOLDS.descriptionMinLength).toBe(seoConfig.descriptionMinLength);
    expect(PREFLIGHT_THRESHOLDS.descriptionMaxLength).toBe(seoConfig.descriptionMaxLength);
  });

  it('warns when the proposed title duplicates another published page, but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [
        { slug: 'about-us', metaTitle: 'Old Title' },
        { slug: 'shipping-policy', metaTitle: GOOD_TITLE },
      ],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['duplicate_title']);
    expect(result.warnings[0].message).toContain('shipping-policy');
  });

  it('warns when the proposed description duplicates another published page, but stays executable', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: GOOD_DESCRIPTION } } }),
      ],
      pages: [
        { slug: 'about-us', metaDescription: 'Old description.' },
        { slug: 'shipping-policy', metaDescription: GOOD_DESCRIPTION },
      ],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toEqual(['duplicate_description']);
  });

  it('EXCLUDES the target page itself from the duplicate comparison', async () => {
    // The page already stores this description on another field-independent
    // basis; only the title changes, so the page's own stored description must
    // not be reported as a duplicate of itself.
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: {
            title: { current: 'Old Title', proposed: GOOD_TITLE },
            metaDescription: { current: GOOD_DESCRIPTION, proposed: GOOD_DESCRIPTION },
          },
        }),
      ],
      pages: [{ slug: 'about-us', metaTitle: 'Old Title', metaDescription: GOOD_DESCRIPTION }],
    });
    const { result } = await evaluate(draft);
    expect(warningCodes(result.warnings)).not.toContain('duplicate_description');
    expect(lastDuplicateQuery?._id?.$ne).toBeDefined();
  });

  it('ignores UNPUBLISHED pages when looking for duplicates', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [
        { slug: 'about-us', metaTitle: 'Old Title' },
        { slug: 'archived', metaTitle: GOOD_TITLE, status: 'draft' },
      ],
    });
    const { result } = await evaluate(draft);
    expect(warningCodes(result.warnings)).toEqual([]);
    expect(lastDuplicateQuery?.status).toBe('published');
  });

  it('compares the STORED title, never the rendered brand-suffixed one', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [
        { slug: 'about-us', metaTitle: 'Old Title' },
        { slug: 'other', metaTitle: `${GOOD_TITLE} — Rajhans Tea` },
      ],
    });
    const { result } = await evaluate(draft);
    expect(warningCodes(result.warnings)).toEqual([]);
  });

  it('never treats an empty proposed description as duplicating every default-empty page', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { metaDescription: { current: 'Old description.', proposed: '' } } })],
      pages: [
        { slug: 'about-us', metaDescription: 'Old description.' },
        { slug: 'other', metaDescription: '' },
      ],
    });
    const { result } = await evaluate(draft);
    expect(warningCodes(result.warnings)).not.toContain('duplicate_description');
  });

  it('bounds the duplicate lookup rather than scanning the collection', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    await evaluate(draft);
    expect(lastDuplicateLimit).toBe(PREFLIGHT_THRESHOLDS.duplicateScanLimit);
  });

  it('warns when a title change is only whitespace/case, but still treats it as a real change', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ fields: { title: { current: GOOD_TITLE, proposed: `  ${GOOD_TITLE.toUpperCase()}  ` } } }),
      ],
      pages: [{ metaTitle: GOOD_TITLE }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toContain('normalized_no_op_title');
  });

  it('warns when a description change is only whitespace/case', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({
          fields: { metaDescription: { current: GOOD_DESCRIPTION, proposed: GOOD_DESCRIPTION.toUpperCase() } },
        }),
      ],
      pages: [{ metaDescription: GOOD_DESCRIPTION }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(warningCodes(result.warnings)).toContain('normalized_no_op_description');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — deterministic risk classification', () => {
  async function riskOf(fields: MetadataProposedChange['fields'], page: Partial<FakePage>, extra: Partial<FakePage>[] = []) {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields })],
      pages: [{ slug: 'about-us', ...page }, ...extra],
    });
    const { result } = await evaluate(draft);
    return result;
  }

  it('is low for a single clean single-field change', async () => {
    const result = await riskOf({ title: { current: 'Old Title', proposed: GOOD_TITLE } }, { metaTitle: 'Old Title' });
    expect(result.riskLevel).toBe('low');
    expect(result.warnings).toEqual([]);
  });

  it('is medium when a clean change writes both fields on one page', async () => {
    const result = await riskOf(
      {
        title: { current: 'Old Title', proposed: GOOD_TITLE },
        metaDescription: { current: 'Old description.', proposed: GOOD_DESCRIPTION },
      },
      { metaTitle: 'Old Title', metaDescription: 'Old description.' },
    );
    expect(result.riskLevel).toBe('medium');
  });

  it('is medium for a length warning', async () => {
    const result = await riskOf({ title: { current: 'Old Title', proposed: 'Tea' } }, { metaTitle: 'Old Title' });
    expect(result.riskLevel).toBe('medium');
  });

  it('is high for a duplicate-metadata warning', async () => {
    const result = await riskOf({ title: { current: 'Old Title', proposed: GOOD_TITLE } }, { metaTitle: 'Old Title' }, [
      { slug: 'clash', metaTitle: GOOD_TITLE },
    ]);
    expect(result.riskLevel).toBe('high');
  });

  it('is high for an effectively-unchanged warning', async () => {
    const result = await riskOf(
      { title: { current: GOOD_TITLE, proposed: GOOD_TITLE.toUpperCase() } },
      { metaTitle: GOOD_TITLE },
    );
    expect(result.riskLevel).toBe('high');
  });

  it('is medium when a clean change spans more than one page', async () => {
    const { draft } = setupDraft({
      proposedChanges: [
        metadataChange({ targetUrl: pageUrl('page-one'), fields: { title: { current: 'One', proposed: GOOD_TITLE } } }),
        metadataChange({
          targetUrl: pageUrl('page-two'),
          fields: { title: { current: 'Two', proposed: 'Another Perfectly Reasonable Title' } },
        }),
      ],
      pages: [
        { slug: 'page-one', metaTitle: 'One' },
        { slug: 'page-two', metaTitle: 'Two' },
      ],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(true);
    expect(result.riskLevel).toBe('medium');
  });

  it('is high whenever a blocker exists, and a blocker always forces executable=false', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Stale', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Live' }],
    });
    const { result } = await evaluate(draft);
    expect(result.executable).toBe(false);
    expect(result.riskLevel).toBe('high');
  });

  it('is fully deterministic — the same state always yields the same verdict', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: 'Tea' } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const first = (await evaluate(draft)).result;
    const second = (await evaluate(draft)).result;
    expect({ ...first, evaluatedAt: null }).toEqual({ ...second, evaluatedAt: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateExecutionPreflight — read-only guarantee', () => {
  it.each<[string, () => { draft: FakeDraft }]>([
    [
      'a fully executable draft',
      () =>
        setupDraft({
          proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
          pages: [{ metaTitle: 'Old Title' }],
        }),
    ],
    [
      'a blocked draft',
      () => setupDraft({ proposedChanges: [metadataChange()], pages: [{ metaTitle: 'Someone Else Changed This' }] }),
    ],
  ])('performs zero writes of any kind while evaluating %s', async (_label, setup) => {
    const { draft } = setup();
    const before = JSON.stringify({ pageStore, draftStore, recStore, execStore });

    await evaluate(draft);

    for (const [name, spy] of Object.entries(writeSpies)) {
      expect({ [name]: spy.mock.calls.length }).toEqual({ [name]: 0 });
    }
    expect(JSON.stringify({ pageStore, draftStore, recStore, execStore })).toBe(before);
  });

  it('never opens a transaction of its own', async () => {
    const startSession = jest.spyOn(mongoose, 'startSession');
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    await evaluate(draft);
    expect(startSession).not.toHaveBeenCalled();
    startSession.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('toPreflightView', () => {
  it('exposes the structured result and never leaks the internal prepared documents', async () => {
    const { draft } = setupDraft({
      proposedChanges: [metadataChange({ fields: { title: { current: 'Old Title', proposed: GOOD_TITLE } } })],
      pages: [{ metaTitle: 'Old Title' }],
    });
    const { result } = await evaluate(draft);
    const view = toPreflightView(result);

    expect(Object.keys(view).sort()).toEqual(
      ['blockers', 'changedFields', 'checks', 'evaluatedAt', 'evaluatorVersion', 'executable', 'riskLevel', 'warnings'].sort(),
    );
    expect(view.evaluatorVersion).toBe(PREFLIGHT_VERSION);
    expect(JSON.stringify(view)).not.toContain('_id');
  });
});
