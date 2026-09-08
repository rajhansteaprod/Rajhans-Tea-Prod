import mongoose from 'mongoose';
import {
  SeoChangePublication,
  ISeoChangePublicationDoc,
} from '../models/seo-change-publication.model';
import { SeoChangeExecution } from '../models/seo-change-execution.model';

export const PUBLICATION_WORKER_VERSION = '5.4a-publication-worker-v1';

export type PublicationMutationResult =
  | { ok: true; publication: ISeoChangePublicationDoc }
  | {
      ok: false;
      error: 'invalid_id' | 'not_found_or_state' | 'execution_invalid';
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

/**
 * Requeues a publication that reached terminal `failed` back to `pending`,
 * for the SAME execution — never a duplicate. `executionId` carries a
 * unique index on this model precisely so a second publication row for one
 * execution can never be created; retry therefore has to mean "reset this
 * record", not "make a new one". Only `failed` is accepted: `pending`,
 * `building` and `published` are all rejected, matching the atomic
 * status-guarded pattern every other mutator here already uses.
 *
 * Before resetting the live failure fields (failedAt/errorMessage) for a
 * clean next attempt, the prior failure is snapshotted into
 * `retryHistory` so that evidence isn't destroyed by the retry.
 *
 * Does not touch SeoChangeExecution or Product — it only re-validates that
 * the execution this publication belongs to still exists and is
 * `succeeded` (execution has no other status once persisted, but this
 * stays a real check rather than an assumption).
 */
export async function retryFailedPublication(
  publicationId: string,
): Promise<PublicationMutationResult> {
  if (!mongoose.isValidObjectId(publicationId)) {
    return {
      ok: false,
      error: 'invalid_id',
      message: 'Invalid publication id',
    };
  }

  const failedPublication = await SeoChangePublication.findOne({
    _id: new mongoose.Types.ObjectId(publicationId),
    status: 'failed',
  }).exec();

  if (!failedPublication) {
    return {
      ok: false,
      error: 'not_found_or_state',
      message: 'Publication was not found in failed state',
    };
  }

  const execution = await SeoChangeExecution.findById(
    failedPublication.executionId,
  ).exec();

  if (!execution || execution.status !== 'succeeded') {
    return {
      ok: false,
      error: 'execution_invalid',
      message: 'Associated execution is missing or not in a succeeded state',
    };
  }

  const publication = await SeoChangePublication.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(publicationId),
      status: 'failed',
    },
    {
      $set: {
        status: 'pending',
        startedAt: null,
        failedAt: null,
        errorMessage: null,
      },
      $push: {
        retryHistory: {
          status: 'failed',
          failedAt: failedPublication.failedAt,
          errorMessage: failedPublication.errorMessage,
          attemptCount: failedPublication.attemptCount,
          retriedAt: new Date(),
        },
      },
    },
    { new: true },
  ).exec();

  if (!publication) {
    return {
      ok: false,
      error: 'not_found_or_state',
      message: 'Publication was not found in failed state',
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
