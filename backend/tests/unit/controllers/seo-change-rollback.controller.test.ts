// =============================================================================
// UNIT TESTS — SEO Phase 5.4B change-rollback controller (request validation)
// POST /admin/seo/change-executions/:executionId/rollback,
// GET  /admin/seo/change-executions/:executionId/rollbacks and
// GET  /admin/seo/change-rollbacks/:rollbackId are admin-only (authenticate +
// authorize('admin') already gate this at the router — see
// seo-change-completion-rollback.routes.test.ts for that wiring); these tests
// exercise only the controller's own validation, status-code mapping and its
// use of req.user — never the rollback logic itself (covered by
// seo-change-rollback.test.ts).
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-rollback.service', () => ({
  rollbackExecution: jest.fn(),
  listRollbacksForExecution: jest.fn(),
  getRollbackById: jest.fn(),
  toRollbackView: jest.fn((doc: { id?: string }) => doc),
}));

import {
  rollbackChangeExecution,
  getChangeExecutionRollbacks,
  getChangeRollback,
} from '../../../src/modules/seo/seo.controller';
import {
  rollbackExecution,
  listRollbacksForExecution,
  getRollbackById,
} from '../../../src/modules/seo/services/change-rollback.service';

const mockRollback = rollbackExecution as jest.Mock;
const mockListRollbacks = listRollbacksForExecution as jest.Mock;
const mockGetRollback = getRollbackById as jest.Mock;

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
const validRollbackId = new mongoose.Types.ObjectId().toString();

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

describe('rollbackChangeExecution', () => {
  it('returns 400 for an invalid execution id (from the service, not the controller)', async () => {
    mockRollback.mockResolvedValue({ ok: false, error: 'invalid_id', message: 'Invalid execution id' });
    const res = makeRes();
    await rollbackChangeExecution(makeReq({ params: { executionId: 'not-an-object-id' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it.each([
    ['not_found', 'Execution not found'],
    ['target_not_found', 'No CMS page found for https://rajhanstea.com/page/about-us/'],
  ])('returns 404 for a "%s" failure', async (error, message) => {
    mockRollback.mockResolvedValue({ ok: false, error, message });
    const res = makeRes();
    await rollbackChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['unsupported_state', 'Only a successful execution can be rolled back'],
    ['unsupported_target', 'The CMS page is no longer published'],
    ['stale', 'Live metaTitle has changed since this execution'],
    ['already_rolled_back', 'This execution has already been rolled back'],
  ])('returns 409 for a "%s" failure', async (error, message) => {
    mockRollback.mockResolvedValue({ ok: false, error, message });
    const res = makeRes();
    await rollbackChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { success: boolean }).success).toBe(false);
    expect((res.body as { message: string }).message).toBe(message);
  });

  it('returns 201 with the rollback view on success', async () => {
    const rollback = { id: 'rb-1', status: 'succeeded' };
    mockRollback.mockResolvedValue({ ok: true, rollback });
    const res = makeRes();
    await rollbackChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect((res.body as { data: unknown }).data).toEqual(rollback);
  });

  it('uses req.user.userId as the rollback user and ignores every spoofed body field', async () => {
    mockRollback.mockResolvedValue({ ok: true, rollback: { id: 'rb-1' } });
    const req = makeReq({
      body: {
        rollbackUserId: 'someone-else',
        recommendationId: new mongoose.Types.ObjectId().toString(),
        draftId: new mongoose.Types.ObjectId().toString(),
        targets: [{ targetUrl: 'https://evil.example.com/', restored: { metaTitle: 'Hacked' } }],
        metaTitle: 'Hacked Title',
        metaDescription: 'Hacked description.',
      },
    });
    await rollbackChangeExecution(req, makeRes());

    // Only the URL execution id and the authenticated user reach the service —
    // the restore values come from the immutable execution record alone.
    expect(mockRollback).toHaveBeenCalledWith({ executionId: validExecutionId, rollbackUserId: userId });
    expect(mockRollback).toHaveBeenCalledTimes(1);
  });
});

describe('getChangeExecutionRollbacks', () => {
  it('rejects an invalid execution id', async () => {
    const res = makeRes();
    await getChangeExecutionRollbacks(makeReq({ params: { executionId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockListRollbacks).not.toHaveBeenCalled();
  });

  it('returns rollback history as an array', async () => {
    mockListRollbacks.mockResolvedValue([{ id: 'rb1' }]);
    const res = makeRes();
    await getChangeExecutionRollbacks(makeReq(), res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual([{ id: 'rb1' }]);
  });

  it('returns an empty array when the service returns null (never throws)', async () => {
    mockListRollbacks.mockResolvedValue(null);
    const res = makeRes();
    await getChangeExecutionRollbacks(makeReq(), res);
    expect((res.body as { data: unknown }).data).toEqual([]);
  });
});

describe('getChangeRollback', () => {
  it('rejects an invalid rollback id', async () => {
    const res = makeRes();
    await getChangeRollback(makeReq({ params: { rollbackId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockGetRollback).not.toHaveBeenCalled();
  });

  it('returns 404 when the rollback does not exist', async () => {
    mockGetRollback.mockResolvedValue(null);
    const res = makeRes();
    await getChangeRollback(makeReq({ params: { rollbackId: validRollbackId } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the rollback on success', async () => {
    const rollback = { id: validRollbackId, status: 'succeeded' };
    mockGetRollback.mockResolvedValue(rollback);
    const res = makeRes();
    await getChangeRollback(makeReq({ params: { rollbackId: validRollbackId } }), res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(rollback);
  });
});
