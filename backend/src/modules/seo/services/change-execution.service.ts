import mongoose from 'mongoose';
import {
  SeoChangeExecution,
  ISeoChangeExecutionDoc,
  ExecutedTarget,
} from '../models/seo-change-execution.model';
import { SeoChangePublication } from '../models/seo-change-publication.model';
import { CmsService } from '../../cms/services/cms.service';
import { Product } from '../../catalog/models/product.model';
import { evaluateExecutionPreflight, PreflightBlockerCode } from './change-execution-preflight.service';

/**
 * Phase 5.3 — controlled execution. Takes one APPROVED, OPEN recommendation's
 * VALID metadata-only SeoChangeDraft and, after re-checking every eligibility
 * rule against fresh data inside a single Mongo transaction, writes the
 * proposed metaTitle/metaDescription to the matching CMS Page(s) — and nothing
 * else. This is the first (and, in this version, only) code path in the SEO
 * module that mutates production content. Deliberately narrow: only
 * kind:'metadata' changes targeting a live `/page/:slug/` CMS page URL are
 * executable; every other kind/target causes the WHOLE draft to be rejected.
 *
 * Phase 5.5 — every one of those eligibility rules, target resolutions and the
 * exact stale comparison now live in ChangeExecutionPreflightService, which is
 * ALSO what the advisory admin preflight endpoint calls. There is exactly one
 * implementation, so a preview can never say "safe" while the executor applies
 * materially different rules. The evaluation is rerun here, session-pinned
 * inside the transaction, immediately before Pass 2 — a preflight result
 * returned to a browser earlier is never trusted as authorization.
 */
export const EXECUTOR_VERSION = '6.3.0-metadata-product-content-v1';

const cmsService = new CmsService();

/** Unchanged Phase 5.3 vocabulary; Phase 5.5 added no_effective_change/malformed_value/ambiguous_target, which map to 409 like every other eligibility conflict. */
export type ExecuteChangeDraftError = PreflightBlockerCode;

export type ExecuteChangeDraftResult =
  | { ok: true; execution: ISeoChangeExecutionDoc }
  | { ok: false; error: ExecuteChangeDraftError; message: string };

/** Internal control-flow error carrying the eligibility failure reason, thrown to abort the transaction. */
class ExecutionRejected extends Error {
  constructor(
    public readonly code: ExecuteChangeDraftError,
    message: string,
  ) {
    super(message);
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

// Target resolution moved into the preflight evaluator in Phase 5.5 (it is a
// pre-write eligibility concern shared by preview and execution). Re-exported
// here so Phase 5.4B rollback — which must resolve targets by exactly the same
// rules — keeps its existing import path.
export {
  resolveCmsPageTarget,
  type TargetResolution,
  type TargetResolutionFailureReason,
} from './change-execution-preflight.service';

/**
 * Execute one draft's metadata changes, addressed by the draft's own Mongo
 * `_id`. Every eligibility rule is re-checked against fresh, session-pinned
 * reads immediately before any write. All targets are resolved and validated
 * (including the stale-current comparison and the Phase 5.5 quality blockers)
 * before a single Page is touched; if every check passes, all Page writes plus
 * the immutable execution record commit together in one Mongo transaction, or
 * none of them do.
 */
export async function executeApprovedChangeDraft(opts: {
  draftId: string;
  executorUserId: string;
}): Promise<ExecuteChangeDraftResult> {
  const { draftId, executorUserId } = opts;
  if (!mongoose.isValidObjectId(draftId)) {
    return { ok: false, error: 'invalid_id', message: 'Invalid draft id' };
  }

  // Guarantee the unique index on draftId — the load-bearing concurrent-execution
  // guarantee — is actually built before relying on it or opening a transaction.
  // Production connects with plain mongoose.connect(uri) defaults, so without
  // this there is a startup window where an index build could still be in
  // flight; Model.init() resolves once index creation has finished and
  // mongoose caches the resulting promise, so this is a no-op on every call
  // after the first. This stays a database constraint, not an in-memory lock.
  await SeoChangeExecution.init();
  await SeoChangePublication.init();

  // Fast idempotency short-circuit — the unique index on draftId (re-checked at
  // insert time inside the transaction below) is the actual race-safety
  // guarantee; this just avoids opening a transaction for the common case.
  if (await SeoChangeExecution.exists({ draftId })) {
    return { ok: false, error: 'already_executed', message: 'This draft has already been executed' };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // PASS 1 — the authoritative preflight evaluation, session-pinned against
    // fresh data. Resolves and validates EVERY target and performs NO WRITES.
    // If anything blocks, the whole draft is rejected with zero attempted Page
    // writes — a real property of the code, not something left to the
    // transaction to paper over.
    const { result, prepared, draft, recommendation } = await evaluateExecutionPreflight({ draftId, session });

    if (!result.executable) {
      // Blockers are collected in Phase 5.3's original evaluation order, so the
      // first one is exactly the error Phase 5.3 would have returned.
      const [blocker] = result.blockers;
      throw new ExecutionRejected(blocker.code, blocker.message);
    }
    // Unreachable when executable — a defensive narrow, never a silent success.
    if (!draft || !recommendation) {
      throw new ExecutionRejected('not_found', 'Draft not found');
    }

    // PASS 2 — every target passed Pass 1; only now perform the writes.
    const targets: ExecutedTarget[] = [];

    for (const p of prepared) {
      if (p.targetType === 'cms_page') {
        const updated = await cmsService.updatePageSeoMetadata(
          String(p.page._id),
          p.proposed,
          executorUserId,
          { session },
        );

        targets.push({
          targetUrl: p.targetUrl,
          targetDocumentId:
            p.page._id as mongoose.Types.ObjectId,
          before: p.before,
          proposed: p.proposed,
          after: {
            metaTitle: updated.metaTitle,
            metaDescription: updated.metaDescription,
          },
        });

        continue;
      }

      const updatedProduct =
        await Product.findOneAndUpdate(
          {
            _id: p.product._id,
            status: 'active',
            description: p.before.description ?? '',
          },
          {
            $set: {
              description: p.proposed.description,
            },
          },
          {
            new: true,
            session,
          },
        ).exec();

      if (!updatedProduct) {
        throw new ExecutionRejected(
          'stale',
          `Product "${p.product.slug}" changed before execution could commit`,
        );
      }

      targets.push({
        targetUrl: p.targetUrl,
        targetDocumentId:
          p.product._id as mongoose.Types.ObjectId,
        before: p.before,
        proposed: p.proposed,
        after: {
          description: updatedProduct.description ?? '',
        },
      });
    }

    const [created] = await SeoChangeExecution.create(
      [
        {
          draftId: draft._id,
          recommendationId: recommendation._id,
          recommendationFingerprint: recommendation.fingerprint,
          targetType: prepared[0].targetType,
          targets,
          executorUserId: new mongoose.Types.ObjectId(executorUserId),
          executedAt: new Date(),
          status: 'succeeded',
          generatorVersion: draft.generatorVersion,
          executorVersion: EXECUTOR_VERSION,
          errorCode: null,
          errorMessage: null,
          // Immutable quality-control evidence for THIS execution: the exact
          // evaluation that authorized it, never a mutable running score.
          qualityControl: {
            preflightVersion: result.evaluatorVersion,
            riskLevel: result.riskLevel,
            warnings: result.warnings,
            checks: result.checks,
            changedFields: result.changedFields,
            evaluatedAt: result.evaluatedAt,
          },
        },
      ],
      { session },
    );

    // A successful CMS write is not yet a public SEO publication on this site:
    // /page routes are statically prerendered into the frontend image.
    //
    // Create the publication request in the SAME Mongo transaction as the Page
    // writes + immutable execution record. If this request cannot be persisted,
    // the CMS mutation is rolled back too, so no new execution can become
    // stranded without a publication lifecycle.
    await SeoChangePublication.create(
      [
        {
          executionId: created._id,
          recommendationId: recommendation._id,
          draftId: draft._id,
          requestedByUserId: new mongoose.Types.ObjectId(executorUserId),
          requestedAt: new Date(),
          status: 'pending',
          startedAt: null,
          publishedAt: null,
          failedAt: null,
          frontendImage: null,
          frontendSourceRef: null,
          attemptCount: 0,
          errorMessage: null,
          publicationVersion: '5.4a-publication-v1',
          verificationId: null,
          verificationStatus: null,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    return { ok: true, execution: created };
  } catch (err) {
    await session.abortTransaction();
    if (err instanceof ExecutionRejected) {
      return { ok: false, error: err.code, message: err.message };
    }
    if (isDuplicateKeyError(err)) {
      return { ok: false, error: 'already_executed', message: 'This draft has already been executed' };
    }
    throw err;
  } finally {
    session.endSession();
  }
}

/** Execution history for one draft, newest first. Null ⇒ invalid id. In v1 this is at most one entry (success-only, unique per draft). */
export async function listExecutionsForDraft(draftId: string): Promise<ISeoChangeExecutionDoc[] | null> {
  if (!mongoose.isValidObjectId(draftId)) return null;
  return SeoChangeExecution.find({ draftId }).sort({ executedAt: -1 }).exec();
}

/** Single execution by its own _id. Null ⇒ invalid id or not found. */
export async function getExecutionById(executionId: string): Promise<ISeoChangeExecutionDoc | null> {
  if (!mongoose.isValidObjectId(executionId)) return null;
  return SeoChangeExecution.findById(executionId).exec();
}

export function toExecutionView(doc: ISeoChangeExecutionDoc) {
  const qc = doc.qualityControl;
  return {
    id: String(doc._id),
    draftId: String(doc.draftId),
    recommendationId: String(doc.recommendationId),
    recommendationFingerprint: doc.recommendationFingerprint,
    targetType: doc.targetType,
    targets: doc.targets.map((t) => ({
      targetUrl: t.targetUrl,
      targetDocumentId: String(t.targetDocumentId),
      before: t.before,
      proposed: t.proposed,
      after: t.after,
    })),
    executorUserId: String(doc.executorUserId),
    executedAt: doc.executedAt,
    status: doc.status,
    generatorVersion: doc.generatorVersion,
    executorVersion: doc.executorVersion,
    // Null for every execution recorded before Phase 5.5 — those records are
    // never rewritten and must keep serializing safely.
    qualityControl: qc
      ? {
          preflightVersion: qc.preflightVersion,
          riskLevel: qc.riskLevel,
          warnings: qc.warnings,
          checks: qc.checks,
          changedFields: qc.changedFields,
          evaluatedAt: qc.evaluatedAt,
        }
      : null,
    createdAt: doc.createdAt,
  };
}
