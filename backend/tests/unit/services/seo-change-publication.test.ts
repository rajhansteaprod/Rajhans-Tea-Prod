import mongoose from 'mongoose';

const mockInit = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockFindById = jest.fn();

jest.mock(
  '../../../src/modules/seo/models/seo-change-publication.model',
  () => ({
    SeoChangePublication: {
      init: mockInit,
      findOneAndUpdate: mockFindOneAndUpdate,
      findById: mockFindById,
    },
  }),
);

import {
  claimNextPendingPublication,
  markPublicationPublished,
  markPublicationFailed,
  recordPublicationVerification,
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
