import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../../utils/api-response';
import { SeoAuditRun } from './models/seo-audit-run.model';
import { getSeoAuditQueue, SEO_RUN_JOB } from './jobs/queues/seo-audit.queue';
import { listRuns, getReport, getRunIssues } from './services/report.service';
import {
  getRecommendationsReport,
  updateRecommendationReview,
  toView as toRecommendationView,
  RecommendationReviewStatus,
} from './services/recommendation.service';
import {
  generateChangeDraft,
  listChangeDrafts,
  getChangeDraftById,
  recommendationExists,
  toChangeDraftView,
} from './services/change-draft-generator.service';
import {
  executeApprovedChangeDraft,
  listExecutionsForDraft,
  getExecutionById,
  toExecutionView,
} from './services/change-execution.service';
import { RULE_REGISTRY } from './services/rules';
import { RunScope } from './seo.types';
import { gscConfig } from './gsc.config';
import { GscSyncRun } from './models/gsc-sync-run.model';
import { getGscSyncQueue, GSC_SYNC_JOB } from './jobs/queues/gsc-sync.queue';

/**
 * Manually trigger an audit (admin only). Enqueues a BullMQ job — the worker runs
 * it off-thread. Guards against concurrent runs so we never hammer production or
 * produce overlapping, non-comparable audits.
 */
export const triggerAudit = async (req: Request, res: Response) => {
  const running = await SeoAuditRun.findOne({ status: 'running' }).exec();
  if (running) {
    return res
      .status(409)
      .json({ success: false, statusCode: 409, message: 'An audit is already running', data: { runId: running._id } });
  }
  const scope = ((req.body?.scope as RunScope) || 'daily') as RunScope;
  const job = await getSeoAuditQueue().add(
    SEO_RUN_JOB,
    { trigger: 'manual', scope },
    { removeOnComplete: 50, removeOnFail: 50 },
  );
  return sendSuccess(res, { queued: true, jobId: job.id, scope }, 'SEO audit enqueued', 202);
};

export const getRuns = async (req: Request, res: Response) => {
  const raw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = raw ? parseInt(String(raw), 10) : 20;
  sendSuccess(res, await listRuns(Number.isFinite(limit) ? limit : 20));
};

const str = (v: unknown): string | undefined =>
  Array.isArray(v) ? String(v[0]) : v != null ? String(v) : undefined;

export const getRun = async (req: Request, res: Response) => {
  const report = await getReport(str(req.params.id) ?? '');
  if (!report) return res.status(404).json({ success: false, statusCode: 404, message: 'Run not found' });
  return sendSuccess(res, report);
};

export const getIssues = async (req: Request, res: Response) => {
  sendSuccess(res, await getRunIssues(str(req.params.id) ?? '', { severity: str(req.query.severity), status: str(req.query.status) }));
};

/** The machine-readable check catalog (checkId → severity/automationLevel/description). */
export const getChecks = async (_req: Request, res: Response) => {
  sendSuccess(res, RULE_REGISTRY);
};

/**
 * Growth recommendations for a run (defaults to the latest completed run).
 * Recommend-only — this never changes production SEO.
 */
export const getRecommendations = async (req: Request, res: Response) => {
  const report = await getRecommendationsReport(str(req.query.runId));
  if (!report) return res.status(404).json({ success: false, statusCode: 404, message: 'No completed audit run found' });
  return sendSuccess(res, report);
};

const REVIEW_STATUSES: RecommendationReviewStatus[] = ['pending', 'approved', 'rejected', 'needs_changes'];
const REVIEW_NOTE_MAX_LENGTH = 5000;

/**
 * Phase 5.1 — human review of a recommendation. REVIEW ONLY: this never
 * publishes, executes, or otherwise touches production SEO content — it only
 * records an admin's approve/reject/needs-changes/pending decision, kept
 * independent from the open/resolved opportunity lifecycle. Only OPEN
 * recommendations may be reviewed, addressed by the persisted Mongo `_id`.
 */
export const reviewRecommendation = async (req: Request, res: Response) => {
  const id = str(req.params.id) ?? '';
  const reviewStatus = req.body?.reviewStatus as RecommendationReviewStatus | undefined;

  if (!reviewStatus || !REVIEW_STATUSES.includes(reviewStatus)) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: `reviewStatus is required and must be one of: ${REVIEW_STATUSES.join(', ')}`,
    });
  }

  const rawNote = req.body?.reviewNote;
  if (rawNote != null && typeof rawNote !== 'string') {
    return res.status(400).json({ success: false, statusCode: 400, message: 'reviewNote must be a string' });
  }
  const trimmedNote = typeof rawNote === 'string' ? rawNote.trim() : '';
  if (trimmedNote.length > REVIEW_NOTE_MAX_LENGTH) {
    return res
      .status(400)
      .json({ success: false, statusCode: 400, message: `reviewNote must be ${REVIEW_NOTE_MAX_LENGTH} characters or fewer` });
  }

  if ((reviewStatus === 'rejected' || reviewStatus === 'needs_changes') && !trimmedNote) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: `A reviewNote is required when marking a recommendation as ${reviewStatus}`,
    });
  }

  const updated = await updateRecommendationReview({
    id,
    reviewStatus,
    reviewNote: trimmedNote || null,
    reviewedBy: req.user!.userId,
  });

  if (!updated) {
    return res.status(404).json({ success: false, statusCode: 404, message: 'Open recommendation not found' });
  }

  return sendSuccess(res, toRecommendationView(updated, String(updated.lastSeenRunId)), 'Review updated');
};

/**
 * Phase 5.2 — generate a new structured change-draft for an approved, OPEN
 * recommendation. GENERATION ONLY: this never publishes, mutates, or executes
 * any SEO change — it only persists a reviewable proposal document. Approval
 * eligibility is re-checked server-side; nothing about the frontend's state
 * is trusted. Regenerating supersedes the recommendation's previous active
 * draft(s) rather than overwriting them (audit history is preserved).
 */
export const generateRecommendationDraft = async (req: Request, res: Response) => {
  const id = str(req.params.id) ?? '';
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'Invalid recommendation id' });
  }

  const result = await generateChangeDraft({ recommendationId: id, generatedBy: req.user!.userId });
  if (!result.ok) {
    const statusCode = result.error === 'not_found' ? 404 : 409;
    return res.status(statusCode).json({ success: false, statusCode, message: result.message });
  }
  return sendSuccess(res, toChangeDraftView(result.draft), 'Draft generated', 201);
};

/** Draft history for one recommendation, newest first. */
export const getRecommendationDraftHistory = async (req: Request, res: Response) => {
  const id = str(req.params.id) ?? '';
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'Invalid recommendation id' });
  }
  if (!(await recommendationExists(id))) {
    return res.status(404).json({ success: false, statusCode: 404, message: 'Recommendation not found' });
  }
  const drafts = await listChangeDrafts(id);
  return sendSuccess(res, (drafts ?? []).map(toChangeDraftView));
};

/** A single change draft by its own id. */
export const getChangeDraft = async (req: Request, res: Response) => {
  const draftId = str(req.params.draftId) ?? '';
  if (!mongoose.isValidObjectId(draftId)) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'Invalid draft id' });
  }
  const draft = await getChangeDraftById(draftId);
  if (!draft) return res.status(404).json({ success: false, statusCode: 404, message: 'Draft not found' });
  return sendSuccess(res, toChangeDraftView(draft));
};

/**
 * Phase 5.3 — controlled execution. This is the ONLY endpoint in the SEO module
 * that mutates production content. It MUTATES the live CMS page's
 * metaTitle/metaDescription for one approved, valid, metadata-only draft —
 * after re-checking every eligibility rule server-side. The draft/recommendation
 * documents in Mongo are the sole source of truth: nothing from the request
 * body is used as SEO input, so a caller cannot spoof the executor or the
 * proposed values.
 */
export const executeChangeDraft = async (req: Request, res: Response) => {
  const draftId = str(req.params.draftId) ?? '';
  const result = await executeApprovedChangeDraft({ draftId, executorUserId: req.user!.userId });
  if (!result.ok) {
    const statusByError: Record<string, number> = {
      invalid_id: 400,
      not_found: 404,
      recommendation_not_found: 404,
      target_not_found: 404,
    };
    const statusCode = statusByError[result.error] ?? 409;
    return res.status(statusCode).json({ success: false, statusCode, message: result.message });
  }
  return sendSuccess(res, toExecutionView(result.execution), 'Change executed', 201);
};

/** Execution history for one draft, newest first. */
export const getChangeDraftExecutions = async (req: Request, res: Response) => {
  const draftId = str(req.params.draftId) ?? '';
  if (!mongoose.isValidObjectId(draftId)) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'Invalid draft id' });
  }
  const executions = await listExecutionsForDraft(draftId);
  return sendSuccess(res, (executions ?? []).map(toExecutionView));
};

/** A single execution record by its own id. */
export const getChangeExecution = async (req: Request, res: Response) => {
  const executionId = str(req.params.executionId) ?? '';
  if (!mongoose.isValidObjectId(executionId)) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'Invalid execution id' });
  }
  const execution = await getExecutionById(executionId);
  if (!execution) return res.status(404).json({ success: false, statusCode: 404, message: 'Execution not found' });
  return sendSuccess(res, toExecutionView(execution));
};

/**
 * GSC status/summary (Phase 4). Never returns credential material — only whether
 * GSC is configured and the latest sync's public rollups.
 */
export const getGscSummary = async (_req: Request, res: Response) => {
  const latest = gscConfig.enabled
    ? await GscSyncRun.findOne().sort({ createdAt: -1 }).lean().exec()
    : null;
  return sendSuccess(res, {
    enabled: gscConfig.enabled,
    siteConfigured: !!gscConfig.siteUrl,
    latestSync: latest
      ? {
          date: latest.createdAt,
          status: latest.status,
          dateRange: latest.dateRange,
          pageRows: latest.pageRowsUpserted,
          queryPageRows: latest.queryPageRowsUpserted,
          opportunities: latest.opportunitiesDetected,
          error: latest.error, // already sanitized at write time
        }
      : null,
  });
};

/** Manually trigger a GSC sync (admin). Guards against concurrent runs. */
export const triggerGscSync = async (_req: Request, res: Response) => {
  if (!gscConfig.enabled) {
    return res.status(400).json({ success: false, statusCode: 400, message: 'GSC is not configured' });
  }
  const running = await GscSyncRun.findOne({ status: 'running' }).exec();
  if (running) {
    return res.status(409).json({ success: false, statusCode: 409, message: 'A GSC sync is already running', data: { runId: running._id } });
  }
  const job = await getGscSyncQueue().add(GSC_SYNC_JOB, { trigger: 'manual' }, { removeOnComplete: 30, removeOnFail: 30 });
  return sendSuccess(res, { queued: true, jobId: job.id }, 'GSC sync enqueued', 202);
};
