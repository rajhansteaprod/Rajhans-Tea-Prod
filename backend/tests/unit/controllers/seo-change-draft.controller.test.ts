// =============================================================================
// UNIT TESTS — SEO Phase 5.2 change-draft controller (request validation)
// POST/GET /admin/seo/recommendations/:id/draft(s) and
// GET /admin/seo/change-drafts/:draftId are admin-only (authenticate +
// authorize('admin') already gate this at the router, same as Phase 5.1); these
// tests exercise only the controller's own validation and its use of req.user.
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-draft-generator.service', () => ({
  generateChangeDraft: jest.fn(),
  listChangeDrafts: jest.fn(),
  getChangeDraftById: jest.fn(),
  recommendationExists: jest.fn(),
  toChangeDraftView: jest.fn((doc: { id?: string; status?: string }) => doc),
}));

import {
  generateRecommendationDraft,
  getRecommendationDraftHistory,
  getChangeDraft,
} from '../../../src/modules/seo/seo.controller';
import {
  generateChangeDraft,
  listChangeDrafts,
  getChangeDraftById,
  recommendationExists,
} from '../../../src/modules/seo/services/change-draft-generator.service';

const mockGenerate = generateChangeDraft as jest.Mock;
const mockListDrafts = listChangeDrafts as jest.Mock;
const mockGetDraft = getChangeDraftById as jest.Mock;
const mockRecExists = recommendationExists as jest.Mock;

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

const userId = 'admin-user-id-123';
const validId = new mongoose.Types.ObjectId().toString();

function makeReq(overrides: { params?: object; body?: object } = {}): Request {
  return {
    params: { id: validId },
    body: {},
    user: { userId, role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateRecommendationDraft', () => {
  it('rejects an invalid recommendation id', async () => {
    const req = makeReq({ params: { id: 'not-an-object-id' } });
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns 404 when the recommendation does not exist', async () => {
    mockGenerate.mockResolvedValue({ ok: false, error: 'not_found', message: 'Recommendation not found' });
    const req = makeReq();
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when the recommendation is not open', async () => {
    mockGenerate.mockResolvedValue({ ok: false, error: 'not_open', message: 'Only an open recommendation can generate a draft' });
    const req = makeReq();
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 when the recommendation is not approved', async () => {
    mockGenerate.mockResolvedValue({ ok: false, error: 'not_approved', message: 'Only an approved recommendation can generate a draft' });
    const req = makeReq();
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 with the generated draft on success', async () => {
    const draft = { id: 'draft-1', status: 'draft' };
    mockGenerate.mockResolvedValue({ ok: true, draft });
    const req = makeReq();
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { data: unknown }).data).toEqual(draft);
  });

  it('uses req.user.userId as generatedBy and ignores body spoofing', async () => {
    mockGenerate.mockResolvedValue({ ok: true, draft: { id: 'draft-1' } });
    const req = makeReq({ body: { generatedBy: 'someone-else' } });
    const res = makeRes();
    await generateRecommendationDraft(req, res);
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ recommendationId: validId, generatedBy: userId }));
  });
});

describe('getRecommendationDraftHistory', () => {
  it('rejects an invalid recommendation id', async () => {
    const req = makeReq({ params: { id: 'nope' } });
    const res = makeRes();
    await getRecommendationDraftHistory(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockRecExists).not.toHaveBeenCalled();
  });

  it('returns 404 when the recommendation does not exist', async () => {
    mockRecExists.mockResolvedValue(false);
    const req = makeReq();
    const res = makeRes();
    await getRecommendationDraftHistory(req, res);
    expect(res.statusCode).toBe(404);
    expect(mockListDrafts).not.toHaveBeenCalled();
  });

  it('returns the draft history newest first on success', async () => {
    mockRecExists.mockResolvedValue(true);
    const drafts = [{ id: 'd2' }, { id: 'd1' }];
    mockListDrafts.mockResolvedValue(drafts);
    const req = makeReq();
    const res = makeRes();
    await getRecommendationDraftHistory(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(drafts);
  });
});

describe('getChangeDraft', () => {
  it('rejects an invalid draft id', async () => {
    const req = makeReq({ params: { draftId: 'nope' } });
    const res = makeRes();
    await getChangeDraft(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGetDraft).not.toHaveBeenCalled();
  });

  it('returns 404 when the draft does not exist', async () => {
    mockGetDraft.mockResolvedValue(null);
    const req = makeReq({ params: { draftId: validId } });
    const res = makeRes();
    await getChangeDraft(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the draft on success', async () => {
    const draft = { id: validId, status: 'draft' };
    mockGetDraft.mockResolvedValue(draft);
    const req = makeReq({ params: { draftId: validId } });
    const res = makeRes();
    await getChangeDraft(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(draft);
  });
});
