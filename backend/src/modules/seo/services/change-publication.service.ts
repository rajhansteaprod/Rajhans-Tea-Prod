import mongoose from 'mongoose';
import {
  SeoChangePublication,
  ISeoChangePublicationDoc,
} from '../models/seo-change-publication.model';
import { SeoChangeExecution } from '../models/seo-change-execution.model';
import { SeoChangeVerification } from '../models/seo-change-verification.model';

export const PUBLICATION_WORKER_VERSION = '5.4a-publication-worker-v1';

/** Hard ceiling on redeploy attempts for one publication — never an unbounded/looping retry. */
export const MAX_REDEPLOY_ATTEMPTS = 3;

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

export type BeginRedeployError =
  | 'invalid_id'
  | 'not_found'
  | 'not_published'
  | 'execution_invalid'
  | 'no_mismatched_verification'
  | 'redeploy_limit_reached';

export type BeginRedeployResult =
  | { ok: true; publication: ISeoChangePublicationDoc }
  | { ok: false; error: BeginRedeployError; message: string };

/**
 * Narrowest safe recovery path for a publication that reached `published`
 * (the build/swap itself succeeded) but whose post-publish content
 * verification came back `mismatch`/`fetch_failed` — e.g. a stale prerender
 * manifest that didn't list a just-created blog slug. `markPublicationPublished`
 * and `markPublicationFailed` both require `building`, and `retryFailedPublication`
 * requires `failed`, so none of them can act on an already-`published` record;
 * this is the one function that transitions published -> building again, and
 * ONLY when every eligibility condition below holds. Reuses the SAME
 * execution/Blog document and the SAME publication row (the unique index on
 * `executionId` makes a second publication row for this execution impossible
 * by construction) — never creates a new execution, Blog, or publication.
 *
 * Eligibility (every condition required):
 *   - publication.status === 'published'
 *   - the associated execution still exists and is 'succeeded'
 *   - the NEWEST verification for that execution is mismatch/fetch_failed
 *     (a currently-'verified' execution has nothing to recover from)
 *   - redeployAttemptCount < MAX_REDEPLOY_ATTEMPTS (bounded — no loops)
 *
 * On success: status -> 'building' (so the existing markPublicationPublished/
 * markPublicationFailed/recordPublicationVerification functions apply
 * unchanged from here), redeployAttemptCount += 1, and a redeployHistory
 * entry snapshots the pre-redeploy frontendImage/frontendSourceRef/
 * verification so the forensic record of the failed attempt is never lost.
 */
export async function beginPublicationRedeploy(opts: {
  publicationId: string;
  sourceRevision: string;
}): Promise<BeginRedeployResult> {
  const { publicationId, sourceRevision } = opts;
  if (!mongoose.isValidObjectId(publicationId)) {
    return { ok: false, error: 'invalid_id', message: 'Invalid publication id' };
  }

  const publishedPublication = await SeoChangePublication.findOne({
    _id: new mongoose.Types.ObjectId(publicationId),
    status: 'published',
  }).exec();

  if (!publishedPublication) {
    return { ok: false, error: 'not_published', message: 'Publication was not found in published state' };
  }

  if (publishedPublication.redeployAttemptCount >= MAX_REDEPLOY_ATTEMPTS) {
    return {
      ok: false,
      error: 'redeploy_limit_reached',
      message: `Publication has already reached the maximum of ${MAX_REDEPLOY_ATTEMPTS} redeploy attempts`,
    };
  }

  const execution = await SeoChangeExecution.findById(publishedPublication.executionId).exec();
  if (!execution || execution.status !== 'succeeded') {
    return { ok: false, error: 'execution_invalid', message: 'Associated execution is missing or not in a succeeded state' };
  }

  const latestVerification = await SeoChangeVerification.findOne({ executionId: execution._id })
    .sort({ verifiedAt: -1 })
    .exec();

  if (!latestVerification || latestVerification.status === 'verified') {
    return {
      ok: false,
      error: 'no_mismatched_verification',
      message: 'No mismatch/fetch_failed verification exists for this execution — nothing to recover from',
    };
  }

  const publication = await SeoChangePublication.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(publicationId),
      status: 'published',
    },
    {
      $set: {
        status: 'building',
        startedAt: new Date(),
        failedAt: null,
        errorMessage: null,
      },
      $inc: {
        redeployAttemptCount: 1,
      },
      $push: {
        redeployHistory: {
          attemptedAt: new Date(),
          sourceRevision,
          previousFrontendImage: publishedPublication.frontendImage,
          previousFrontendSourceRef: publishedPublication.frontendSourceRef,
          previousVerificationId: latestVerification._id,
          previousVerificationStatus: latestVerification.status,
        },
      },
    },
    { new: true },
  ).exec();

  if (!publication) {
    return { ok: false, error: 'not_published', message: 'Publication was not found in published state' };
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
