import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { SeoAuditRun } from './models/seo-audit-run.model';
import { getSeoAuditQueue, SEO_RUN_JOB } from './jobs/queues/seo-audit.queue';
import { listRuns, getReport, getRunIssues } from './services/report.service';
import { getRecommendationsReport } from './services/recommendation.service';
import { RULE_REGISTRY } from './services/rules';
import { RunScope } from './seo.types';

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
