import mongoose, { ClientSession } from 'mongoose';
import { SeoRecommendation } from '../models/seo-recommendation.model';
import { SeoChangeDraft, MetadataProposedChange } from '../models/seo-change-draft.model';
import {
  SeoChangeExecution,
  ISeoChangeExecutionDoc,
  ExecutedFieldSnapshot,
  ExecutedTarget,
} from '../models/seo-change-execution.model';
import { Page, IPageDoc } from '../../cms/models/page.model';
import { CANONICAL_PAGE_SLUG } from '../../cms/page-slug.util';
import { CmsService } from '../../cms/services/cms.service';
import { seoConfig } from '../seo.config';

/**
 * Phase 5.3 — controlled execution. Takes one APPROVED, OPEN recommendation's
 * VALID metadata-only SeoChangeDraft and, after re-checking every eligibility
 * rule against fresh data inside a single Mongo transaction, writes the
 * proposed metaTitle/metaDescription to the matching CMS Page(s) — and nothing
 * else. This is the first (and, in this version, only) code path in the SEO
 * module that mutates production content. Deliberately narrow: only
 * kind:'metadata' changes targeting a live `/page/:slug/` CMS page URL are
 * executable; every other kind/target causes the WHOLE draft to be rejected.
 */
export const EXECUTOR_VERSION = '5.3.0-metadata-page-v1';

const cmsService = new CmsService();

export type ExecuteChangeDraftError =
  | 'invalid_id'
  | 'not_found'
  | 'recommendation_not_found'
  | 'not_draft'
  | 'not_open'
  | 'not_approved'
  | 'fingerprint_mismatch'
  | 'invalid_draft'
  | 'unsupported_kind'
  | 'unsupported_field'
  | 'unsupported_target'
  | 'target_not_found'
  | 'stale'
  | 'already_executed';

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

/** Mongo stores metaTitle/metaDescription as '' by default, never null/undefined — normalize accordingly for comparison only. */
function normalizeForCompare(value: string | null | undefined): string {
  return value ?? '';
}

type FieldCheckResult = { ok: true } | { ok: false; message: string };

const ALLOWED_METADATA_FIELD_KEYS = ['title', 'metaDescription'];

/** v1 may only execute title/metaDescription. h1 (or any other field) disqualifies the whole change. */
function checkMetadataFields(fields: MetadataProposedChange['fields']): FieldCheckResult {
  const keys = Object.keys(fields ?? {});
  const unknownKeys = keys.filter((k) => k !== 'h1' && !ALLOWED_METADATA_FIELD_KEYS.includes(k));
  if (unknownKeys.length) {
    return { ok: false, message: `Unsupported metadata field(s): ${unknownKeys.join(', ')}` };
  }
  if (fields?.h1 !== undefined) {
    return { ok: false, message: 'h1 changes cannot be executed in this phase' };
  }
  if (!fields?.title && !fields?.metaDescription) {
    return { ok: false, message: 'No executable field (title/metaDescription) was proposed' };
  }
  return { ok: true };
}

type StaleCheckResult = { ok: true } | { ok: false; message: string };

/** Compares the draft's recorded `current` value against the live Page value, at execution time. */
function checkStale(fields: MetadataProposedChange['fields'], page: IPageDoc): StaleCheckResult {
  if (fields.title && normalizeForCompare(fields.title.current) !== normalizeForCompare(page.metaTitle)) {
    return { ok: false, message: `Live metaTitle for "${page.slug}" has changed since this draft was generated` };
  }
  if (
    fields.metaDescription &&
    normalizeForCompare(fields.metaDescription.current) !== normalizeForCompare(page.metaDescription)
  ) {
    return { ok: false, message: `Live metaDescription for "${page.slug}" has changed since this draft was generated` };
  }
  return { ok: true };
}

export type TargetResolutionFailureReason = 'unsupported_host' | 'unsupported_path' | 'not_found';
export type TargetResolution = { ok: true; page: IPageDoc } | { ok: false; reason: TargetResolutionFailureReason };

/** Only `/page/:slug/` (or without the trailing slash) on the configured public origin resolves — everything else (other hosts, /blog/, /product/, /catalog/, the homepage, admin/api paths) is unsupported. */
const CMS_PAGE_PATH_PATTERN = /^\/page\/([^/]+)\/?$/;

export async function resolveCmsPageTarget(targetUrl: string, session?: ClientSession): Promise<TargetResolution> {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(targetUrl);
    base = new URL(seoConfig.baseUrl);
  } catch {
    return { ok: false, reason: 'unsupported_path' };
  }

  // Only a bare canonical page URL is executable — a query string, a fragment,
  // or embedded userinfo credentials each change what the URL actually
  // addresses (or imply context this phase never accounts for), so any of
  // them disqualifies the target even when the origin/path would otherwise
  // match.
  if (parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'unsupported_path' };
  }

  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) {
    return { ok: false, reason: 'unsupported_host' };
  }

  const match = CMS_PAGE_PATH_PATTERN.exec(parsed.pathname);
  const urlSlug = match?.[1];
  if (!urlSlug) {
    return { ok: false, reason: 'unsupported_path' };
  }

  // A CMS page may still be stored under a legacy slug that 301s to the
  // canonical URL slug at the edge — try both, canonical first. Only a
  // PUBLISHED page is executable — v1 is explicitly about live CMS metadata,
  // so a draft/unpublished page must resolve as not_found (execution fails
  // before any write), the same as if no page existed at all.
  const legacySlug = Object.keys(CANONICAL_PAGE_SLUG).find((k) => CANONICAL_PAGE_SLUG[k] === urlSlug);
  const candidates = legacySlug ? [urlSlug, legacySlug] : [urlSlug];
  for (const slug of candidates) {
    const page = await Page.findOne({ slug, status: 'published' }).session(session ?? null).exec();
    if (page) return { ok: true, page };
  }
  return { ok: false, reason: 'not_found' };
}

/**
 * Execute one draft's metadata changes, addressed by the draft's own Mongo
 * `_id`. Every eligibility rule is re-checked against fresh, session-pinned
 * reads immediately before any write. All targets are resolved and validated
 * (including the stale-current comparison) before a single Page is touched;
 * if every check passes, all Page writes plus the immutable execution record
 * commit together in one Mongo transaction, or none of them do.
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

  // Fast idempotency short-circuit — the unique index on draftId (re-checked at
  // insert time inside the transaction below) is the actual race-safety
  // guarantee; this just avoids opening a transaction for the common case.
  if (await SeoChangeExecution.exists({ draftId })) {
    return { ok: false, error: 'already_executed', message: 'This draft has already been executed' };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const draft = await SeoChangeDraft.findById(draftId).session(session).exec();
    if (!draft) throw new ExecutionRejected('not_found', 'Draft not found');
    if (draft.status !== 'draft') {
      throw new ExecutionRejected('not_draft', 'Only an active (non-superseded) draft can be executed');
    }

    const recommendation = await SeoRecommendation.findById(draft.recommendationId).session(session).exec();
    if (!recommendation) throw new ExecutionRejected('recommendation_not_found', 'Recommendation not found');
    if (recommendation.status !== 'open') {
      throw new ExecutionRejected('not_open', 'Only an open recommendation can be executed');
    }
    if (recommendation.reviewStatus !== 'approved') {
      throw new ExecutionRejected('not_approved', 'Only an approved recommendation can be executed');
    }
    if (draft.recommendationFingerprint !== recommendation.fingerprint) {
      throw new ExecutionRejected(
        'fingerprint_mismatch',
        'The recommendation has changed since this draft was generated',
      );
    }
    if (!draft.validation.isValid) {
      throw new ExecutionRejected('invalid_draft', 'This draft failed validation and cannot be executed');
    }
    if (!draft.proposedChanges.length) {
      throw new ExecutionRejected('invalid_draft', 'This draft has no proposed changes');
    }

    const metadataChanges: MetadataProposedChange[] = [];
    for (const change of draft.proposedChanges) {
      if (change.kind !== 'metadata') {
        throw new ExecutionRejected(
          'unsupported_kind',
          `Change kind "${change.kind}" cannot be executed in this phase`,
        );
      }
      const fieldCheck = checkMetadataFields(change.fields);
      if (!fieldCheck.ok) throw new ExecutionRejected('unsupported_field', fieldCheck.message);
      metadataChanges.push(change);
    }

    // PASS 1 — resolve, validate, and stale-check EVERY target. NO WRITES.
    // If any target fails, the whole draft is rejected with zero attempted
    // Page writes — this is a real property of the code, not something left
    // to the transaction to paper over.
    const prepared: { targetUrl: string; page: IPageDoc; before: ExecutedFieldSnapshot; proposed: ExecutedFieldSnapshot }[] = [];
    for (const change of metadataChanges) {
      const target = await resolveCmsPageTarget(change.targetUrl, session);
      if (!target.ok) {
        if (target.reason === 'not_found') {
          throw new ExecutionRejected('target_not_found', `No CMS page found for ${change.targetUrl}`);
        }
        throw new ExecutionRejected('unsupported_target', `${change.targetUrl} is not an executable CMS page URL`);
      }

      const staleCheck = checkStale(change.fields, target.page);
      if (!staleCheck.ok) throw new ExecutionRejected('stale', staleCheck.message);

      const proposed: ExecutedFieldSnapshot = {};
      if (change.fields.title) proposed.metaTitle = change.fields.title.proposed;
      if (change.fields.metaDescription) proposed.metaDescription = change.fields.metaDescription.proposed;

      const before: ExecutedFieldSnapshot = {
        metaTitle: target.page.metaTitle,
        metaDescription: target.page.metaDescription,
      };

      prepared.push({ targetUrl: change.targetUrl, page: target.page, before, proposed });
    }

    // PASS 2 — every target passed Pass 1; only now perform the writes.
    const targets: ExecutedTarget[] = [];
    for (const p of prepared) {
      const updated = await cmsService.updatePageSeoMetadata(String(p.page._id), p.proposed, executorUserId, {
        session,
      });

      targets.push({
        targetUrl: p.targetUrl,
        targetDocumentId: p.page._id as mongoose.Types.ObjectId,
        before: p.before,
        proposed: p.proposed,
        after: { metaTitle: updated.metaTitle, metaDescription: updated.metaDescription },
      });
    }

    const [created] = await SeoChangeExecution.create(
      [
        {
          draftId: draft._id,
          recommendationId: recommendation._id,
          recommendationFingerprint: recommendation.fingerprint,
          targetType: 'cms_page',
          targets,
          executorUserId: new mongoose.Types.ObjectId(executorUserId),
          executedAt: new Date(),
          status: 'succeeded',
          generatorVersion: draft.generatorVersion,
          executorVersion: EXECUTOR_VERSION,
          errorCode: null,
          errorMessage: null,
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
    createdAt: doc.createdAt,
  };
}
