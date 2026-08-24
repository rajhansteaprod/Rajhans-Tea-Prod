import { SeoAuditRun } from '../models/seo-audit-run.model';
import { SeoIssue, ISeoIssueDoc } from '../models/seo-issue.model';

const idEq = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);

/** Map a persisted issue to the drill-down view (WHY / actual / expected / history). */
function toDrill(issue: ISeoIssueDoc, runId: string) {
  let previousState = 'open';
  let currentState = 'open';
  if (issue.status === 'resolved' && idEq(issue.resolvedRunId, runId)) {
    previousState = 'open';
    currentState = 'resolved';
  } else if (idEq(issue.firstSeenRunId, runId)) {
    previousState = 'absent';
    currentState = 'open (new)';
  } else if (idEq(issue.lastRegressionRunId, runId)) {
    previousState = 'resolved';
    currentState = 'open (regression)';
  }
  return {
    url: issue.url,
    checkId: issue.checkId,
    severity: issue.severity,
    status: issue.status,
    why: issue.explanation,
    actual: issue.evidence?.actual ?? null,
    expected: issue.evidence?.expected ?? null,
    evidence: issue.evidence,
    firstSeenRunId: issue.firstSeenRunId,
    lastSeenRunId: issue.lastSeenRunId,
    resolvedRunId: issue.resolvedRunId,
    regressionCount: issue.regressionCount,
    previousState,
    currentState,
    automationLevel: issue.automationLevel,
  };
}

export async function listRuns(limit = 20) {
  const runs = await SeoAuditRun.find().sort({ createdAt: -1 }).limit(limit).lean().exec();
  return runs.map((r) => ({
    id: String(r._id),
    date: r.createdAt,
    trigger: r.trigger,
    scope: r.scope,
    status: r.status,
    isBaseline: r.isBaseline,
    urlsDiscovered: r.urlsDiscovered,
    urlsFetched: r.urlsFetched,
    coverage: r.coverageRatio,
    counts: r.counts,
    delta: r.delta,
  }));
}

/** Full report for one run: the summary block + grouped, drill-down issues. */
export async function getReport(runId: string) {
  const run = await SeoAuditRun.findById(runId).lean().exec();
  if (!run) return null;

  const openThisRun = await SeoIssue.find({ lastSeenRunId: runId, status: 'open' }).exec();
  const resolvedThisRun = await SeoIssue.find({ resolvedRunId: runId, status: 'resolved' }).exec();

  const drillOpen = openThisRun.map((i) => toDrill(i, runId));
  const summary = {
    id: String(run._id),
    date: run.createdAt,
    status: run.status,
    isBaseline: run.isBaseline,
    urlsDiscovered: run.urlsDiscovered,
    urlsFetched: run.urlsFetched,
    coverage: run.coverageRatio,
    counts: run.counts,
    delta: run.delta,
    siteReachable: run.siteReachable,
    error: run.error,
  };

  return {
    summary,
    critical: drillOpen.filter((i) => i.severity === 'critical'),
    warning: drillOpen.filter((i) => i.severity === 'warning'),
    info: drillOpen.filter((i) => i.severity === 'info'),
    regressions: openThisRun
      .filter((i) => idEq(i.lastRegressionRunId, runId))
      .map((i) => toDrill(i, runId)),
    resolved: resolvedThisRun.map((i) => toDrill(i, runId)),
  };
}

/** Issues for a run with optional severity/status filters (drill-down list). */
export async function getRunIssues(runId: string, filter: { severity?: string; status?: string } = {}) {
  const q: Record<string, unknown> = {};
  if (filter.status === 'resolved') q.resolvedRunId = runId;
  else q.lastSeenRunId = runId;
  if (filter.severity) q.severity = filter.severity;
  if (filter.status) q.status = filter.status;
  const issues = await SeoIssue.find(q).exec();
  return issues.map((i) => toDrill(i, runId));
}
