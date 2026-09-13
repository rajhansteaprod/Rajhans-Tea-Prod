// =============================================================================
// UNIT TESTS — read-only publication-by-execution controller (SEO Agent admin
// console). GET /admin/seo/change-executions/:executionId/publication is
// admin-only (authenticate + authorize('admin') gate this at the router, same
// as every other SEO route); these tests exercise only the controller's own
// request validation and response shaping — never a real DB, never secrets.
// =============================================================================

import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/services/change-publication.service', () => ({
  getPublicationByExecutionId: jest.fn(),
  toPublicationView: jest.fn((doc: { id: string }) => ({ id: doc.id, status: 'published' })),
}));

import { getExecutionPublication } from '../../../src/modules/seo/seo.controller';
import { getPublicationByExecutionId } from '../../../src/modules/seo/services/change-publication.service';

const mockGetPublication = getPublicationByExecutionId as jest.Mock;

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

const executionId = new mongoose.Types.ObjectId().toString();

function makeReq(overrides: { params?: object } = {}): Request {
  return {
    params: { executionId },
    user: { userId: 'admin-1', role: 'admin' },
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getExecutionPublication', () => {
  it('rejects an invalid execution id before any service call', async () => {
    const req = makeReq({ params: { executionId: 'not-an-object-id' } });
    const res = makeRes();
    await getExecutionPublication(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGetPublication).not.toHaveBeenCalled();
  });

  it('returns data: null (still 200) when no publication exists for this execution — a normal state for non-blog_create executions', async () => {
    mockGetPublication.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await getExecutionPublication(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: unknown }).data).toBeNull();
  });

  it('returns the publication view when one exists', async () => {
    mockGetPublication.mockResolvedValue({ id: 'pub-1' });
    const req = makeReq();
    const res = makeRes();
    await getExecutionPublication(req, res);
    expect(res.statusCode ?? 200).toBe(200);
    expect((res.body as { data: { id: string } }).data.id).toBe('pub-1');
  });

  it('never leaks anything beyond the execution id it was given to the lookup (no body fields trusted as input)', async () => {
    mockGetPublication.mockResolvedValue(null);
    const req = {
      params: { executionId },
      body: { executionId: 'some-other-id' },
      user: { userId: 'admin-1', role: 'admin' },
    } as unknown as Request;
    const res = makeRes();
    await getExecutionPublication(req, res);
    expect(mockGetPublication).toHaveBeenCalledWith(executionId);
  });

  it('the controller source never reads process.env directly — it only ever returns the document-derived view', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../../src/modules/seo/seo.controller.ts'), 'utf8');
    expect(src.includes('process.env')).toBe(false);
  });
});
