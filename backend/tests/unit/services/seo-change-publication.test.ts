import mongoose from 'mongoose';

const mockInit = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockFindById = jest.fn();
const mockFindOne = jest.fn();

jest.mock(
  '../../../src/modules/seo/models/seo-change-publication.model',
  () => ({
    SeoChangePublication: {
      init: mockInit,
      findOneAndUpdate: mockFindOneAndUpdate,
      findById: mockFindById,
      findOne: mockFindOne,
    },
  }),
);

const mockExecutionFindById = jest.fn();

jest.mock(
  '../../../src/modules/seo/models/seo-change-execution.model',
  () => ({
    SeoChangeExecution: {
      findById: mockExecutionFindById,
    },
  }),
);

const mockVerificationFindOne = jest.fn();

jest.mock(
  '../../../src/modules/seo/models/seo-change-verification.model',
  () => ({
    SeoChangeVerification: {
      findOne: mockVerificationFindOne,
    },
  }),
);

import {
  beginPublicationRedeploy,
  claimNextPendingPublication,
  markPublicationPublished,
  markPublicationFailed,
  MAX_REDEPLOY_ATTEMPTS,
  recordPublicationVerification,
  retryFailedPublication,
} from '../../../src/modules/seo/services/change-publication.service';

function queryResult(value: unknown) {
  return {
    exec: jest.fn(async () => value),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInit.mockResolvedValue(undefined);
});

describe('Phase 5.4 publication queue', () => {
  it('atomically claims only a pending publication', async () => {
    const publication = {
      _id: new mongoose.Types.ObjectId(),
      status: 'building',
    };

    mockFindOneAndUpdate.mockReturnValue(
      queryResult(publication),
    );

    const result = await claimNextPendingPublication();

    expect(result).toBe(publication);
    expect(mockInit).toHaveBeenCalledTimes(1);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { status: 'pending' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'building',
        }),
        $inc: {
          attemptCount: 1,
        },
      }),
      {
        sort: { requestedAt: 1 },
        new: true,
      },
    );
  });

  it('returns null when the queue is empty', async () => {
    mockFindOneAndUpdate.mockReturnValue(queryResult(null));

    await expect(
      claimNextPendingPublication(),
    ).resolves.toBeNull();
  });

  it('publishes only a record currently in building state', async () => {
    const id = new mongoose.Types.ObjectId();
    const publication = {
      _id: id,
      status: 'published',
    };

    mockFindOneAndUpdate.mockReturnValue(
      queryResult(publication),
    );

    const result = await markPublicationPublished({
      publicationId: String(id),
      frontendImage: 'frontend:test',
      frontendSourceRef: 'abc1234',
    });

    expect(result.ok).toBe(true);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.any(mongoose.Types.ObjectId),
        status: 'building',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'published',
          frontendImage: 'frontend:test',
          frontendSourceRef: 'abc1234',
        }),
      }),
      { new: true },
    );
  });

  it('marks only a building publication as failed', async () => {
    const id = new mongoose.Types.ObjectId();

    mockFindOneAndUpdate.mockReturnValue(
      queryResult({
        _id: id,
        status: 'failed',
      }),
    );

    const result = await markPublicationFailed({
      publicationId: String(id),
      errorMessage: 'build failed',
    });

    expect(result.ok).toBe(true);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.any(mongoose.Types.ObjectId),
        status: 'building',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          errorMessage: 'build failed',
        }),
      }),
      { new: true },
    );
  });

  it('records verification only against a published publication', async () => {
    const publicationId = new mongoose.Types.ObjectId();
    const verificationId = new mongoose.Types.ObjectId();

    mockFindOneAndUpdate.mockReturnValue(
      queryResult({
        _id: publicationId,
        status: 'published',
      }),
    );

    const result = await recordPublicationVerification({
      publicationId: String(publicationId),
      verificationId: String(verificationId),
      verificationStatus: 'verified',
    });

    expect(result.ok).toBe(true);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: expect.any(mongoose.Types.ObjectId),
        status: 'published',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          verificationId:
            expect.any(mongoose.Types.ObjectId),
          verificationStatus: 'verified',
        }),
      }),
      { new: true },
    );
  });

  it('fails closed on malformed ids before any Mongo mutation', async () => {
    const result = await markPublicationPublished({
      publicationId: 'not-an-id',
      frontendImage: 'frontend:test',
      frontendSourceRef: 'abc',
    });

    expect(result.ok).toBe(false);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('retryFailedPublication', () => {
  const publicationId = new mongoose.Types.ObjectId();
  const executionId = new mongoose.Types.ObjectId();

  const failedDoc = {
    _id: publicationId,
    status: 'failed',
    executionId,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    failedAt: new Date('2026-01-01T00:05:00Z'),
    errorMessage: 'homepage returned HTTP 000',
    attemptCount: 1,
  };

  it('A: requeues a failed publication to pending, preserving the failure as retry history', async () => {
    mockFindOne.mockReturnValue(queryResult(failedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockFindOneAndUpdate.mockReturnValue(
      queryResult({ _id: publicationId, status: 'pending' }),
    );

    const result = await retryFailedPublication(String(publicationId));

    expect(result.ok).toBe(true);

    expect(mockFindOne).toHaveBeenCalledWith({
      _id: expect.any(mongoose.Types.ObjectId),
      status: 'failed',
    });

    expect(mockExecutionFindById).toHaveBeenCalledWith(executionId);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(mongoose.Types.ObjectId), status: 'failed' },
      expect.objectContaining({
        $set: {
          status: 'pending',
          startedAt: null,
          failedAt: null,
          errorMessage: null,
        },
        $push: {
          retryHistory: expect.objectContaining({
            status: 'failed',
            failedAt: failedDoc.failedAt,
            errorMessage: failedDoc.errorMessage,
            attemptCount: failedDoc.attemptCount,
          }),
        },
      }),
      { new: true },
    );
  });

  it('B: rejects retry for a published publication', async () => {
    // The atomic filter (status: 'failed') simply finds nothing for a
    // published record — matching every other mutator's guarded-lookup style.
    mockFindOne.mockReturnValue(queryResult(null));

    const result = await retryFailedPublication(String(publicationId));

    expect(result.ok).toBe(false);
    expect(mockExecutionFindById).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('C: rejects retry for a pending publication', async () => {
    mockFindOne.mockReturnValue(queryResult(null));

    const result = await retryFailedPublication(String(publicationId));

    expect(result.ok).toBe(false);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('D: rejects retry for a building publication', async () => {
    mockFindOne.mockReturnValue(queryResult(null));

    const result = await retryFailedPublication(String(publicationId));

    expect(result.ok).toBe(false);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('E: rejects retry for a missing publication id (and invalid ids fail closed before any Mongo call)', async () => {
    const result = await retryFailedPublication('not-an-id');

    expect(result.ok).toBe(false);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('F: rejects retry when the associated execution is missing or not succeeded', async () => {
    mockFindOne.mockReturnValue(queryResult(failedDoc));
    mockExecutionFindById.mockReturnValue(queryResult(null));

    const result = await retryFailedPublication(String(publicationId));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('execution_invalid');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('G: never creates or mutates a SeoChangeExecution — only reads it', async () => {
    mockFindOne.mockReturnValue(queryResult(failedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'pending' }));

    await retryFailedPublication(String(publicationId));

    // The execution model mock exposes ONLY findById (a read) — retry has no
    // way to create or update an execution even by accident.
    expect(mockExecutionFindById).toHaveBeenCalledTimes(1);
  });

  it('H: the update touches only publication lifecycle/failure fields — never Product content', async () => {
    mockFindOne.mockReturnValue(queryResult(failedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'pending' }));

    await retryFailedPublication(String(publicationId));

    const [, updateArg] = mockFindOneAndUpdate.mock.calls[0];
    expect(Object.keys(updateArg.$set).sort()).toEqual(
      ['errorMessage', 'failedAt', 'startedAt', 'status'].sort(),
    );
  });
});

function sortResult(value: unknown) {
  return { sort: jest.fn(() => ({ exec: jest.fn(async () => value) })) };
}

describe('beginPublicationRedeploy', () => {
  const publicationId = new mongoose.Types.ObjectId();
  const executionId = new mongoose.Types.ObjectId();
  const verificationId = new mongoose.Types.ObjectId();

  const publishedDoc = {
    _id: publicationId,
    status: 'published',
    executionId,
    frontendImage: 'rajhansteaprod/rajhans-tea-frontend:seo-pub-old',
    frontendSourceRef: 'abc1234',
    redeployAttemptCount: 0,
  };

  const mismatchedVerification = { _id: verificationId, executionId, status: 'mismatch', verifiedAt: new Date('2026-01-01T00:00:00Z') };
  const verifiedVerification = { _id: verificationId, executionId, status: 'verified', verifiedAt: new Date('2026-01-01T00:00:00Z') };

  it('A: eligible when published + execution succeeded + latest verification is mismatch/fetch_failed + under the cap', async () => {
    mockFindOne.mockReturnValue(queryResult(publishedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(mismatchedVerification));
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'building', redeployAttemptCount: 1 }));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'deadbeef'.repeat(5) });

    expect(result.ok).toBe(true);
    // The atomic filter is status-only (matching every other mutator in this
    // file) — it must NOT require redeployAttemptCount to equal a specific
    // value, since a legacy document predating this field entirely has no
    // such key to match against (see the "legacy document" test below).
    const [filterArg] = mockFindOneAndUpdate.mock.calls[0];
    expect(filterArg).toEqual({ _id: expect.any(mongoose.Types.ObjectId), status: 'published' });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(mongoose.Types.ObjectId), status: 'published' }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'building' }),
        $inc: { redeployAttemptCount: 1 },
        $push: {
          redeployHistory: expect.objectContaining({
            sourceRevision: 'deadbeef'.repeat(5),
            previousFrontendImage: publishedDoc.frontendImage,
            previousFrontendSourceRef: publishedDoc.frontendSourceRef,
            previousVerificationId: verificationId,
            previousVerificationStatus: 'mismatch',
          }),
        },
      }),
      { new: true },
    );
  });

  it('B: not eligible when publication status is not published', async () => {
    mockFindOne.mockReturnValue(queryResult(null)); // atomic filter status:'published' finds nothing for e.g. a 'failed' record

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_published');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('C: not eligible when the associated execution is missing or not succeeded', async () => {
    mockFindOne.mockReturnValue(queryResult(publishedDoc));
    mockExecutionFindById.mockReturnValue(queryResult(null));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('execution_invalid');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('D: not eligible when no mismatched verification exists (the latest verification is "verified")', async () => {
    mockFindOne.mockReturnValue(queryResult(publishedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(verifiedVerification));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_mismatched_verification');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('E: not eligible when no verification exists at all for this execution', async () => {
    mockFindOne.mockReturnValue(queryResult(publishedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(null));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_mismatched_verification');
  });

  it('F: rejects a further attempt once redeployAttemptCount reaches the bound — no loops/unlimited retries', async () => {
    mockFindOne.mockReturnValue(queryResult({ ...publishedDoc, redeployAttemptCount: MAX_REDEPLOY_ATTEMPTS }));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('redeploy_limit_reached');
    expect(mockExecutionFindById).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('G: fails closed on an invalid publication id before any Mongo call', async () => {
    const result = await beginPublicationRedeploy({ publicationId: 'not-an-object-id', sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_id');
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('J (legacy record): a published publication document with NO redeployAttemptCount/redeployHistory field at all is still eligible', async () => {
    // Mirrors a real publication row persisted before this field existed —
    // the raw stored document has no such key, not merely a value of 0.
    const legacyDoc = {
      _id: publicationId,
      status: 'published',
      executionId,
      frontendImage: 'rajhansteaprod/rajhans-tea-frontend:seo-pub-legacy',
      frontendSourceRef: 'legacy123',
      // no redeployAttemptCount, no redeployHistory
    };
    mockFindOne.mockReturnValue(queryResult(legacyDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(mismatchedVerification));
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'building', redeployAttemptCount: 1 }));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(true);
    // The atomic filter never required redeployAttemptCount to equal
    // anything, so a missing field on the legacy document never blocks it.
    const [filterArg] = mockFindOneAndUpdate.mock.calls[0];
    expect(filterArg).toEqual({ _id: expect.any(mongoose.Types.ObjectId), status: 'published' });
  });

  it('K (legacy record): attemptCount is initialized/incremented correctly via $inc even when the field was previously absent', async () => {
    const legacyDoc = { _id: publicationId, status: 'published', executionId };
    mockFindOne.mockReturnValue(queryResult(legacyDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(mismatchedVerification));
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'building', redeployAttemptCount: 1 }));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(true);
    // $inc on a missing field starts it at 0 and increments to 1 — Mongo's
    // own documented $inc behavior, asserted here as the contract this
    // function relies on.
    const [, updateArg] = mockFindOneAndUpdate.mock.calls[0];
    expect(updateArg.$inc).toEqual({ redeployAttemptCount: 1 });
    if (result.ok) expect(result.publication.redeployAttemptCount).toBe(1);
  });

  it('L: duplicate/concurrent redeploy cannot proceed once status has already left "published" — the atomic filter finds nothing for a second attempt', async () => {
    mockFindOne.mockReturnValue(queryResult(publishedDoc));
    mockExecutionFindById.mockReturnValue(queryResult({ _id: executionId, status: 'succeeded' }));
    mockVerificationFindOne.mockReturnValue(sortResult(mismatchedVerification));
    // Simulates a concurrent caller having already flipped the row to
    // 'building' between the read above and this atomic update — the
    // same race-safety guarantee every other mutator in this file relies on.
    mockFindOneAndUpdate.mockReturnValue(queryResult(null));

    const result = await beginPublicationRedeploy({ publicationId: String(publicationId), sourceRevision: 'x'.repeat(40) });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_published');
  });

  it('H: never creates a second SeoChangePublication/SeoChangeExecution — the mocked models here expose no create() at all', () => {
    // Structural guarantee, not a runtime assertion: the jest.mock factories
    // for SeoChangePublication/SeoChangeExecution above only expose
    // find/findOne/findOneAndUpdate/findById — there is no `create` to call,
    // so beginPublicationRedeploy (and everything it calls) cannot construct
    // a new publication, execution, or Blog document even by accident.
    expect((require('../../../src/modules/seo/models/seo-change-publication.model').SeoChangePublication as Record<string, unknown>).create).toBeUndefined();
    expect((require('../../../src/modules/seo/models/seo-change-execution.model').SeoChangeExecution as Record<string, unknown>).create).toBeUndefined();
  });

  it('I: after beginPublicationRedeploy transitions a record to building, the existing markPublicationPublished/markPublicationFailed still work unchanged', async () => {
    // Regression guard: the whole design relies on reusing these two
    // functions as-is (they already require status:'building') rather than
    // adding new publish/fail logic.
    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'published' }));
    const publishedResult = await markPublicationPublished({ publicationId: String(publicationId), frontendImage: 'img:new', frontendSourceRef: 'def5678' });
    expect(publishedResult.ok).toBe(true);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'building' }),
      expect.anything(),
      { new: true },
    );

    mockFindOneAndUpdate.mockReturnValue(queryResult({ _id: publicationId, status: 'failed' }));
    const failedResult = await markPublicationFailed({ publicationId: String(publicationId), errorMessage: 'homepage smoke check failed' });
    expect(failedResult.ok).toBe(true);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'building' }),
      expect.anything(),
      { new: true },
    );
  });
});
