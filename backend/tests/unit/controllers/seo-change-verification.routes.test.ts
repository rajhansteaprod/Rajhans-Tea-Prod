// =============================================================================
// ROUTE-LEVEL TESTS — Phase 5.4A verification routes are actually wired behind
// the SAME authenticate + authorize('admin') chain as every other SEO admin
// route. Unlike the plain controller tests (which call controller functions
// directly and can't exercise middleware at all), this mounts the REAL
// seo.routes router behind a minimal Express app with the real auth/rbac
// middleware and the real error handler, so an unauthenticated or non-admin
// request is genuinely rejected by the router — not merely assumed. Only the
// verification SERVICE and the User model (for the isBanned lookup inside
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

jest.mock('../../../src/modules/seo/services/change-verification.service', () => ({
  verifyExecution: jest.fn(async () => ({ ok: true, verification: { id: 'ver-1', status: 'verified', targets: [] } })),
  listVerificationsForExecution: jest.fn(async (id: string) =>
    mongoose.isValidObjectId(id) ? [{ id: 'v2' }, { id: 'v1' }] : null,
  ),
  getVerificationById: jest.fn(async () => ({ id: 'ver-1', status: 'verified' })),
  toVerificationView: jest.fn((doc: unknown) => doc),
}));

import seoRoutes from '../../../src/modules/seo/seo.routes';
import { errorHandler } from '../../../src/middleware/error-handler.middleware';

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
const validExecutionId = new mongoose.Types.ObjectId().toString();

describe('SEO Phase 5.4A verification routes — admin auth is actually enforced', () => {
  it('rejects an unauthenticated verify request (no Authorization header)', async () => {
    const res = await request(app).post(`/api/v1/admin/seo/change-executions/${validExecutionId}/verify`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a non-admin (authenticated) verify request', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('allows an authenticated admin verify request through to the controller', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/verify`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('verified');
  });

  it('rejects an unauthenticated verification-history request', async () => {
    const res = await request(app).get(`/api/v1/admin/seo/change-executions/${validExecutionId}/verifications`);
    expect(res.status).toBe(401);
  });

  it('returns verification history newest first for an authenticated admin', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-executions/${validExecutionId}/verifications`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'v2' }, { id: 'v1' }]);
  });

  it('allows an authenticated admin to fetch a single verification by id', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-verifications/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'ver-1', status: 'verified' });
  });
});
