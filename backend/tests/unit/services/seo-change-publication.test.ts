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

import {
  claimNextPendingPublication,
  markPublicationPublished,
  markPublicationFailed,
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
