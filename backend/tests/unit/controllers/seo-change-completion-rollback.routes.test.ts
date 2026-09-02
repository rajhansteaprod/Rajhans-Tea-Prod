// =============================================================================
// ROUTE-LEVEL TESTS — Phase 5.4B completion and rollback routes are actually
// wired behind the SAME authenticate + authorize('admin') chain as every other
// SEO admin route. Unlike the plain controller tests (which call controller
// functions directly and can't exercise middleware at all), this mounts the
// REAL seo.routes router behind a minimal Express app with the real auth/rbac
// middleware and the real error handler, so an unauthenticated or non-admin
// request is genuinely rejected by the router — not merely assumed. It also
// pins the security property that matters most for rollback: a POST body can
// never supply the user, the ids, or any SEO value. Only the completion and
// rollback SERVICES and the User model (for the isBanned lookup inside
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

jest.mock('../../../src/modules/seo/services/change-completion.service', () => ({
  completeExecution: jest.fn(async () => ({ ok: true, completion: { id: 'comp-1', status: 'completed' } })),
  listCompletionsForExecution: jest.fn(async (id: string) => (mongoose.isValidObjectId(id) ? [{ id: 'comp-1' }] : null)),
  getCompletionById: jest.fn(async () => ({ id: 'comp-1', status: 'completed' })),
  toCompletionView: jest.fn((doc: unknown) => doc),
}));

jest.mock('../../../src/modules/seo/services/change-rollback.service', () => ({
  rollbackExecution: jest.fn(async () => ({ ok: true, rollback: { id: 'rb-1', status: 'succeeded', targets: [] } })),
  listRollbacksForExecution: jest.fn(async (id: string) => (mongoose.isValidObjectId(id) ? [{ id: 'rb-1' }] : null)),
  getRollbackById: jest.fn(async () => ({ id: 'rb-1', status: 'succeeded' })),
  toRollbackView: jest.fn((doc: unknown) => doc),
}));

import seoRoutes from '../../../src/modules/seo/seo.routes';
import { errorHandler } from '../../../src/middleware/error-handler.middleware';
import { completeExecution } from '../../../src/modules/seo/services/change-completion.service';
import { rollbackExecution } from '../../../src/modules/seo/services/change-rollback.service';

const mockComplete = completeExecution as jest.Mock;
const mockRollback = rollbackExecution as jest.Mock;

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Phase 5.4B completion routes — admin auth is actually enforced', () => {
  it('rejects an unauthenticated complete request (no Authorization header)', async () => {
    const res = await request(app).post(`/api/v1/admin/seo/change-executions/${validExecutionId}/complete`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('rejects a non-admin (authenticated) complete request', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('allows an authenticated admin complete request through to the controller', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('completed');
  });

  it('rejects an unauthenticated completion-history request', async () => {
    const res = await request(app).get(`/api/v1/admin/seo/change-executions/${validExecutionId}/completions`);
    expect(res.status).toBe(401);
  });

  it('returns completion history for an authenticated admin', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-executions/${validExecutionId}/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'comp-1' }]);
  });

  it('allows an authenticated admin to fetch a single completion by id', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-completions/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'comp-1', status: 'completed' });
  });

  it('rejects a non-admin completion-history request', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-executions/${validExecutionId}/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Phase 5.4B rollback routes — admin auth is actually enforced', () => {
  it('rejects an unauthenticated rollback request (no Authorization header)', async () => {
    const res = await request(app).post(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollback`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('rejects a non-admin (authenticated) rollback request', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'customer' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('allows an authenticated admin rollback request through to the controller', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('succeeded');
  });

  it('rejects an unauthenticated rollback-history request', async () => {
    const res = await request(app).get(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollbacks`);
    expect(res.status).toBe(401);
  });

  it('returns rollback history for an authenticated admin', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollbacks`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'rb-1' }]);
  });

  it('allows an authenticated admin to fetch a single rollback by id', async () => {
    const token = signToken({ userId: new mongoose.Types.ObjectId().toString(), role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/seo/change-rollbacks/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'rb-1', status: 'succeeded' });
  });
});

// -----------------------------------------------------------------------------
// The request body is never an input to either action: it cannot pick the user,
// the recommendation/draft/verification, or any SEO value.
// -----------------------------------------------------------------------------
describe('Phase 5.4B — the POST body can never spoof identity, targets or SEO values', () => {
  const adminUserId = new mongoose.Types.ObjectId().toString();
  const spoof = {
    completedByUserId: new mongoose.Types.ObjectId().toString(),
    rollbackUserId: new mongoose.Types.ObjectId().toString(),
    userId: new mongoose.Types.ObjectId().toString(),
    recommendationId: new mongoose.Types.ObjectId().toString(),
    draftId: new mongoose.Types.ObjectId().toString(),
    verificationId: new mongoose.Types.ObjectId().toString(),
    executionId: new mongoose.Types.ObjectId().toString(),
    targets: [{ targetUrl: 'https://evil.example.com/page/x/', restored: { metaTitle: 'Hacked' } }],
    metaTitle: 'Hacked Title',
    metaDescription: 'Hacked description.',
    status: 'completed',
  };

  it('completion uses the JWT user and the URL execution id only', async () => {
    const token = signToken({ userId: adminUserId, role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send(spoof);
    expect(res.status).toBe(201);
    expect(mockComplete).toHaveBeenCalledWith({ executionId: validExecutionId, completedByUserId: adminUserId });
  });

  it('rollback uses the JWT user and the URL execution id only', async () => {
    const token = signToken({ userId: adminUserId, role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollback`)
      .set('Authorization', `Bearer ${token}`)
      .send(spoof);
    expect(res.status).toBe(201);
    expect(mockRollback).toHaveBeenCalledWith({ executionId: validExecutionId, rollbackUserId: adminUserId });
  });

  it('an empty rollback body behaves identically to a spoofed one', async () => {
    const token = signToken({ userId: adminUserId, role: 'admin' });
    await request(app)
      .post(`/api/v1/admin/seo/change-executions/${validExecutionId}/rollback`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(mockRollback).toHaveBeenCalledWith({ executionId: validExecutionId, rollbackUserId: adminUserId });
  });
});
