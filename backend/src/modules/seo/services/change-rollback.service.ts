import mongoose, { ClientSession } from 'mongoose';
import {
  SeoChangeExecution,
  ISeoChangeExecutionDoc,
  ExecutedFieldSnapshot,
  ExecutedTarget,
} from '../models/seo-change-execution.model';
import { SeoChangeRollback, ISeoChangeRollbackDoc, RolledBackTarget } from '../models/seo-change-rollback.model';
import { Page, IPageDoc } from '../../cms/models/page.model';
import { CmsService } from '../../cms/services/cms.service';
import { resolveCmsPageTarget } from './change-execution.service';

/**
 * Phase 5.4B — controlled rollback. Restores the whitelisted CMS Page metadata
 * fields that ONE successful Phase 5.3 execution actually wrote back to the
 * values that execution captured in `targets[].before`.
 *
 * Alongside Phase 5.3 execution this is the ONLY code path in the SEO module
 * that mutates production content — verification and completion create nothing
 * but their own immutable records.
 *
 * Deliberately narrow and conservative:
 *  - restore values come ONLY from the immutable execution record, never from
 *    the current draft/recommendation, never from the request body, and nothing
 *    is regenerated (no DataForSEO/GSC/LLM or any other provider is consulted);
 *  - only fields the execution actually wrote are restored — a rollback never
 *    blindly writes both metadata fields;
 *  - a later human/admin/system edit is never overwritten: if any target's live
 *    value no longer equals what the execution wrote, the WHOLE rollback is
 *    rejected as stale;
 *  - recommendation status/resolvedRunId is never touched, and execution,
 *    verification, completion and draft history are never deleted or rewritten.
 */
export const ROLLBACK_VERSION = '5.4b-rollback-v1';

const cmsService = new CmsService();

export type RollbackExecutionError =
  | 'invalid_id'
  | 'not_found'
  | 'unsupported_state'
  | 'target_not_found'
  | 'unsupported_target'
  | 'stale'
  | 'already_rolled_back';

export type RollbackExecutionResult =
  | { ok: true; rollback: ISeoChangeRollbackDoc }
  | { ok: false; error: RollbackExecutionError; message: string };

/** Internal control-flow error carrying the eligibility failure reason, thrown to abort the transaction. */
class RollbackRejected extends Error {
  constructor(
    public readonly code: RollbackExecutionError,
    message: string,
  ) {
    super(message);
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

/** The two whitelisted metadata fields, as they are keyed in an ExecutedFieldSnapshot. */
type MetadataFieldKey = 'metaTitle' | 'metaDescription';
const METADATA_FIELD_KEYS: MetadataFieldKey[] = ['metaTitle', 'metaDescription'];

/**
 * THE canonical executed-field test. Presence is exact — `!== undefined`, never
 * truthiness — because an execution that deliberately wrote an empty string
 * DID execute that field and must roll back correctly.
 */
export function wasFieldExecuted(target: ExecutedTarget, field: MetadataFieldKey): boolean {
  return target.proposed[field] !== undefined || target.after[field] !== undefined;
}

function executedFieldsOf(target: ExecutedTarget): MetadataFieldKey[] {
  return METADATA_FIELD_KEYS.filter((field) => wasFieldExecuted(target, field));
}

/** Mongo stores metaTitle/metaDescription as '' by default (mongoose applies the schema default on hydration too), never null/undefined — normalize the live side only, for comparison. */
function liveValue(page: IPageDoc, field: MetadataFieldKey): string {
  return page[field] ?? '';
}

interface PreparedRollbackTarget {
  targetUrl: string;
  page: IPageDoc;
  fields: MetadataFieldKey[];
  beforeRollback: ExecutedFieldSnapshot;
  restored: ExecutedFieldSnapshot;
}

/**
 * Pass 1 for ONE target: resolve it, prove it is still the same published CMS
 * page, work out exactly which fields the execution wrote, stale-check each of
 * them against the live Page, and build the restore payload from
 * `execution.before`. Performs ZERO writes.
 */
async function prepareTarget(target: ExecutedTarget, session: ClientSession): Promise<PreparedRollbackTarget> {
  const fields = executedFieldsOf(target);
  if (!fields.length) {
    throw new RollbackRejected(
      'unsupported_state',
      `Execution target ${target.targetUrl} records no rollbackable metadata field`,
    );
  }

  // targetDocumentId is the authoritative identity — never roll back by URL
  // lookup alone, and never touch an arbitrary collection/document.
  const page = await Page.findById(target.targetDocumentId).session(session).exec();
  if (!page) {
    throw new RollbackRejected('target_not_found', `No CMS page found for ${target.targetUrl}`);
  }
  if (page.status !== 'published') {
    throw new RollbackRejected('unsupported_target', `The CMS page for ${target.targetUrl} is no longer published`);
  }

  // …and the recorded URL must still address that same canonical CMS page, so
  // a page that was since re-slugged (or a URL that now points elsewhere) is
  // rejected rather than silently rolled back under a stale address.
  const resolution = await resolveCmsPageTarget(target.targetUrl, session);
  if (!resolution.ok || String(resolution.page._id) !== String(target.targetDocumentId)) {
    throw new RollbackRejected(
      'unsupported_target',
      `${target.targetUrl} no longer resolves to the CMS page this execution wrote`,
    );
  }

  const beforeRollback: ExecutedFieldSnapshot = {};
  const restored: ExecutedFieldSnapshot = {};

  for (const field of fields) {
    const executedValue = target.after[field];
    const originalValue = target.before[field];

    // Both are guaranteed present for a genuine Phase 5.3 execution (the Page
    // schema defaults both fields to '' and mongoose applies that default on
    // hydration, so an execution's before/after snapshots always carry
    // strings). A record missing either cannot be stale-checked or faithfully
    // restored, so it is rejected — never silently turned into an empty string.
    if (executedValue === undefined) {
      throw new RollbackRejected(
        'unsupported_state',
        `Execution for ${target.targetUrl} recorded no "after" value for ${field} and cannot be rolled back`,
      );
    }
    if (originalValue === undefined) {
      throw new RollbackRejected(
        'unsupported_state',
        `Execution for ${target.targetUrl} recorded no "before" value for ${field} and cannot be rolled back`,
      );
    }

    // Stale/conflict protection: the live value must still be EXACTLY what this
    // execution wrote. Anything else means someone or something changed the
    // page afterwards, and that change must never be overwritten.
    if (liveValue(page, field) !== executedValue) {
      throw new RollbackRejected(
        'stale',
        `Live ${field} for "${page.slug}" has changed since this execution — rollback would overwrite a newer change`,
      );
    }

    beforeRollback[field] = liveValue(page, field);
    restored[field] = originalValue;
  }

  return { targetUrl: target.targetUrl, page, fields, beforeRollback, restored };
}

/**
 * Roll back one successful execution, addressed by the execution's own Mongo
 * `_id`. Genuinely two-pass: EVERY target is resolved, identity-checked and
 * stale-checked first (Pass 1, zero writes); only once all of them pass does
 * Pass 2 write any Page. The Page writes and the immutable rollback record
 * then commit together in a single Mongo transaction, or none of them do.
 */
export async function rollbackExecution(opts: {
  executionId: string;
  rollbackUserId: string;
}): Promise<RollbackExecutionResult> {
  const { executionId, rollbackUserId } = opts;
  if (!mongoose.isValidObjectId(executionId)) {
    return { ok: false, error: 'invalid_id', message: 'Invalid execution id' };
  }

  // Guarantee the unique index on executionId — the load-bearing
  // concurrent-rollback guarantee — is actually built before relying on it or
  // opening a transaction, exactly as Phase 5.3 execution does.
  await SeoChangeRollback.init();

  // Fast idempotency short-circuit — the unique index (re-checked at insert
  // time inside the transaction below) is the actual race-safety guarantee.
  if (await SeoChangeRollback.exists({ executionId })) {
    return { ok: false, error: 'already_rolled_back', message: 'This execution has already been rolled back' };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const execution: ISeoChangeExecutionDoc | null = await SeoChangeExecution.findById(executionId)
      .session(session)
      .exec();
    if (!execution) throw new RollbackRejected('not_found', 'Execution not found');
    if (execution.status !== 'succeeded') {
      throw new RollbackRejected('unsupported_state', 'Only a successful execution can be rolled back');
    }
    if (execution.targetType !== 'cms_page') {
      throw new RollbackRejected(
        'unsupported_state',
        `Execution target type "${execution.targetType}" cannot be rolled back in this phase`,
      );
    }
    if (!execution.targets.length) {
      throw new RollbackRejected('unsupported_state', 'This execution has no recorded targets to roll back');
    }

    // PASS 1 — resolve, identity-check and stale-check EVERY target. NO WRITES.
    // If any target fails, the whole rollback is rejected with zero attempted
    // Page writes — a real property of the code, not something left to the
    // transaction to paper over.
    const prepared: PreparedRollbackTarget[] = [];
    for (const target of execution.targets) {
      prepared.push(await prepareTarget(target, session));
    }

    // PASS 2 — every target passed Pass 1; only now perform the writes.
    const targets: RolledBackTarget[] = [];
    for (const p of prepared) {
      const updated = await cmsService.updatePageSeoMetadata(String(p.page._id), p.restored, rollbackUserId, {
        session,
      });

      const afterRollback: ExecutedFieldSnapshot = {};
      for (const field of p.fields) afterRollback[field] = updated[field];

      targets.push({
        targetUrl: p.targetUrl,
        targetDocumentId: p.page._id as mongoose.Types.ObjectId,
        beforeRollback: p.beforeRollback,
        restored: p.restored,
        afterRollback,
      });
    }

    const [created] = await SeoChangeRollback.create(
      [
        {
          executionId: execution._id,
          recommendationId: execution.recommendationId,
          draftId: execution.draftId,
          rollbackUserId: new mongoose.Types.ObjectId(rollbackUserId),
          rolledBackAt: new Date(),
          targetType: 'cms_page',
          targets,
          status: 'succeeded',
          rollbackVersion: ROLLBACK_VERSION,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    return { ok: true, rollback: created };
  } catch (err) {
    await session.abortTransaction();
    if (err instanceof RollbackRejected) {
      return { ok: false, error: err.code, message: err.message };
    }
    if (isDuplicateKeyError(err)) {
      return { ok: false, error: 'already_rolled_back', message: 'This execution has already been rolled back' };
    }
    throw err;
  } finally {
    session.endSession();
  }
}

/** Rollback history for one execution, newest first. Null ⇒ invalid id. At most one entry (success-only, unique per execution) — exposed as an array for consistency. */
export async function listRollbacksForExecution(executionId: string): Promise<ISeoChangeRollbackDoc[] | null> {
  if (!mongoose.isValidObjectId(executionId)) return null;
  return SeoChangeRollback.find({ executionId }).sort({ rolledBackAt: -1 }).exec();
}

/** Single rollback by its own _id. Null ⇒ invalid id or not found. */
export async function getRollbackById(rollbackId: string): Promise<ISeoChangeRollbackDoc | null> {
  if (!mongoose.isValidObjectId(rollbackId)) return null;
  return SeoChangeRollback.findById(rollbackId).exec();
}

export function toRollbackView(doc: ISeoChangeRollbackDoc) {
  return {
    id: String(doc._id),
    executionId: String(doc.executionId),
    recommendationId: String(doc.recommendationId),
    draftId: String(doc.draftId),
    rollbackUserId: String(doc.rollbackUserId),
    rolledBackAt: doc.rolledBackAt,
    targetType: doc.targetType,
    targets: doc.targets.map((t) => ({
      targetUrl: t.targetUrl,
      targetDocumentId: String(t.targetDocumentId),
      beforeRollback: t.beforeRollback,
      restored: t.restored,
      afterRollback: t.afterRollback,
    })),
    status: doc.status,
    rollbackVersion: doc.rollbackVersion,
    createdAt: doc.createdAt,
  };
}
