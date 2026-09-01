// =============================================================================
// UNIT TESTS — SEO Phase 5.1 human review layer (service layer)
// Mocks the SeoRecommendation model the same way market-recommendation.test.ts
// does (a plain in-memory `store` array of fake docs), so no real DB is needed.
// =============================================================================

import mongoose from 'mongoose';
import { DetectedIssue, PageObservation } from '../../../src/modules/seo/seo.types';

interface FakeDoc {
  _id: mongoose.Types.ObjectId;
  fingerprint: string;
  recommendationId: string;
  status: 'open' | 'resolved';
  source: string;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_changes';
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedBy: mongoose.Types.ObjectId | null;
  affectedUrls: string[];
  resolvedRunId: mongoose.Types.ObjectId | null;
  lastSeenRunId: mongoose.Types.ObjectId | null;
  firstSeenRunId: mongoose.Types.ObjectId | null;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  score: number;
  evidence: Record<string, unknown>;
  demandBonus: number;
  demandImpressions: number;
  save: jest.Mock;
}

let store: FakeDoc[] = [];

function makeDoc(fields: Partial<FakeDoc> = {}): FakeDoc {
  const doc: FakeDoc = {
    _id: new mongoose.Types.ObjectId(),
    fingerprint: '',
    recommendationId: '',
    status: 'open',
    source: 'audit',
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null,
    affectedUrls: [],
    resolvedRunId: null,
    lastSeenRunId: null,
    firstSeenRunId: null,
    priority: 'low',
    impact: 'low',
    score: 0,
    evidence: {},
    demandBonus: 0,
    demandImpressions: 0,
    save: jest.fn(async function (this: FakeDoc) {
      return this;
    }),
    ...fields,
  };
  return doc;
}

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findOne: jest.fn((query: { _id?: unknown; fingerprint?: string; status?: string }) => ({
      exec: async () =>
        store.find((d) => {
          if (query._id !== undefined && String(d._id) !== String(query._id)) return false;
          if (query.fingerprint !== undefined && d.fingerprint !== query.fingerprint) return false;
          if (query.status !== undefined && d.status !== query.status) return false;
          return true;
        }) ?? null,
    })),
    find: jest.fn((query: { status?: string; source?: string }) => ({
      exec: async () =>
        store.filter(
          (d) => (!query.status || d.status === query.status) && (!query.source || d.source === query.source),
        ),
    })),
    create: jest.fn(async (fields: Partial<FakeDoc>) => {
      const doc = makeDoc(fields);
      store.push(doc);
      return doc;
    }),
  },
}));

import {
  updateRecommendationReview,
  toView,
  generateAndPersistRecommendations,
} from '../../../src/modules/seo/services/recommendation.service';

const reviewerId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  store = [];
});

// -----------------------------------------------------------------------------
describe('updateRecommendationReview — identity + safety', () => {
  it('reviews by the persisted Mongo _id, not recommendationId', async () => {
    const rec = makeDoc({ recommendationId: 'shared-reco-id', fingerprint: 'fp-1' });
    store.push(rec);
    // A second doc happens to share the same recommendationId (fingerprint
    // discriminators can collide on the human-readable id) — must not be touched.
    const decoy = makeDoc({ recommendationId: 'shared-reco-id', fingerprint: 'fp-2' });
    store.push(decoy);

    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'approved',
      reviewedBy: reviewerId,
    });

    expect(result).toBe(rec);
    expect(rec.reviewStatus).toBe('approved');
    expect(decoy.reviewStatus).toBe('pending');
  });

  it('returns null (never throws) for a malformed Mongo id', async () => {
    await expect(
      updateRecommendationReview({ id: 'not-an-object-id', reviewStatus: 'approved', reviewedBy: reviewerId }),
    ).resolves.toBeNull();
  });

  it('returns null for an id that does not exist', async () => {
    const result = await updateRecommendationReview({
      id: new mongoose.Types.ObjectId().toString(),
      reviewStatus: 'approved',
      reviewedBy: reviewerId,
    });
    expect(result).toBeNull();
  });

  it('a resolved recommendation cannot be reviewed', async () => {
    const rec = makeDoc({ status: 'resolved' });
    store.push(rec);
    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'approved',
      reviewedBy: reviewerId,
    });
    expect(result).toBeNull();
    expect(rec.reviewStatus).toBe('pending'); // untouched
  });
});

// -----------------------------------------------------------------------------
describe('updateRecommendationReview — approved/rejected/needs_changes', () => {
  it('approved: sets reviewedAt/reviewedBy from the authenticated user, note optional', async () => {
    const rec = makeDoc();
    store.push(rec);
    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'approved',
      reviewedBy: reviewerId,
    });
    expect(result!.reviewStatus).toBe('approved');
    expect(result!.reviewNote).toBeNull();
    expect(result!.reviewedAt).toBeInstanceOf(Date);
    expect(String(result!.reviewedBy)).toBe(reviewerId);
  });

  it('rejected: persists the review note and reviewer', async () => {
    const rec = makeDoc();
    store.push(rec);
    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'rejected',
      reviewNote: '  Not worth doing right now.  ',
      reviewedBy: reviewerId,
    });
    expect(result!.reviewStatus).toBe('rejected');
    expect(result!.reviewNote).toBe('Not worth doing right now.'); // trimmed
    expect(result!.reviewedAt).toBeInstanceOf(Date);
    expect(String(result!.reviewedBy)).toBe(reviewerId);
  });

  it('needs_changes: persists the review note and reviewer', async () => {
    const rec = makeDoc();
    store.push(rec);
    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'needs_changes',
      reviewNote: 'Fix the suggested URL first.',
      reviewedBy: reviewerId,
    });
    expect(result!.reviewStatus).toBe('needs_changes');
    expect(result!.reviewNote).toBe('Fix the suggested URL first.');
  });
});

// -----------------------------------------------------------------------------
describe('updateRecommendationReview — pending reset', () => {
  it('resets reviewStatus/reviewNote/reviewedAt/reviewedBy back to their defaults', async () => {
    const rec = makeDoc({
      reviewStatus: 'rejected',
      reviewNote: 'was rejected',
      reviewedAt: new Date(),
      reviewedBy: new mongoose.Types.ObjectId(),
    });
    store.push(rec);

    const result = await updateRecommendationReview({
      id: String(rec._id),
      reviewStatus: 'pending',
      reviewedBy: reviewerId, // ignored for a pending reset
    });

    expect(result!.reviewStatus).toBe('pending');
    expect(result!.reviewNote).toBeNull();
    expect(result!.reviewedAt).toBeNull();
    expect(result!.reviewedBy).toBeNull();
  });
});

// -----------------------------------------------------------------------------
describe('toView() — exposes the review fields + safe string id', () => {
  it('defaults reviewStatus to pending for older documents missing the field', async () => {
    const rec = makeDoc({ reviewStatus: undefined as unknown as 'pending' });
    const view = toView(rec as never, String(rec.lastSeenRunId));
    expect(view.id).toBe(String(rec._id));
    expect(typeof view.id).toBe('string');
    expect(view.reviewStatus).toBe('pending');
    expect(view.reviewNote).toBeNull();
    expect(view.reviewedAt).toBeNull();
    expect(view.reviewedBy).toBeNull();
  });

  it('stringifies reviewedBy when present', () => {
    const reviewer = new mongoose.Types.ObjectId();
    const rec = makeDoc({ reviewStatus: 'approved', reviewedBy: reviewer, reviewedAt: new Date() });
    const view = toView(rec as never, String(rec.lastSeenRunId));
    expect(view.reviewedBy).toBe(String(reviewer));
  });
});

// -----------------------------------------------------------------------------
// Regression coverage for the audit-resolver source-isolation fix: an audit
// reconciliation pass must resolve ONLY source:'audit' recommendations, never
// source:'market' or source:'gsc' ones — those have independent lifecycles.
// -----------------------------------------------------------------------------
describe('generateAndPersistRecommendations — audit resolver is source-scoped', () => {
  const baseUrl = 'https://rajhanstea.com';
  const emptyOpts = {
    isBaseline: false,
    allowResolution: true,
    baseUrl,
    detected: [] as DetectedIssue[],
    observations: [] as PageObservation[],
    linkResolutions: new Map(),
  };

  it('resolves a stale open AUDIT recommendation not regenerated this run', async () => {
    const auditRec = makeDoc({ source: 'audit', status: 'open', fingerprint: 'audit-fp' });
    store.push(auditRec);

    await generateAndPersistRecommendations({ runId: new mongoose.Types.ObjectId(), ...emptyOpts });

    expect(auditRec.status).toBe('resolved');
  });

  it('never resolves an open MARKET recommendation', async () => {
    const marketRec = makeDoc({ source: 'market', status: 'open', fingerprint: 'market-fp' });
    store.push(marketRec);

    await generateAndPersistRecommendations({ runId: new mongoose.Types.ObjectId(), ...emptyOpts });

    expect(marketRec.status).toBe('open');
  });

  it('never resolves an open GSC recommendation', async () => {
    const gscRec = makeDoc({ source: 'gsc', status: 'open', fingerprint: 'gsc-fp' });
    store.push(gscRec);

    await generateAndPersistRecommendations({ runId: new mongoose.Types.ObjectId(), ...emptyOpts });

    expect(gscRec.status).toBe('open');
  });

  it('leaves market and GSC recs open while resolving the audit rec in the same run', async () => {
    const auditRec = makeDoc({ source: 'audit', status: 'open', fingerprint: 'audit-fp-2' });
    const marketRec = makeDoc({ source: 'market', status: 'open', fingerprint: 'market-fp-2' });
    const gscRec = makeDoc({ source: 'gsc', status: 'open', fingerprint: 'gsc-fp-2' });
    store.push(auditRec, marketRec, gscRec);

    await generateAndPersistRecommendations({ runId: new mongoose.Types.ObjectId(), ...emptyOpts });

    expect(auditRec.status).toBe('resolved');
    expect(marketRec.status).toBe('open');
    expect(gscRec.status).toBe('open');
  });
});
