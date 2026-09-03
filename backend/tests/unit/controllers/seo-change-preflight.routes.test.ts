// =============================================================================
// ROUTE-LEVEL TESTS — Phase 5.5's preflight route is actually wired behind the
// SAME authenticate + authorize('admin') chain as every other SEO admin route.
// Mounts the REAL seo.routes router behind a minimal Express app with the real
// auth/rbac middleware and error handler, so an unauthenticated or non-admin
// request is genuinely rejected by the router rather than merely assumed. Only
// the preflight SERVICE and the User model (for the isBanned lookup inside
// authenticate) are mocked, so no real DB or network is touched.
// =============================================================================

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../../../src/config';

jest.mock('../../../src/modules/auth/models/user.model', () => ({
  User: {
    findById: jest.fn(() => ({ lean: () => Promise.resolve({ isBanned: false }) })),
  },
}));

const evaluatedResult = {
  executable: true,
  riskLevel: 'low',
  blockers: [],
  warnings: [],
  checks: [{ code: 'draft_valid', status: 'pass', message: 'ok' }],
  changedFields: [],
  evaluatedAt: new Date('2026-01-01T00:00:00.000Z'),
  evaluatorVersion: '5.5.0-preflight-v1',
};

jest.mock('../../../src/modules/seo/services/change-execution-preflight.service', () => ({
  evaluateExecutionPreflight: jest.fn(async () => ({
    result: evaluatedResult,
    prepared: [],
    draft: { _id: 'draft-1' },
    recommendation: { _id: 'rec-1' },
  })),
  toPreflightView: jest.fn((result: unknown) => result),
}));

import seoRoutes from '../../../src/modules/seo/seo.routes';
import { errorHandler } from '../../../src/middleware/error-handler.middleware';
import { evaluateExecutionPreflight } from '../../../src/modules/seo/services/change-execution-preflight.service';

const mockEvaluate = evaluateExecutionPreflight as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', seoRoutes);
  app.use(errorHandler);
  return app;
}

function signToken(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: '15m' });
}

const app = buildApp();
const validDraftId = new mongoose.Types.ObjectId().toString();
const preflightPath = `/api/v1/admin/seo/change-drafts/${validDraftId}/preflight`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SEO Phase 5.5 preflight route — admin auth is actually enforced', () => {
  it('rejects an unauthenticated preflight request with 401', async () => {
    const res = await request(app).post(preflightPath);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('rejects an authenticated non-admin preflight request', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer' });
    const res = await request(app).post(preflightPath).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('allows an authenticated admin and returns the evaluation', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app).post(preflightPath).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.executable).toBe(true);
    expect(res.body.data.evaluatorVersion).toBe('5.5.0-preflight-v1');
  });

  it('derives the draft id from the URL and ignores a spoofed request body entirely', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    await request(app)
      .post(preflightPath)
      .set('Authorization', `Bearer ${token}`)
      .send({
        draftId: new mongoose.Types.ObjectId().toString(),
        executable: true,
        riskLevel: 'low',
        blockers: [],
        metaTitle: 'Hacked Title',
        userId: 'someone-else',
      });
    expect(mockEvaluate).toHaveBeenCalledWith({ draftId: validDraftId });
  });

  it('is not exposed as a GET route — preflight is an explicit POST action only', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app).get(preflightPath).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });
});
