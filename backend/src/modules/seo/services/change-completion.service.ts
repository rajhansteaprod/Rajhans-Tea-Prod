import mongoose from 'mongoose';
import { SeoChangeExecution, ISeoChangeExecutionDoc } from '../models/seo-change-execution.model';
import { SeoChangeVerification, ISeoChangeVerificationDoc } from '../models/seo-change-verification.model';
import { SeoChangeCompletion, ISeoChangeCompletionDoc } from '../models/seo-change-completion.model';

/**
 * Phase 5.4B — human completion. Records that an admin intentionally marked one
 * SUCCESSFUL, VERIFIED Phase 5.3 execution as implemented. Creates the
 * immutable SeoChangeCompletion record and NOTHING else: no Page write, no
 * recommendation status/resolvedRunId write, no draft/execution/verification
 * mutation.
 *
 * This is deliberately kept out of `SeoRecommendation.status`. That field (and
 * `resolvedRunId`) belongs to the machine/evidence lifecycle — audit/GSC/market
 * reconciliation reopens and resolves recommendations on its own — so a human
 * implementation outcome must live in its own immutable record instead.
 *
 * Nothing in the request body is trusted: the recommendation id, draft id and
 * verification are all read from the execution/verification documents, and the
 * completing admin is always the authenticated `req.user.userId`.
 */
export const COMPLETION_VERSION = '5.4b-completion-v1';

export type CompleteExecutionError =
  | 'invalid_id'
  | 'not_found'
  | 'unsupported_state'
  | 'not_verified'
  | 'already_completed';

export type CompleteExecutionResult =
  | { ok: true; completion: ISeoChangeCompletionDoc }
  | { ok: false; error: CompleteExecutionError; message: string };

function isDuplicateKeyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

/**
 * Complete one execution, addressed by the execution's own Mongo `_id`.
 *
 * Deliberately does NOT re-check the recommendation's open/approved state: the
 * execution already happened and was verified, and this records a decision
 * about THAT execution. It also does not consider rollback — the eligibility
 * contract for completion is exactly the list below; the admin UI simply hides
 * the action once a rollback exists.
 */
export async function completeExecution(opts: {
  executionId: string;
  completedByUserId: string;
}): Promise<CompleteExecutionResult> {
  const { executionId, completedByUserId } = opts;
  if (!mongoose.isValidObjectId(executionId)) {
    return { ok: false, error: 'invalid_id', message: 'Invalid execution id' };
  }

  // Guarantee the unique index on executionId — the load-bearing
  // one-completion-per-execution guarantee — is actually built before relying
  // on duplicate-key idempotency, exactly as Phase 5.3 execution does.
  // Model.init() resolves once index creation has finished and mongoose caches
  // the promise, so this is a no-op after the first call.
  await SeoChangeCompletion.init();

  const execution: ISeoChangeExecutionDoc | null = await SeoChangeExecution.findById(executionId).exec();
  if (!execution) return { ok: false, error: 'not_found', message: 'Execution not found' };
  if (execution.status !== 'succeeded') {
    return { ok: false, error: 'unsupported_state', message: 'Only a successful execution can be completed' };
  }
  if (execution.targetType !== 'cms_page') {
    return {
      ok: false,
      error: 'unsupported_state',
      message: `Execution target type "${execution.targetType}" cannot be completed in this phase`,
    };
  }

  // Fast idempotency short-circuit — the unique index (re-checked at insert
  // time below) is the actual race-safety guarantee.
  if (await SeoChangeCompletion.exists({ executionId: execution._id })) {
    return { ok: false, error: 'already_completed', message: 'This execution has already been completed' };
  }

  // Deterministic evidence selection: the NEWEST verification for this
  // execution whose status is 'verified'. A mismatch/fetch_failed attempt is
  // never evidence of a working change, and an older verified attempt is never
  // preferred over a newer one.
  const verification: ISeoChangeVerificationDoc | null = await SeoChangeVerification.findOne({
    executionId: execution._id,
    status: 'verified',
  })
    .sort({ verifiedAt: -1 })
    .exec();

  if (!verification) {
    return {
      ok: false,
      error: 'not_verified',
      message: 'This execution has no successful verification and cannot be completed',
    };
  }

  // Fail closed on an identity mismatch rather than silently completing against
  // evidence that belongs to a different recommendation/draft.
  if (
    String(verification.executionId) !== String(execution._id) ||
    String(verification.recommendationId) !== String(execution.recommendationId) ||
    String(verification.draftId) !== String(execution.draftId)
  ) {
    return {
      ok: false,
      error: 'unsupported_state',
      message: 'The verification for this execution does not match its recommendation/draft',
    };
  }

  try {
    const completion = await SeoChangeCompletion.create({
      executionId: execution._id,
      recommendationId: execution.recommendationId,
      draftId: execution.draftId,
      verificationId: verification._id,
      completedByUserId: new mongoose.Types.ObjectId(completedByUserId),
      completedAt: new Date(),
      status: 'completed',
      completionVersion: COMPLETION_VERSION,
    });
    return { ok: true, completion };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { ok: false, error: 'already_completed', message: 'This execution has already been completed' };
    }
    throw err;
  }
}

/** Completion history for one execution, newest first. Null ⇒ invalid id. At most one entry (success-only, unique per execution) — exposed as an array for consistency. */
export async function listCompletionsForExecution(executionId: string): Promise<ISeoChangeCompletionDoc[] | null> {
  if (!mongoose.isValidObjectId(executionId)) return null;
  return SeoChangeCompletion.find({ executionId }).sort({ completedAt: -1 }).exec();
}

/** Single completion by its own _id. Null ⇒ invalid id or not found. */
export async function getCompletionById(completionId: string): Promise<ISeoChangeCompletionDoc | null> {
  if (!mongoose.isValidObjectId(completionId)) return null;
  return SeoChangeCompletion.findById(completionId).exec();
}

export function toCompletionView(doc: ISeoChangeCompletionDoc) {
  return {
    id: String(doc._id),
    executionId: String(doc.executionId),
    recommendationId: String(doc.recommendationId),
    draftId: String(doc.draftId),
    verificationId: String(doc.verificationId),
    completedByUserId: String(doc.completedByUserId),
    completedAt: doc.completedAt,
    status: doc.status,
    completionVersion: doc.completionVersion,
    createdAt: doc.createdAt,
  };
}
