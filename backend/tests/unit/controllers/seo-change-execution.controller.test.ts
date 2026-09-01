// =============================================================================
// UNIT TESTS — SEO Phase 5.3 change-execution controller (request validation)
// POST /admin/seo/change-drafts/:draftId/execute and
// GET /admin/seo/change-drafts/:draftId/executions and
// GET /admin/seo/change-executions/:executionId are admin-only (authenticate +
// authorize('admin') already gate this at the router, same as Phase 5.1/5.2);
// these tests exercise only the controller's own validation, status-code
// mapping, and its use of req.user — never the eligibility logic itself
// (covered by seo-change-execution.test.ts).
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-execution.service', () => ({
  executeApprovedChangeDraft: jest.fn(),
  listExecutionsForDraft: jest.fn(),
  getExecutionById: jest.fn(),
  toExecutionView: jest.fn((doc: { id?: string }) => doc),
}));

import { executeChangeDraft, getChangeDraftExecutions, getChangeExecution } from '../../../src/modules/seo/seo.controller';
import {
  executeApprovedChangeDraft,
  listExecutionsForDraft,
  getExecutionById,
} from '../../../src/modules/seo/services/change-execution.service';

const mockExecute = executeApprovedChangeDraft as jest.Mock;
const mockListExecutions = listExecutionsForDraft as jest.Mock;
const mockGetExecution = getExecutionById as jest.Mock;

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
const validDraftId = new mongoose.Types.ObjectId().toString();
const validExecutionId = new mongoose.Types.ObjectId().toString();

function makeReq(overrides: { params?: object; body?: object } = {}): Request {
  return {
    params: { draftId: validDraftId },
    body: {},
    user: { userId, role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('executeChangeDraft', () => {
  it('returns 400 for an invalid draft id (from the service, not the controller)', async () => {
    mockExecute.mockResolvedValue({ ok: false, error: 'invalid_id', message: 'Invalid draft id' });
    const req = makeReq({ params: { draftId: 'not-an-object-id' } });
    const res = makeRes();
    await executeChangeDraft(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the draft does not exist', async () => {
    mockExecute.mockResolvedValue({ ok: false, error: 'not_found', message: 'Draft not found' });
    const res = makeRes();
    await executeChangeDraft(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the recommendation no longer exists', async () => {
    mockExecute.mockResolvedValue({ ok: false, error: 'recommendation_not_found', message: 'Recommendation not found' });
    const res = makeRes();
    await executeChangeDraft(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the target CMS page does not exist', async () => {
    mockExecute.mockResolvedValue({ ok: false, error: 'target_not_found', message: 'No CMS page found' });
    const res = makeRes();
    await executeChangeDraft(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it.each(['not_draft', 'not_open', 'not_approved', 'fingerprint_mismatch', 'invalid_draft', 'unsupported_kind', 'unsupported_field', 'unsupported_target', 'stale', 'already_executed'])(
    'returns 409 for eligibility/domain conflict "%s"',
    async (error) => {
      mockExecute.mockResolvedValue({ ok: false, error, message: 'rejected' });
      const res = makeRes();
      await executeChangeDraft(makeReq(), res);
      expect(res.statusCode).toBe(409);
    },
  );

  it('returns 201 with the execution view on success', async () => {
    const execution = { id: 'exec-1', status: 'succeeded' };
    mockExecute.mockResolvedValue({ ok: true, execution });
    const req = makeReq();
    const res = makeRes();
    await executeChangeDraft(req, res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { data: unknown }).data).toEqual(execution);
  });

  it('uses req.user.userId as the executor and ignores any spoofed body fields', async () => {
    mockExecute.mockResolvedValue({ ok: true, execution: { id: 'exec-1' } });
    const req = makeReq({
      body: { executorUserId: 'someone-else', proposed: { metaTitle: 'Hacked Title' }, targetUrl: 'https://evil.example.com/' },
    });
    const res = makeRes();
    await executeChangeDraft(req, res);
    expect(mockExecute).toHaveBeenCalledWith({ draftId: validDraftId, executorUserId: userId });
    expect(mockExecute).not.toHaveBeenCalledWith(expect.objectContaining({ proposed: expect.anything() }));
  });
});

describe('getChangeDraftExecutions', () => {
  it('rejects an invalid draft id', async () => {
    const req = makeReq({ params: { draftId: 'nope' } });
    const res = makeRes();
    await getChangeDraftExecutions(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockListExecutions).not.toHaveBeenCalled();
  });

  it('returns the execution history newest first on success', async () => {
    mockListExecutions.mockResolvedValue([{ id: 'e2' }, { id: 'e1' }]);
    const req = makeReq({ params: { draftId: validDraftId } });
    const res = makeRes();
    await getChangeDraftExecutions(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual([{ id: 'e2' }, { id: 'e1' }]);
  });

  it('returns an empty array when the service returns null (never throws)', async () => {
    mockListExecutions.mockResolvedValue(null);
    const req = makeReq({ params: { draftId: validDraftId } });
    const res = makeRes();
    await getChangeDraftExecutions(req, res);
    expect((res.body as { data: unknown }).data).toEqual([]);
  });
});

describe('getChangeExecution', () => {
  it('rejects an invalid execution id', async () => {
    const req = makeReq({ params: { executionId: 'nope' } });
    const res = makeRes();
    await getChangeExecution(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGetExecution).not.toHaveBeenCalled();
  });

  it('returns 404 when the execution does not exist', async () => {
    mockGetExecution.mockResolvedValue(null);
    const req = makeReq({ params: { executionId: validExecutionId } });
    const res = makeRes();
    await getChangeExecution(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the execution on success', async () => {
    const execution = { id: validExecutionId, status: 'succeeded' };
    mockGetExecution.mockResolvedValue(execution);
    const req = makeReq({ params: { executionId: validExecutionId } });
    const res = makeRes();
    await getChangeExecution(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(execution);
  });
});
