// =============================================================================
// UNIT TESTS — SEO Phase 5.4B change-completion controller (request validation)
// POST /admin/seo/change-executions/:executionId/complete,
// GET  /admin/seo/change-executions/:executionId/completions and
// GET  /admin/seo/change-completions/:completionId are admin-only
// (authenticate + authorize('admin') already gate this at the router — see
// seo-change-completion-rollback.routes.test.ts for that wiring); these tests
// exercise only the controller's own validation, status-code mapping and its
// use of req.user — never the completion logic itself (covered by
// seo-change-completion.test.ts).
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-completion.service', () => ({
  completeExecution: jest.fn(),
  listCompletionsForExecution: jest.fn(),
  getCompletionById: jest.fn(),
  toCompletionView: jest.fn((doc: { id?: string }) => doc),
}));

import {
  completeChangeExecution,
  getChangeExecutionCompletions,
  getChangeCompletion,
} from '../../../src/modules/seo/seo.controller';
import {
  completeExecution,
  listCompletionsForExecution,
  getCompletionById,
} from '../../../src/modules/seo/services/change-completion.service';

const mockComplete = completeExecution as jest.Mock;
const mockListCompletions = listCompletionsForExecution as jest.Mock;
const mockGetCompletion = getCompletionById as jest.Mock;

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
const validExecutionId = new mongoose.Types.ObjectId().toString();
const validCompletionId = new mongoose.Types.ObjectId().toString();

function makeReq(overrides: { params?: object; body?: object } = {}): Request {
  return {
    params: { executionId: validExecutionId },
    body: {},
    user: { userId, role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('completeChangeExecution', () => {
  it('returns 400 for an invalid execution id (from the service, not the controller)', async () => {
    mockComplete.mockResolvedValue({ ok: false, error: 'invalid_id', message: 'Invalid execution id' });
    const res = makeRes();
    await completeChangeExecution(makeReq({ params: { executionId: 'not-an-object-id' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the execution does not exist', async () => {
    mockComplete.mockResolvedValue({ ok: false, error: 'not_found', message: 'Execution not found' });
    const res = makeRes();
    await completeChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['unsupported_state', 'Only a successful execution can be completed'],
    ['not_verified', 'This execution has no successful verification and cannot be completed'],
    ['already_completed', 'This execution has already been completed'],
  ])('returns 409 for a "%s" eligibility failure', async (error, message) => {
    mockComplete.mockResolvedValue({ ok: false, error, message });
    const res = makeRes();
    await completeChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { success: boolean; message: string }).success).toBe(false);
    expect((res.body as { message: string }).message).toBe(message);
  });

  it('returns 201 with the completion view on success', async () => {
    const completion = { id: 'comp-1', status: 'completed' };
    mockComplete.mockResolvedValue({ ok: true, completion });
    const res = makeRes();
    await completeChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect((res.body as { data: unknown }).data).toEqual(completion);
  });

  it('uses req.user.userId as the completing admin and ignores every spoofed body field', async () => {
    mockComplete.mockResolvedValue({ ok: true, completion: { id: 'comp-1' } });
    const req = makeReq({
      body: {
        completedByUserId: 'someone-else',
        recommendationId: new mongoose.Types.ObjectId().toString(),
        draftId: new mongoose.Types.ObjectId().toString(),
        verificationId: new mongoose.Types.ObjectId().toString(),
        status: 'completed',
        metaTitle: 'Hacked Title',
      },
    });
    await completeChangeExecution(req, makeRes());

    // The service is called with exactly two arguments' worth of data: the URL
    // execution id and the authenticated user — nothing from the body.
    expect(mockComplete).toHaveBeenCalledWith({ executionId: validExecutionId, completedByUserId: userId });
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});

describe('getChangeExecutionCompletions', () => {
  it('rejects an invalid execution id', async () => {
    const res = makeRes();
    await getChangeExecutionCompletions(makeReq({ params: { executionId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockListCompletions).not.toHaveBeenCalled();
  });

  it('returns completion history as an array', async () => {
    mockListCompletions.mockResolvedValue([{ id: 'c1' }]);
    const res = makeRes();
    await getChangeExecutionCompletions(makeReq(), res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual([{ id: 'c1' }]);
  });

  it('returns an empty array when the service returns null (never throws)', async () => {
    mockListCompletions.mockResolvedValue(null);
    const res = makeRes();
    await getChangeExecutionCompletions(makeReq(), res);
    expect((res.body as { data: unknown }).data).toEqual([]);
  });
});

describe('getChangeCompletion', () => {
  it('rejects an invalid completion id', async () => {
    const res = makeRes();
    await getChangeCompletion(makeReq({ params: { completionId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockGetCompletion).not.toHaveBeenCalled();
  });

  it('returns 404 when the completion does not exist', async () => {
    mockGetCompletion.mockResolvedValue(null);
    const res = makeRes();
    await getChangeCompletion(makeReq({ params: { completionId: validCompletionId } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the completion on success', async () => {
    const completion = { id: validCompletionId, status: 'completed' };
    mockGetCompletion.mockResolvedValue(completion);
    const res = makeRes();
    await getChangeCompletion(makeReq({ params: { completionId: validCompletionId } }), res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(completion);
  });
});
