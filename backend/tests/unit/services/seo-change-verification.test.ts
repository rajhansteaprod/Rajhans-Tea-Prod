// =============================================================================
// UNIT TESTS — SEO Phase 5.4A post-execution verification service
// Mocks SeoChangeExecution/SeoChangeVerification/Page the same way the Phase
// 5.2/5.3 tests do (plain in-memory `store` arrays), plus the fetcher/parser
// modules (so no real network call or HTML parsing happens) — no real DB or
// network is needed. Asserts verification NEVER mutates Page/execution and
// always creates exactly one immutable record per attempt.
// =============================================================================

import mongoose from 'mongoose';
import { RedirectHop } from '../../../src/modules/seo/seo.types';

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
  status: 'succeeded';
  targets: FakeExecutedTarget[];
}

interface FakePage {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  status: 'draft' | 'published';
}

interface FakeVerification {
  _id: mongoose.Types.ObjectId;
  executionId: mongoose.Types.ObjectId;
  recommendationId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  verifierUserId: mongoose.Types.ObjectId;
  verifiedAt: Date;
  status: 'verified' | 'mismatch' | 'fetch_failed';
  verifierVersion: string;
  targets: unknown[];
  createdAt: Date;
}

let execStore: FakeExecution[] = [];
let pageStore: FakePage[] = [];
let verStore: FakeVerification[] = [];

interface FakePublication {
  executionId: mongoose.Types.ObjectId;
  status: 'pending' | 'building' | 'published' | 'failed';
}

let publicationStore: FakePublication[] = [];

function makeExecutedTarget(fields: Partial<FakeExecutedTarget> = {}): FakeExecutedTarget {
  return {
    targetUrl: 'https://rajhanstea.com/page/about-us/',
    targetDocumentId: new mongoose.Types.ObjectId(),
    before: {},
    proposed: {},
    after: {},
    ...fields,
  };
}

function makeExecution(fields: Partial<FakeExecution> = {}): FakeExecution {
  return {
    _id: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    status: 'succeeded',
    targets: [],
    ...fields,
  };
}

function makePage(fields: Partial<FakePage> = {}): FakePage {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'About Us',
    slug: 'about-us',
    metaTitle: 'About Us',
    metaDescription: 'About our tea company.',
    status: 'published',
    ...fields,
  };
}

function makeVerification(fields: Partial<FakeVerification> = {}): FakeVerification {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    executionId: new mongoose.Types.ObjectId(),
    recommendationId: new mongoose.Types.ObjectId(),
    draftId: new mongoose.Types.ObjectId(),
    verifierUserId: new mongoose.Types.ObjectId(),
    verifiedAt: now,
    status: 'verified',
    verifierVersion: '',
    targets: [],
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

jest.mock('../../../src/modules/seo/models/seo-change-verification.model', () => {
  const actual = jest.requireActual('../../../src/modules/seo/models/seo-change-verification.model');
  return {
    ...actual,
    SeoChangeVerification: {
      create: jest.fn(async (doc: Partial<FakeVerification>) => {
        const created = makeVerification(doc);
        verStore.push(created);
        return created;
      }),
      find: jest.fn((query: { executionId?: unknown }) => ({
        sort: () => ({
          exec: async () =>
            verStore
              .filter((v) => String(v.executionId) === String(query.executionId))
              .sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime()),
        }),
      })),
      findById: jest.fn((id: unknown) => ({
        exec: async () => verStore.find((v) => String(v._id) === String(id)) ?? null,
      })),
    },
  };
});


jest.mock('../../../src/modules/seo/models/seo-change-publication.model', () => ({
  SeoChangePublication: {
    findOne: jest.fn((query: { executionId?: unknown }) => ({
      exec: async () =>
        publicationStore.find(
          (p) => String(p.executionId) === String(query.executionId),
        ) ?? null,
    })),
  },
}));

jest.mock('../../../src/modules/cms/models/page.model', () => ({
  Page: {
    findById: jest.fn((id: unknown) => ({
      exec: async () => pageStore.find((p) => String(p._id) === String(id)) ?? null,
    })),
  },
}));

jest.mock('../../../src/modules/seo/services/fetcher.service', () => ({
  fetchUrl: jest.fn(),
}));

jest.mock('../../../src/modules/seo/services/parser.service', () => ({
  parseHtml: jest.fn(),
}));

import { verifyExecution, listVerificationsForExecution } from '../../../src/modules/seo/services/change-verification.service';
import { fetchUrl } from '../../../src/modules/seo/services/fetcher.service';
import { parseHtml } from '../../../src/modules/seo/services/parser.service';

const mockFetchUrl = fetchUrl as jest.Mock;
const mockParseHtml = parseHtml as jest.Mock;
const verifierUserId = new mongoose.Types.ObjectId().toString();

type FetchResultLike = {
  requestedUrl: string;
  redirectChain: RedirectHop[];
  finalUrl: string;
  finalStatus: number | null;
  html: string | null;
  error: string | null;
  transient: boolean;
};

function fetchOk(overrides: Partial<FetchResultLike> = {}): FetchResultLike {
  return {
    requestedUrl: 'https://rajhanstea.com/page/about-us/',
    redirectChain: [],
    finalUrl: 'https://rajhanstea.com/page/about-us/',
    finalStatus: 200,
    html: '<html></html>',
    error: null,
    transient: false,
    ...overrides,
  };
}

beforeEach(() => {
  execStore = [];
  pageStore = [];
  verStore = [];
  publicationStore = [];
  jest.clearAllMocks();
  mockFetchUrl.mockResolvedValue(fetchOk());
  mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: 'About our tea company.' });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — eligibility', () => {
  it('rejects a malformed execution id', async () => {
    const result = await verifyExecution({ executionId: 'not-an-object-id', verifierUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_id');
    expect(verStore).toHaveLength(0);
  });

  it('rejects when the execution does not exist', async () => {
    const result = await verifyExecution({ executionId: String(new mongoose.Types.ObjectId()), verifierUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('rejects an execution whose status is not "succeeded"', async () => {
    const execution = makeExecution({ status: 'failed' as unknown as 'succeeded' });
    execStore.push(execution);
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_state');
    expect(verStore).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — single-target success', () => {
  it('verifies a title-only execution successfully', async () => {
    const page = makePage({ metaTitle: 'About Us', title: 'About Us' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us' },
          after: { metaTitle: 'About Us', metaDescription: 'About our tea company.' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: 'About our tea company.' });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
    expect(result.verification.targets[0].matches.title).toBe(true);
    expect(result.verification.targets[0].matches.metaDescription).toBeUndefined();
  });

  it('verifies a description-only execution successfully', async () => {
    const page = makePage({ metaDescription: 'About our tea company.' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaDescription: 'About our tea company.' },
          after: { metaTitle: page.metaTitle, metaDescription: 'About our tea company.' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: 'Anything — Rajhans Tea', metaDescription: 'About our tea company.' });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
    expect(result.verification.targets[0].matches.metaDescription).toBe(true);
    expect(result.verification.targets[0].matches.title).toBeUndefined();
  });

  it('verifies both fields when both were executed', async () => {
    const page = makePage({ metaTitle: 'About Us', metaDescription: 'About our tea company.' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us', metaDescription: 'About our tea company.' },
          after: { metaTitle: 'About Us', metaDescription: 'About our tea company.' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: 'About our tea company.' });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
    expect(result.verification.targets[0].matches.title).toBe(true);
    expect(result.verification.targets[0].matches.metaDescription).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — DB drift since execution', () => {
  it('a live metaTitle that differs from execution.after is a mismatch (never fetched)', async () => {
    const page = makePage({ metaTitle: 'Someone Edited This' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us' },
          after: { metaTitle: 'About Us' },
        }),
      ],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].status).toBe('mismatch');
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('a live metaDescription that differs from execution.after is a mismatch (never fetched)', async () => {
    const page = makePage({ metaDescription: 'Someone edited this too.' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaDescription: 'About our tea company.' },
          after: { metaDescription: 'About our tea company.' },
        }),
      ],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — Page state no longer matches execution assumptions', () => {
  it('a missing Page is a mismatch, not fetch_failed', async () => {
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: new mongoose.Types.ObjectId(), proposed: { metaTitle: 'X' } })],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].status).toBe('mismatch');
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('a Page unpublished since execution is a mismatch, not fetch_failed', async () => {
    const page = makePage({ status: 'draft' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: page.metaTitle } })],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — fetch classification', () => {
  function setupSingleTarget(): FakeExecution {
    const page = makePage();
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: page.metaTitle }, after: { metaTitle: page.metaTitle } })],
    });
    execStore.push(execution);
    return execution;
  }

  it('a transient fetch failure is fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(fetchOk({ transient: true, finalStatus: 0, html: null, error: 'FetchError' }));
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
  });

  it('a final 404 is fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(fetchOk({ finalStatus: 404, html: null }));
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
  });

  it('a final 500 after retry exhaustion (transient) is fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(fetchOk({ transient: true, finalStatus: 500, html: null, error: 'HTTP 500' }));
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
  });

  it('a redirect-hop-limit failure is fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(
      fetchOk({ transient: false, finalStatus: 301, html: null, error: 'Exceeded 5 redirect hops' }),
    );
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
  });

  it('a final 200 with null (non-HTML) body is fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(fetchOk({ finalStatus: 200, html: null }));
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
  });

  it('does not treat a normal metadata mismatch as fetch_failed', async () => {
    const execution = setupSingleTarget();
    mockFetchUrl.mockResolvedValue(fetchOk());
    mockParseHtml.mockReturnValue({ title: 'Completely Different Title', metaDescription: null });
    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
  });
});

// -----------------------------------------------------------------------------
// Redirect safety — a coincidentally-matching title fetched from the WRONG
// resource (a different origin, or a different Rajhans page reached via
// redirect) must never be reported as "verified". fetchUrl follows redirects
// internally and only reports the terminal response; the verifier must not
// trust that terminal response unless it actually lands back on the intended
// canonical target.
// -----------------------------------------------------------------------------
describe('verifyExecution — redirect safety', () => {
  function setupTitleTarget(): FakeExecution {
    const page = makePage({ metaTitle: 'About Us', title: 'About Us' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetUrl: 'https://rajhanstea.com/page/about-us/',
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us' },
          after: { metaTitle: 'About Us' },
        }),
      ],
    });
    execStore.push(execution);
    return execution;
  }

  it('a redirect to an external origin is a mismatch, never verified, even with a matching title', async () => {
    const execution = setupTitleTarget();
    mockFetchUrl.mockResolvedValue(
      fetchOk({ finalUrl: 'https://evil.example.com/page/about-us/', finalStatus: 200, html: '<html></html>' }),
    );
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].status).toBe('mismatch');
    expect(result.verification.targets[0].mismatchFields).toEqual(['cross_origin_redirect']);
    // Never parse/trust content from the wrong origin.
    expect(mockParseHtml).not.toHaveBeenCalled();
  });

  it('a same-origin redirect to a DIFFERENT Rajhans page is a mismatch, never verified', async () => {
    const execution = setupTitleTarget();
    mockFetchUrl.mockResolvedValue(
      fetchOk({ finalUrl: 'https://rajhanstea.com/page/some-other-page/', finalStatus: 200, html: '<html></html>' }),
    );
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].mismatchFields).toEqual(['redirected_to_different_page']);
    expect(mockParseHtml).not.toHaveBeenCalled();
  });

  it('a redirect that only differs by trailing slash on the SAME page still verifies normally', async () => {
    const execution = setupTitleTarget();
    mockFetchUrl.mockResolvedValue(
      fetchOk({ finalUrl: 'https://rajhanstea.com/page/about-us', finalStatus: 200, html: '<html></html>' }),
    );
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
  });

  it('no redirect at all (finalUrl === targetUrl) verifies normally', async () => {
    const execution = setupTitleTarget();
    mockFetchUrl.mockResolvedValue(
      fetchOk({ finalUrl: 'https://rajhanstea.com/page/about-us/', finalStatus: 200, html: '<html></html>' }),
    );
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
  });
});

// -----------------------------------------------------------------------------
// Executed-field presence must be determined by property ownership
// (`!== undefined`), never by truthiness — an explicitly-cleared empty string
// is a valid executed value and must still be compared, not skipped.
// -----------------------------------------------------------------------------
describe('verifyExecution — empty-string executed values are not treated as absent', () => {
  it('an executed metaTitle of "" is still compared (not skipped as falsy)', async () => {
    const page = makePage({ metaTitle: '', title: 'About Us' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: '' },
          after: { metaTitle: '' },
        }),
      ],
    });
    execStore.push(execution);
    // Frontend renders `${metaTitle || title} — Rajhans Tea`, so an empty
    // metaTitle correctly falls back to the page title when rendered.
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.targets[0].matches.title).toBe(true);
    expect(result.verification.targets[0].expected.renderedTitle).toBe('About Us — Rajhans Tea');
    expect(result.verification.status).toBe('verified');
  });

  it('an executed metaDescription of "" is still compared (not skipped as falsy)', async () => {
    const page = makePage({ metaDescription: '' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaDescription: '' },
          after: { metaDescription: '' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: null, metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.targets[0].matches.metaDescription).toBe(true);
    expect(result.verification.status).toBe('verified');
  });

  it('a drift check still fires when the live value changed away from an executed empty string', async () => {
    const page = makePage({ metaTitle: 'Someone Added A Title' }); // live differs from the '' the execution wrote
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: '' },
          after: { metaTitle: '' },
        }),
      ],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — rendered content comparison', () => {
  it('a rendered title mismatch is reported', async () => {
    const page = makePage({ metaTitle: 'About Us', title: 'About Us' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: 'About Us' }, after: { metaTitle: 'About Us' } })],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: 'Wrong Title — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].matches.title).toBe(false);
    expect(result.verification.targets[0].mismatchFields).toContain('title');
  });

  it('a rendered metaDescription mismatch is reported', async () => {
    const page = makePage({ metaDescription: 'About our tea company.' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaDescription: 'About our tea company.' },
          after: { metaDescription: 'About our tea company.' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: null, metaDescription: 'Something totally different.' });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets[0].matches.metaDescription).toBe(false);
    expect(result.verification.targets[0].mismatchFields).toContain('metaDescription');
  });

  it('a null parser description compares correctly against an empty Page description', async () => {
    const page = makePage({ metaDescription: '' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaDescription: '' },
          after: { metaDescription: '' },
        }),
      ],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: null, metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.targets[0].matches.metaDescription).toBe(true);
    expect(result.verification.status).toBe('verified');
  });

  it('only compares fields that were actually executed — an unrelated field can never cause a mismatch', async () => {
    // Only metaTitle was executed; Page.metaDescription is something the parser
    // would disagree with, but since metaDescription was never proposed, it
    // must never be compared or affect the outcome.
    const page = makePage({ metaTitle: 'About Us', title: 'About Us', metaDescription: 'Unrelated live description.' });
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: 'About Us' }, after: { metaTitle: 'About Us' } })],
    });
    execStore.push(execution);
    mockParseHtml.mockReturnValue({ title: 'About Us — Rajhans Tea', metaDescription: 'Something the parser saw that nobody asked about.' });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
    expect(result.verification.targets[0].matches.metaDescription).toBeUndefined();
    expect(result.verification.targets[0].expected.metaDescription).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — multi-target aggregate status', () => {
  it('every target verified => overall verified', async () => {
    const pageA = makePage({ slug: 'a', metaTitle: 'A' });
    const pageB = makePage({ slug: 'b', metaTitle: 'B' });
    pageStore.push(pageA, pageB);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/a/', targetDocumentId: pageA._id, proposed: { metaTitle: 'A' }, after: { metaTitle: 'A' } }),
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/b/', targetDocumentId: pageB._id, proposed: { metaTitle: 'B' }, after: { metaTitle: 'B' } }),
      ],
    });
    execStore.push(execution);
    mockFetchUrl.mockImplementation(async (url: string) =>
      fetchOk({ requestedUrl: url, finalUrl: url }),
    );
    mockParseHtml
      .mockReturnValueOnce({ title: 'A — Rajhans Tea', metaDescription: null })
      .mockReturnValueOnce({ title: 'B — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('verified');
    expect(result.verification.targets.map((t) => t.status)).toEqual(['verified', 'verified']);
  });

  it('one fetch_failed and the rest verified => overall fetch_failed', async () => {
    const pageA = makePage({ slug: 'a', metaTitle: 'A' });
    const pageB = makePage({ slug: 'b', metaTitle: 'B' });
    pageStore.push(pageA, pageB);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/a/', targetDocumentId: pageA._id, proposed: { metaTitle: 'A' }, after: { metaTitle: 'A' } }),
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/b/', targetDocumentId: pageB._id, proposed: { metaTitle: 'B' }, after: { metaTitle: 'B' } }),
      ],
    });
    execStore.push(execution);
    mockFetchUrl
      .mockResolvedValueOnce(
        fetchOk({ requestedUrl: 'https://rajhanstea.com/page/a/', finalUrl: 'https://rajhanstea.com/page/a/', finalStatus: 200, html: '<html></html>' }),
      )
      .mockResolvedValueOnce(fetchOk({ finalStatus: 500, html: null, transient: true, error: 'HTTP 500' }));
    mockParseHtml.mockReturnValueOnce({ title: 'A — Rajhans Tea', metaDescription: null });

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('fetch_failed');
    expect(result.verification.targets.map((t) => t.status)).toEqual(['verified', 'fetch_failed']);
  });

  it('one mismatch and one fetch_failed => overall mismatch (mismatch outranks fetch_failed)', async () => {
    const pageA = makePage({ slug: 'a', metaTitle: 'A' });
    const pageB = makePage({ slug: 'b', metaTitle: 'B' });
    pageStore.push(pageA, pageB);
    const execution = makeExecution({
      targets: [
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/a/', targetDocumentId: pageA._id, proposed: { metaTitle: 'A' }, after: { metaTitle: 'A' } }),
        makeExecutedTarget({ targetUrl: 'https://rajhanstea.com/page/b/', targetDocumentId: pageB._id, proposed: { metaTitle: 'B' }, after: { metaTitle: 'B' } }),
      ],
    });
    execStore.push(execution);
    mockFetchUrl
      .mockResolvedValueOnce(
        fetchOk({ requestedUrl: 'https://rajhanstea.com/page/a/', finalUrl: 'https://rajhanstea.com/page/a/', finalStatus: 200, html: '<html></html>' }),
      )
      .mockResolvedValueOnce(fetchOk({ finalStatus: 500, html: null, transient: true, error: 'HTTP 500' }));
    mockParseHtml.mockReturnValueOnce({ title: 'Wrong Title — Rajhans Tea', metaDescription: null }); // mismatch for target A

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verification.status).toBe('mismatch');
    expect(result.verification.targets.map((t) => t.status)).toEqual(['mismatch', 'fetch_failed']);
  });
});

// -----------------------------------------------------------------------------
describe('verifyExecution — repeated attempts + immutability + audit identity', () => {
  it('allows repeated verification attempts for the same execution, keeping separate immutable records', async () => {
    const page = makePage();
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: page.metaTitle }, after: { metaTitle: page.metaTitle } })],
    });
    execStore.push(execution);

    const first = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    await new Promise((r) => setTimeout(r, 2)); // ensure a distinct verifiedAt for a deterministic newest-first sort
    const second = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(String(first.verification._id)).not.toBe(String(second.verification._id));
    const history = await listVerificationsForExecution(String(execution._id));
    expect(history).toHaveLength(2);
    // Newest first.
    expect(String(history![0]._id)).toBe(String(second.verification._id));
    expect(String(history![1]._id)).toBe(String(first.verification._id));
  });

  it('records the correct executionId/recommendationId/draftId and the passed-in verifierUserId (never spoofable from within the service)', async () => {
    const page = makePage();
    pageStore.push(page);
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: page.metaTitle }, after: { metaTitle: page.metaTitle } })],
    });
    execStore.push(execution);

    const result = await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.verification.executionId)).toBe(String(execution._id));
    expect(String(result.verification.recommendationId)).toBe(String(execution.recommendationId));
    expect(String(result.verification.draftId)).toBe(String(execution.draftId));
    expect(String(result.verification.verifierUserId)).toBe(verifierUserId);
  });

  it('never mutates the Page document', async () => {
    const page = makePage({ metaTitle: 'About Us' });
    pageStore.push(page);
    const before = { ...page };
    const execution = makeExecution({
      targets: [makeExecutedTarget({ targetDocumentId: page._id, proposed: { metaTitle: 'About Us' }, after: { metaTitle: 'About Us' } })],
    });
    execStore.push(execution);

    await verifyExecution({ executionId: String(execution._id), verifierUserId });
    expect(pageStore[0]).toEqual(before);
  });
});


// -----------------------------------------------------------------------------
// Phase 5.4 publication gate
// -----------------------------------------------------------------------------
describe('verifyExecution — prerender publication gate', () => {
  it('blocks verification while a new execution publication is pending', async () => {
    const execution = makeExecution();
    execStore.push(execution);

    publicationStore.push({
      executionId: execution._id,
      status: 'pending',
    });

    const result = await verifyExecution({
      executionId: String(execution._id),
      verifierUserId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('unsupported_state');
      expect(result.message).toContain('pending');
    }

    expect(mockFetchUrl).not.toHaveBeenCalled();
    expect(verStore).toHaveLength(0);
  });

  it('allows verification once the execution publication is published', async () => {
    const page = makePage({
      metaTitle: 'About Us',
      title: 'About Us',
    });
    pageStore.push(page);

    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us' },
          after: {
            metaTitle: 'About Us',
            metaDescription: 'About our tea company.',
          },
        }),
      ],
    });
    execStore.push(execution);

    publicationStore.push({
      executionId: execution._id,
      status: 'published',
    });

    mockParseHtml.mockReturnValue({
      title: 'About Us — Rajhans Tea',
      metaDescription: 'About our tea company.',
    });

    const result = await verifyExecution({
      executionId: String(execution._id),
      verifierUserId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('verified');
    }
  });

  it('preserves verification behaviour for historical executions with no publication record', async () => {
    const page = makePage({
      metaTitle: 'About Us',
      title: 'About Us',
    });
    pageStore.push(page);

    const execution = makeExecution({
      targets: [
        makeExecutedTarget({
          targetDocumentId: page._id,
          proposed: { metaTitle: 'About Us' },
          after: {
            metaTitle: 'About Us',
            metaDescription: 'About our tea company.',
          },
        }),
      ],
    });
    execStore.push(execution);

    mockParseHtml.mockReturnValue({
      title: 'About Us — Rajhans Tea',
      metaDescription: 'About our tea company.',
    });

    const result = await verifyExecution({
      executionId: String(execution._id),
      verifierUserId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verification.status).toBe('verified');
    }
  });
});
