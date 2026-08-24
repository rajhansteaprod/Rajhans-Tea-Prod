import mongoose, { Document, Schema } from 'mongoose';
import { AutomationLevel, IssueStatus, Severity, SeoIssueEvidence } from '../seo.types';

/**
 * A persistent SEO finding, keyed by `fingerprint` so its lifecycle (open →
 * resolved → possibly reopened=regression) and history (first/last seen) span
 * runs. This document — not a per-run row — is what makes NEW / RESOLVED /
 * REGRESSION a set operation across audits.
 */
export interface ISeoIssueDoc extends Document {
  fingerprint: string; // hash(normalizedUrl + checkId + discriminator)
  checkId: string;
  severity: Severity;
  url: string;
  normalizedUrl: string;
  explanation: string;
  evidence: SeoIssueEvidence;
  automationLevel: AutomationLevel; // 'observe' in Phase 2a
  recommendation: unknown | null; // reserved for Phase 3 — always null now
  status: IssueStatus;
  firstSeenRunId: mongoose.Types.ObjectId;
  lastSeenRunId: mongoose.Types.ObjectId;
  resolvedRunId: mongoose.Types.ObjectId | null;
  /** Count of resolve→reopen transitions — a nonzero value means regressions. */
  regressionCount: number;
  /** The run that most recently reopened this issue (regression attribution). */
  lastRegressionRunId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const seoIssueSchema = new Schema<ISeoIssueDoc>(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    checkId: { type: String, required: true, index: true },
    severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true, index: true },
    explanation: { type: String, default: '' },
    evidence: { type: Schema.Types.Mixed, default: {} },
    automationLevel: {
      type: String,
      enum: ['observe', 'recommend', 'auto'],
      default: 'observe',
    },
    recommendation: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    firstSeenRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', required: true },
    lastSeenRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', required: true },
    resolvedRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', default: null },
    regressionCount: { type: Number, default: 0 },
    lastRegressionRunId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', default: null },
  },
  { timestamps: true },
);

seoIssueSchema.index({ status: 1, severity: 1 });
seoIssueSchema.index({ lastSeenRunId: 1 });

export const SeoIssue = mongoose.model<ISeoIssueDoc>('SeoIssue', seoIssueSchema);
