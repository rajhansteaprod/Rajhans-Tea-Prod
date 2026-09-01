import { Request, Response } from 'express';
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
