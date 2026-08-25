import mongoose from 'mongoose';
import { SeoIssue } from '../models/seo-issue.model';
import { DetectedIssue } from '../seo.types';
import { fingerprint } from '../seo.util';

export interface DiffResult {
  counts: { critical: number; warning: number; info: number };
  delta: { new: number; resolved: number; regressions: number };
  newIssues: DetectedIssue[];
  resolvedFingerprints: string[];
  regressionFingerprints: string[];
}

/**
 * Reconcile this run's detected issues against the persistent issue set.
 *
 * Baseline-aware: on the first-ever run (`isBaseline`), issues are simply
 * recorded as open with NEW/RESOLVED/REGRESSION all zero — existing problems are
 * never mislabeled as regressions.
 *
 * Coverage-gated: an open issue is only marked RESOLVED when its URL was actually
 * fetched successfully this run. If we didn't/couldn't check the URL, its issue
 * is left open (false-positive protection — never "resolve" what we didn't see).
 */
export async function diffAndPersist(opts: {
  runId: mongoose.Types.ObjectId;
  isBaseline: boolean;
  /** False on baseline OR degraded runs — never resolve issues we can't trust. */
  allowResolution: boolean;
  detectedIssues: DetectedIssue[];
  fetchedNormalizedUrls: Set<string>;
  /**
   * Every URL the run DISCOVERED (attempted), regardless of fetch outcome. An
   * open issue whose URL is no longer discovered at all — e.g. a legacy page slug
   * now collapsed onto its canonical, or a deleted product — is out of scope and
   * is resolved (it can't recur). Defaults to fetchedNormalizedUrls when omitted.
   */
  discoveredNormalizedUrls?: Set<string>;
}): Promise<DiffResult> {
  const { runId, isBaseline, allowResolution, detectedIssues, fetchedNormalizedUrls } = opts;
  const discoveredNormalizedUrls = opts.discoveredNormalizedUrls ?? fetchedNormalizedUrls;

  // Dedupe detected by fingerprint. The discriminator (empty for page-level
  // checks) lets a cross-page check emit several independent findings on one page
  // (one per target/image) without them colliding onto a single fingerprint.
  const detected = new Map<string, DetectedIssue>();
  for (const iss of detectedIssues) {
    detected.set(fingerprint(iss.normalizedUrl, iss.checkId, iss.discriminator ?? ''), iss);
  }

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const iss of detected.values()) counts[iss.severity]++;

  const newIssues: DetectedIssue[] = [];
  const regressionFingerprints: string[] = [];
  const resolvedFingerprints: string[] = [];

  // ── Upsert every detected issue ──
  for (const [fp, iss] of detected) {
    const existing = await SeoIssue.findOne({ fingerprint: fp }).exec();
    if (!existing) {
      await SeoIssue.create({
        fingerprint: fp,
        checkId: iss.checkId,
        severity: iss.severity,
        url: iss.url,
        normalizedUrl: iss.normalizedUrl,
        explanation: iss.explanation,
        evidence: iss.evidence,
        automationLevel: iss.automationLevel,
        recommendation: null,
        status: 'open',
        firstSeenRunId: runId,
        lastSeenRunId: runId,
      });
      if (!isBaseline) newIssues.push(iss);
    } else {
      const wasResolved = existing.status === 'resolved';
      existing.severity = iss.severity;
      existing.explanation = iss.explanation;
      // Preserve the prior observed value so regressions can explain the delta.
      if (wasResolved) {
        existing.evidence = { ...iss.evidence, previousValue: existing.evidence?.actual };
        existing.status = 'open';
        existing.resolvedRunId = null;
        existing.regressionCount = (existing.regressionCount || 0) + 1;
        existing.lastRegressionRunId = runId;
        if (!isBaseline) regressionFingerprints.push(fp);
      } else {
        existing.evidence = iss.evidence;
      }
      existing.lastSeenRunId = runId;
      await existing.save();
    }
  }

  // ── Resolve open issues not seen this run (coverage-gated) ──
  if (allowResolution) {
    const openIssues = await SeoIssue.find({ status: 'open' }).exec();
    for (const open of openIssues) {
      const fp = open.fingerprint;
      if (detected.has(fp)) continue; // still present
      // Keep an IN-SCOPE issue we simply couldn't fetch this run (transient) —
      // never resolve what we didn't actually re-check. But if the URL is no
      // longer discovered at all (out of scope), the issue is stale → resolve it.
      const inScope = discoveredNormalizedUrls.has(open.normalizedUrl);
      if (inScope && !fetchedNormalizedUrls.has(open.normalizedUrl)) continue;
      open.status = 'resolved';
      open.resolvedRunId = runId;
      open.lastSeenRunId = runId;
      await open.save();
      resolvedFingerprints.push(fp);
    }
  }

  return {
    counts,
    delta: {
      new: newIssues.length,
      resolved: resolvedFingerprints.length,
      regressions: regressionFingerprints.length,
    },
    newIssues,
    resolvedFingerprints,
    regressionFingerprints,
  };
}
