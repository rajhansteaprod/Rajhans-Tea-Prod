// =============================================================================
// UNIT TESTS — SEO Phase 5.1 human review layer (controller validation)
// PATCH /admin/seo/recommendations/:id/review is admin-only (authenticate +
// authorize('admin') already gate this at the router); these tests exercise
// only the controller's own request validation and its use of req.user.
// =============================================================================

import { Request, Response } from 'express';

jest.mock('../../../src/modules/seo/services/recommendation.service', () => ({
  updateRecommendationReview: jest.fn(),
  toView: jest.fn((rec: { id: string; reviewStatus: string }) => ({ id: rec.id, reviewStatus: rec.reviewStatus })),
  getRecommendationsReport: jest.fn(),
}));

import { reviewRecommendation } from '../../../src/modules/seo/seo.controller';
import { updateRecommendationReview } from '../../../src/modules/seo/services/recommendation.service';

const mockUpdateRecommendationReview = updateRecommendationReview as jest.Mock;

function makeRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response['json'];
  return res as Response & { statusCode?: number; body?: unknown };
}

const reviewerId = 'reviewer-user-id-123';

function makeReq(overrides: { params?: object; body?: object } = {}): Request {
  return {
    params: { id: 'rec-1' },
    body: {},
    user: { userId: reviewerId, role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reviewRecommendation — validation', () => {
  it('rejects a missing reviewStatus', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('rejects an invalid reviewStatus value', async () => {
    const req = makeReq({ body: { reviewStatus: 'archived' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('rejected requires a non-empty reviewNote', async () => {
    const req = makeReq({ body: { reviewStatus: 'rejected' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('rejected with a whitespace-only reviewNote is treated as empty', async () => {
    const req = makeReq({ body: { reviewStatus: 'rejected', reviewNote: '   ' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('needs_changes requires a non-empty reviewNote', async () => {
    const req = makeReq({ body: { reviewStatus: 'needs_changes' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('rejects a non-string reviewNote', async () => {
    const req = makeReq({ body: { reviewStatus: 'approved', reviewNote: 123 as unknown as string } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('rejects a reviewNote over 5000 characters', async () => {
    const req = makeReq({ body: { reviewStatus: 'approved', reviewNote: 'x'.repeat(5001) } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdateRecommendationReview).not.toHaveBeenCalled();
  });

  it('approved does not require a reviewNote', async () => {
    mockUpdateRecommendationReview.mockResolvedValue({ id: 'rec-1', reviewStatus: 'approved', lastSeenRunId: 'run-1' });
    const req = makeReq({ body: { reviewStatus: 'approved' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect(mockUpdateRecommendationReview).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: 'approved', reviewNote: null }),
    );
  });

  it('pending (reset) does not require a reviewNote', async () => {
    mockUpdateRecommendationReview.mockResolvedValue({ id: 'rec-1', reviewStatus: 'pending', lastSeenRunId: 'run-1' });
    const req = makeReq({ body: { reviewStatus: 'pending' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect(mockUpdateRecommendationReview).toHaveBeenCalledWith(expect.objectContaining({ reviewStatus: 'pending' }));
  });
});

describe('reviewRecommendation — identity + authenticated reviewer', () => {
  it('reviews by the route id param, using the persisted Mongo _id', async () => {
    mockUpdateRecommendationReview.mockResolvedValue({ id: 'abc123', reviewStatus: 'approved', lastSeenRunId: 'run-1' });
    const req = makeReq({ params: { id: 'abc123' }, body: { reviewStatus: 'approved' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(mockUpdateRecommendationReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc123' }));
  });

  it('reviewedBy comes from the authenticated user (req.user.userId), not the request body', async () => {
    mockUpdateRecommendationReview.mockResolvedValue({ id: 'rec-1', reviewStatus: 'approved', lastSeenRunId: 'run-1' });
    const req = makeReq({ body: { reviewStatus: 'approved', reviewedBy: 'someone-else' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(mockUpdateRecommendationReview).toHaveBeenCalledWith(expect.objectContaining({ reviewedBy: reviewerId }));
  });
});

describe('reviewRecommendation — not-found handling', () => {
  it('returns 404 when the service reports no matching open recommendation (unknown id, invalid id, or already resolved)', async () => {
    mockUpdateRecommendationReview.mockResolvedValue(null);
    const req = makeReq({ body: { reviewStatus: 'approved' } });
    const res = makeRes();
    await reviewRecommendation(req, res);
    expect(res.statusCode).toBe(404);
  });
});
