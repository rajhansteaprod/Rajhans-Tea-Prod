// =============================================================================
// UNIT TESTS — SEO Phase 5.5 preflight controller (request validation)
// POST /admin/seo/change-drafts/:draftId/preflight is admin-only (authenticate +
// authorize('admin') gate it at the router, exercised separately in
// seo-change-preflight.routes.test.ts). These tests cover only the controller's
// own validation, status-code mapping and the fact that NOTHING from the request
// body can influence the evaluation — never the evaluator's logic itself, which
// is covered by seo-change-execution-preflight.test.ts.
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-execution-preflight.service', () => ({
  evaluateExecutionPreflight: jest.fn(),
  toPreflightView: jest.fn((result: unknown) => result),
}));

import { preflightChangeDraft } from '../../../src/modules/seo/seo.controller';
import { evaluateExecutionPreflight } from '../../../src/modules/seo/services/change-execution-preflight.service';

const mockEvaluate = evaluateExecutionPreflight as jest.Mock;

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

function makeReq(overrides: { params?: object; body?: object } = {}): Request {
  return {
    params: { draftId: validDraftId },
    body: {},
    user: { userId, role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

function executableResult(overrides: Record<string, unknown> = {}) {
  return {
    executable: true,
    riskLevel: 'low',
    blockers: [],
    warnings: [],
    checks: [],
    changedFields: [],
    evaluatedAt: new Date(),
    evaluatorVersion: '5.5.0-preflight-v1',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('preflightChangeDraft', () => {
  it('returns 400 for a malformed draft id, without evaluating anything', async () => {
    const res = makeRes();
    await preflightChangeDraft(makeReq({ params: { draftId: 'not-an-object-id' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('returns 404 when the draft does not exist', async () => {
    mockEvaluate.mockResolvedValue({
      result: executableResult({ executable: false, blockers: [{ code: 'not_found', message: 'Draft not found' }] }),
      prepared: [],
      draft: null,
      recommendation: null,
    });
    const res = makeRes();
    await preflightChangeDraft(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with the preflight result for an executable draft', async () => {
    const result = executableResult();
    mockEvaluate.mockResolvedValue({ result, prepared: [], draft: { _id: validDraftId }, recommendation: {} });
    const res = makeRes();
    await preflightChangeDraft(makeReq(), res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toEqual(result);
  });

  it.each([
    'not_draft',
    'not_open',
    'not_approved',
    'fingerprint_mismatch',
    'invalid_draft',
    'unsupported_kind',
    'unsupported_field',
    'unsupported_target',
    'target_not_found',
    'stale',
    'already_executed',
    'no_effective_change',
    'malformed_value',
    'ambiguous_target',
  ])(
    'returns 200 with executable=false for the "%s" blocker — reporting blockers is this endpoint’s job, not an HTTP error',
    async (code) => {
      const result = executableResult({
        executable: false,
        riskLevel: 'high',
        blockers: [{ code, message: 'blocked' }],
      });
      mockEvaluate.mockResolvedValue({ result, prepared: [], draft: { _id: validDraftId }, recommendation: {} });
      const res = makeRes();
      await preflightChangeDraft(makeReq(), res);
      expect(res.statusCode ?? 200).toBe(200);
      expect((res.body as { data: { executable: boolean } }).data.executable).toBe(false);
    },
  );

  it('passes ONLY the URL draft id to the evaluator, ignoring every body field a caller might supply', async () => {
    mockEvaluate.mockResolvedValue({
      result: executableResult(),
      prepared: [],
      draft: { _id: validDraftId },
      recommendation: {},
    });
    const res = makeRes();
    await preflightChangeDraft(
      makeReq({
        body: {
          draftId: 'some-other-draft',
          executable: true,
          riskLevel: 'low',
          blockers: [],
          warnings: [],
          checks: [{ code: 'draft_valid', status: 'pass', message: 'spoofed' }],
          metaTitle: 'Hacked Title',
          metaDescription: 'Hacked description',
          targetUrl: 'https://evil.example.com/page/x/',
          recommendationId: 'someone-elses-recommendation',
          userId: 'someone-else',
          evaluatorVersion: '9.9.9',
        },
      }),
      res,
    );
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith({ draftId: validDraftId });
  });

  it('never passes a session — the advisory endpoint must not run inside a transaction', async () => {
    mockEvaluate.mockResolvedValue({
      result: executableResult(),
      prepared: [],
      draft: { _id: validDraftId },
      recommendation: {},
    });
    await preflightChangeDraft(makeReq(), makeRes());
    expect(mockEvaluate.mock.calls[0][0].session).toBeUndefined();
  });

  it('never returns the internal prepared documents to the client', async () => {
    mockEvaluate.mockResolvedValue({
      result: executableResult(),
      prepared: [{ targetUrl: 'https://rajhanstea.com/page/about-us/', page: { _id: 'secret' } }],
      draft: { _id: validDraftId },
      recommendation: {},
    });
    const res = makeRes();
    await preflightChangeDraft(makeReq(), res);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
