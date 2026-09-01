// =============================================================================
// UNIT TESTS — SEO Phase 5.4A change-verification controller (request validation)
// POST /admin/seo/change-executions/:executionId/verify and
// GET /admin/seo/change-executions/:executionId/verifications and
// GET /admin/seo/change-verifications/:verificationId are admin-only
// (authenticate + authorize('admin') already gate this at the router — see
// seo-change-verification.routes.test.ts for that wiring); these tests
// exercise only the controller's own validation, status-code mapping, and its
// use of req.user — never the verification logic itself (covered by
// seo-change-verification.test.ts).
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-verification.service', () => ({
  verifyExecution: jest.fn(),
  listVerificationsForExecution: jest.fn(),
  getVerificationById: jest.fn(),
  toVerificationView: jest.fn((doc: { id?: string }) => doc),
}));

import {
  verifyChangeExecution,
  getChangeExecutionVerifications,
  getChangeVerification,
} from '../../../src/modules/seo/seo.controller';
import {
  verifyExecution,
  listVerificationsForExecution,
  getVerificationById,
} from '../../../src/modules/seo/services/change-verification.service';

const mockVerify = verifyExecution as jest.Mock;
const mockListVerifications = listVerificationsForExecution as jest.Mock;
const mockGetVerification = getVerificationById as jest.Mock;

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
const validVerificationId = new mongoose.Types.ObjectId().toString();

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

describe('verifyChangeExecution', () => {
  it('returns 400 for an invalid execution id (from the service, not the controller)', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'invalid_id', message: 'Invalid execution id' });
    const req = makeReq({ params: { executionId: 'not-an-object-id' } });
    const res = makeRes();
    await verifyChangeExecution(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the execution does not exist', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'not_found', message: 'Execution not found' });
    const res = makeRes();
    await verifyChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 for an unsupported/corrupt execution state', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'unsupported_state', message: 'Only a successful execution can be verified' });
    const res = makeRes();
    await verifyChangeExecution(makeReq(), res);
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 with the verification view on a "verified" outcome — a successful API response, not an error', async () => {
    const verification = { id: 'ver-1', status: 'verified' };
    mockVerify.mockResolvedValue({ ok: true, verification });
    const req = makeReq();
    const res = makeRes();
    await verifyChangeExecution(req, res);
    expect(res.statusCode).toBe(201);
    expect((res.body as { success: boolean; data: unknown }).success).toBe(true);
    expect((res.body as { data: unknown }).data).toEqual(verification);
  });

  it.each(['mismatch', 'fetch_failed'])(
    'returns 201 with a "%s" verification outcome — never a server error just because the live page disagreed',
    async (status) => {
      const verification = { id: 'ver-1', status };
      mockVerify.mockResolvedValue({ ok: true, verification });
      const res = makeRes();
      await verifyChangeExecution(makeReq(), res);
      expect(res.statusCode).toBe(201);
      expect((res.body as { success: boolean }).success).toBe(true);
      expect((res.body as { data: { status: string } }).data.status).toBe(status);
    },
  );

  it('uses req.user.userId as the verifier and ignores any spoofed body fields', async () => {
    mockVerify.mockResolvedValue({ ok: true, verification: { id: 'ver-1' } });
    const req = makeReq({
      body: { verifierUserId: 'someone-else', expected: { renderedTitle: 'Hacked Title' } },
    });
    const res = makeRes();
    await verifyChangeExecution(req, res);
    expect(mockVerify).toHaveBeenCalledWith({ executionId: validExecutionId, verifierUserId: userId });
    expect(mockVerify).not.toHaveBeenCalledWith(expect.objectContaining({ expected: expect.anything() }));
  });
});

describe('getChangeExecutionVerifications', () => {
  it('rejects an invalid execution id', async () => {
    const req = makeReq({ params: { executionId: 'nope' } });
    const res = makeRes();
    await getChangeExecutionVerifications(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockListVerifications).not.toHaveBeenCalled();
  });

  it('returns the verification history newest first on success', async () => {
    mockListVerifications.mockResolvedValue([{ id: 'v2' }, { id: 'v1' }]);
    const req = makeReq({ params: { executionId: validExecutionId } });
    const res = makeRes();
    await getChangeExecutionVerifications(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual([{ id: 'v2' }, { id: 'v1' }]);
  });

  it('returns an empty array when the service returns null (never throws)', async () => {
    mockListVerifications.mockResolvedValue(null);
    const req = makeReq({ params: { executionId: validExecutionId } });
    const res = makeRes();
    await getChangeExecutionVerifications(req, res);
    expect((res.body as { data: unknown }).data).toEqual([]);
  });
});

describe('getChangeVerification', () => {
  it('rejects an invalid verification id', async () => {
    const req = makeReq({ params: { verificationId: 'nope' } });
    const res = makeRes();
    await getChangeVerification(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGetVerification).not.toHaveBeenCalled();
  });

  it('returns 404 when the verification does not exist', async () => {
    mockGetVerification.mockResolvedValue(null);
    const req = makeReq({ params: { verificationId: validVerificationId } });
    const res = makeRes();
    await getChangeVerification(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the verification on success', async () => {
    const verification = { id: validVerificationId, status: 'verified' };
    mockGetVerification.mockResolvedValue(verification);
    const req = makeReq({ params: { verificationId: validVerificationId } });
    const res = makeRes();
    await getChangeVerification(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(verification);
  });
});
