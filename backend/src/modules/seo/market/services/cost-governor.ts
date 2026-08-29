import { marketConfig } from '../market.config';
import { CostEstimate } from '../market.types';
import { SearchMarketRun } from '../models/search-market-run.model';

/**
 * Agent SPENDING GOVERNOR. Enforces the agent's own spending permission — which is
 * distinct from any provider account balance/deposit. Rules (refinement 8):
 *  - UNKNOWN cost is NEVER free: per config it requires approval or refuses.
 *  - projected month spend (month-to-date + this run) is checked BEFORE execution.
 *  - deterministic accounting period = the calendar month in UTC.
 *  - estimated vs actual spend are tracked separately (see SearchMarketRun).
 */

export interface CostDecision {
  allowed: boolean; // false = refuse (hard cap / unknown+refuse)
  needsApproval: boolean; // true = may run only after manual approval
  reason: string;
  estimateUsd: number | null; // null = UNKNOWN
  monthToDateUsd: number;
  projectedMonthUsd: number | null; // null when estimate UNKNOWN
}

/** UTC calendar-month key, e.g. "2026-08". Deterministic accounting boundary. */
export function utcMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Pure decision — the unit-tested core. `monthToDateUsd` is the actual spend so far this UTC month. */
export function assessRunCost(estimate: CostEstimate, monthToDateUsd: number): CostDecision {
  const c = marketConfig.cost;
  const base = { monthToDateUsd, estimateUsd: estimate.usd };

  // 1) UNKNOWN cost — never free.
  if (estimate.unknown || estimate.usd === null) {
    if (c.onUnknownCost === 'refuse') {
      return { ...base, allowed: false, needsApproval: false, projectedMonthUsd: null, reason: 'cost UNKNOWN and policy=refuse' };
    }
    return { ...base, allowed: true, needsApproval: true, projectedMonthUsd: null, reason: 'cost UNKNOWN and policy=approve → manual approval required' };
  }

  const usd = estimate.usd;
  const projected = Math.round((monthToDateUsd + usd) * 100) / 100;

  // 2) Per-run hard cap.
  if (usd > c.perRunHardCapUsd) {
    return { ...base, allowed: false, needsApproval: false, projectedMonthUsd: projected, reason: `estimate $${usd} exceeds per-run cap $${c.perRunHardCapUsd}` };
  }
  // 3) Monthly hard cap (projected).
  if (projected > c.monthlyHardCapUsd) {
    return { ...base, allowed: false, needsApproval: false, projectedMonthUsd: projected, reason: `projected month spend $${projected} exceeds monthly cap $${c.monthlyHardCapUsd} (MTD $${monthToDateUsd})` };
  }
  // 4) Manual-approval threshold.
  if (usd > c.manualApprovalUsd) {
    return { ...base, allowed: true, needsApproval: true, projectedMonthUsd: projected, reason: `estimate $${usd} exceeds approval threshold $${c.manualApprovalUsd} → manual approval required` };
  }
  // 5) Clear to run.
  return { ...base, allowed: true, needsApproval: false, projectedMonthUsd: projected, reason: `within limits (estimate $${usd}, projected month $${projected})` };
}

/** Actual USD spent this UTC month (sum of run costActualUsd). estimated ≠ actual. */
export async function monthToDateSpendUsd(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await SearchMarketRun.aggregate([
    { $match: { createdAt: { $gte: start } } },
    { $group: { _id: null, total: { $sum: '$costActualUsd' } } },
  ]);
  return Math.round((rows[0]?.total ?? 0) * 100) / 100;
}

/** Convenience: assess a proposed run against live month-to-date spend. */
export async function assessRun(estimate: CostEstimate): Promise<CostDecision> {
  return assessRunCost(estimate, await monthToDateSpendUsd());
}
