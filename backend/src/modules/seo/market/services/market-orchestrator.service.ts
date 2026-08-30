import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { marketConfig } from '../market.config';
import { MarketOpportunityDraft } from '../market.types';
import { IEvaluationSnapshot } from '../models/search-market-run.model';

/**
 * Search Market Orchestrator — pure, testable primitives (4b.7, FROZEN
 * design). The DB/provider-integrated sequencing (stages A–N) composes these
 * primitives with the existing 4b.1–4b.6 pure functions and the 4b.7
 * lock/cost-reservation/freshness/cluster-identity services; those pure
 * primitives are what is unit-tested in isolation here, since they carry the
 * actual safety-critical logic (deterministic selection, hashing, dedup).
 */

// ── §17/18 — deterministic, content-only evaluationSnapshot hash ──
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function computeSnapshotHash(input: {
  draftFingerprints: string[];
  drafts: MarketOpportunityDraft[];
  evaluationOutcome: 'completed' | 'degraded';
  allowResolution: boolean;
  degradationReasons: string[];
}): string {
  const canonicalDrafts = [...input.drafts]
    .map((d) => ({ ...d, affectedUrls: [...d.affectedUrls].sort() }))
    .sort((a, b) => a.recommendationId.localeCompare(b.recommendationId) || a.discriminator.localeCompare(b.discriminator));
  const payload = canonicalize({
    draftFingerprints: [...input.draftFingerprints].sort(),
    drafts: canonicalDrafts,
    evaluationOutcome: input.evaluationOutcome,
    allowResolution: input.allowResolution,
    degradationReasons: [...input.degradationReasons].sort(),
    scoringConfigVersion: marketConfig.opportunity.scoringConfigVersion,
  });
  // NOTE: deliberately excludes generatedAt/any timestamp — identical content hashes identically regardless of when computed.
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildEvaluationSnapshot(
  drafts: MarketOpportunityDraft[],
  evaluationOutcome: 'completed' | 'degraded',
  degradationReasons: string[],
  version = 1,
): IEvaluationSnapshot {
  const draftFingerprints = drafts.map((d) => `${d.recommendationId}::reco::${d.discriminator}`).sort();
  const allowResolution = evaluationOutcome === 'completed'; // structural invariant — never computed any other way
  return {
    version,
    generatedAt: new Date(),
    draftFingerprints,
    draftCount: drafts.length,
    snapshotHash: computeSnapshotHash({ draftFingerprints, drafts, evaluationOutcome, allowResolution, degradationReasons }),
    drafts: drafts as unknown as Record<string, unknown>[],
    evaluationOutcome,
    allowResolution,
    degradationReasons,
  };
}

// ── §12/13 — deterministic, pair-aware, cap-respecting SERP candidate selection ──
export interface SerpCandidateUnit {
  reason: 'cannibalization-disambiguation' | 'borderline-clustering' | 'priority-revalidation';
  keywordA: string;
  keywordB: string | null;
  /** lower = closer to the clustering threshold (more likely to flip); only meaningful for 'borderline-clustering'. */
  thresholdDistance?: number;
  knownVolume?: number | null;
  businessRelevanceScore?: number;
}

const REASON_RANK: Record<SerpCandidateUnit['reason'], number> = {
  'cannibalization-disambiguation': 0,
  'borderline-clustering': 1,
  'priority-revalidation': 2,
};

function rankCandidates(candidates: SerpCandidateUnit[]): SerpCandidateUnit[] {
  return [...candidates].sort((a, b) => {
    if (REASON_RANK[a.reason] !== REASON_RANK[b.reason]) return REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (a.reason === 'borderline-clustering') {
      const da = a.thresholdDistance ?? Infinity;
      const db = b.thresholdDistance ?? Infinity;
      if (da !== db) return da - db;
    }
    if (a.reason === 'priority-revalidation') {
      const va = a.knownVolume ?? -Infinity;
      const vb = b.knownVolume ?? -Infinity;
      if (va !== vb) return vb - va;
    }
    const ra = a.businessRelevanceScore ?? -Infinity;
    const rb = b.businessRelevanceScore ?? -Infinity;
    if (ra !== rb) return rb - ra;
    return a.keywordA.localeCompare(b.keywordA);
  });
}

export interface SerpSelectionResult {
  keywordsToFetch: string[]; // deduped, deterministic
  admittedCandidates: SerpCandidateUnit[];
  skippedCandidates: SerpCandidateUnit[];
}

/**
 * Never fetches only one side of a pair. Never exceeds `maxCalls` incremental
 * physical requests. Continues scanning past an oversized candidate rather
 * than stopping selection entirely (greedy-fit-continue).
 */
export function selectSerpCandidates(candidates: SerpCandidateUnit[], isAlreadyCached: (keyword: string) => boolean, maxCalls = marketConfig.orchestrator.maxSerpCallsPerRun): SerpSelectionResult {
  const ranked = rankCandidates(candidates);
  const staged = new Set<string>(); // keywords already committed to a fetch this pass
  const admitted: SerpCandidateUnit[] = [];
  const skipped: SerpCandidateUnit[] = [];
  let used = 0;

  const needsFetch = (kw: string) => !isAlreadyCached(kw) && !staged.has(kw);

  for (const c of ranked) {
    const sides = [c.keywordA, ...(c.keywordB ? [c.keywordB] : [])];
    const incremental = sides.filter(needsFetch).length;
    if (used + incremental > maxCalls) {
      skipped.push(c);
      continue; // greedy-fit-continue — a later, smaller candidate may still fit
    }
    for (const kw of sides) if (needsFetch(kw)) staged.add(kw);
    used += incremental;
    admitted.push(c);
  }

  return { keywordsToFetch: [...staged].sort(), admittedCandidates: admitted, skippedCandidates: skipped };
}

// ── §5/6 — plan fingerprint (staleness detection for pending-approval resume) ──
export function computePlanFingerprint(input: { plannedDiscoveryTaskCount: number; plannedSerpRequestCount: number; estimatedCostUsd: number; pricingVersion: string; evidenceFreshnessSnapshotAt: Date }): string {
  const payload = canonicalize({
    plannedDiscoveryTaskCount: input.plannedDiscoveryTaskCount,
    plannedSerpRequestCount: input.plannedSerpRequestCount,
    estimatedCostUsd: input.estimatedCostUsd,
    pricingVersion: input.pricingVersion,
    // evidenceFreshnessSnapshotAt intentionally included at day granularity — a
    // plan is considered materially unchanged within the same freshness check.
    evidenceFreshnessDay: input.evidenceFreshnessSnapshotAt.toISOString().slice(0, 10),
  });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// ── §2/6 — authorization ceiling helpers (pure math, reused by the reservation service's design) ──
export function computeApprovedCostUsd(currentCostActualUsd: number, approvedAdditionalCostUsd: number): number {
  return Math.round((currentCostActualUsd + approvedAdditionalCostUsd) * 1e6) / 1e6;
}

export type MarketRunId = mongoose.Types.ObjectId;
