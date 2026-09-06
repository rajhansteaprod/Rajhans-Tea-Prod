import mongoose from 'mongoose';
import {
  SeoChangePublication,
  ISeoChangePublicationDoc,
} from '../models/seo-change-publication.model';

export const PUBLICATION_WORKER_VERSION = '5.4a-publication-worker-v1';

export type PublicationMutationResult =
  | { ok: true; publication: ISeoChangePublicationDoc }
  | {
      ok: false;
      error: 'invalid_id' | 'not_found_or_state';
      message: string;
    };

/**
 * Atomically claims the oldest pending publication.
 *
 * findOneAndUpdate is the concurrency boundary: even if two host workers start
 * simultaneously, only one can transition a given record pending -> building.
 */
export async function claimNextPendingPublication():
  Promise<ISeoChangePublicationDoc | null> {
  await SeoChangePublication.init();

  return SeoChangePublication.findOneAndUpdate(
    { status: 'pending' },
    {
      $set: {
        status: 'building',
        startedAt: new Date(),
        failedAt: null,
        errorMessage: null,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      sort: { requestedAt: 1 },
      new: true,
    },
  ).exec();
}

export async function markPublicationPublished(opts: {
  publicationId: string;
  frontendImage: string;
  frontendSourceRef: string;
}): Promise<PublicationMutationResult> {
  if (!mongoose.isValidObjectId(opts.publicationId)) {
    return {
      ok: false,
      error: 'invalid_id',
      message: 'Invalid publication id',
    };
  }

  const publication = await SeoChangePublication.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(opts.publicationId),
      status: 'building',
    },
    {
      $set: {
        status: 'published',
        publishedAt: new Date(),
        failedAt: null,
        frontendImage: opts.frontendImage,
        frontendSourceRef: opts.frontendSourceRef,
        errorMessage: null,
      },
    },
    { new: true },
  ).exec();

  if (!publication) {
    return {
      ok: false,
      error: 'not_found_or_state',
      message: 'Publication was not found in building state',
    };
  }

  return { ok: true, publication };
}

export async function markPublicationFailed(opts: {
  publicationId: string;
  errorMessage: string;
}): Promise<PublicationMutationResult> {
  if (!mongoose.isValidObjectId(opts.publicationId)) {
    return {
      ok: false,
      error: 'invalid_id',
      message: 'Invalid publication id',
    };
  }

  const publication = await SeoChangePublication.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(opts.publicationId),
      status: 'building',
    },
    {
      $set: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: opts.errorMessage.slice(0, 2000),
      },
    },
    { new: true },
  ).exec();

  if (!publication) {
    return {
      ok: false,
      error: 'not_found_or_state',
      message: 'Publication was not found in building state',
    };
  }

  return { ok: true, publication };
}

export async function recordPublicationVerification(opts: {
  publicationId: string;
  verificationId: string | null;
  verificationStatus: string;
}): Promise<PublicationMutationResult> {
  if (!mongoose.isValidObjectId(opts.publicationId)) {
    return {
      ok: false,
      error: 'invalid_id',
      message: 'Invalid publication id',
    };
  }

  if (
    opts.verificationId !== null &&
    !mongoose.isValidObjectId(opts.verificationId)
  ) {
    return {
      ok: false,
      error: 'invalid_id',
      message: 'Invalid verification id',
    };
  }

  const publication = await SeoChangePublication.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(opts.publicationId),
      status: 'published',
    },
    {
      $set: {
        verificationId:
          opts.verificationId === null
            ? null
            : new mongoose.Types.ObjectId(opts.verificationId),
        verificationStatus: opts.verificationStatus,
      },
    },
    { new: true },
  ).exec();

  if (!publication) {
    return {
      ok: false,
      error: 'not_found_or_state',
      message: 'Publication was not found in published state',
    };
  }

  return { ok: true, publication };
}

export async function getPublicationById(
  publicationId: string,
): Promise<ISeoChangePublicationDoc | null> {
  if (!mongoose.isValidObjectId(publicationId)) return null;
  return SeoChangePublication.findById(publicationId).exec();
}
