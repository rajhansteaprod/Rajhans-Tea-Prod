import mongoose from 'mongoose';
import { marketConfig } from '../market.config';
import { SearchMarketRun } from '../models/search-market-run.model';
import { monthToDateSpendUsd } from './cost-governor';

/**
 * Crash-safe, concurrency-safe physical-attempt cost reservation (4b.7, FROZEN
 * design). Durably reserves cost on `SearchMarketRun.costActualUsd` via an
 * atomic conditional `$inc` BEFORE the physical HTTP attempt — a crash between
 * reservation and transmission conservatively overcounts, which is accepted.
 *
 * `authorizationMode === null` reserves NOTHING — only a `--confirm`
 * (ceiling $0.50) or `--approve`d run (ceiling `approvedCostUsd`, an ABSOLUTE
 * cumulative ceiling, not a remaining-work amount) may reserve.
 *
 * SERP HTTP calls may run concurrently (bounded concurrency, 4b.5); only the
 * tiny read-check-write reservation critical section is serialized per run,
 * via an in-process FIFO mutex — `SearchMarketLock` already guarantees only
 * one run/process is active, so no cross-process locking is needed here.
 */

export interface ReservationResult {
  allowed: boolean;
  reason: string;
}

// One FIFO queue per active runId — bounds the serialized critical section to
// concurrent attempts WITHIN the same run, never blocking unrelated work.
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prior = queues.get(runId) ?? Promise.resolve();
  const next = prior.then(fn, fn); // run fn regardless of the prior task's outcome
  queues.set(
    runId,
    next.catch(() => undefined),
  );
  return next;
}

/** Test-only: drop a run's queue so tests don't leak state across cases. */
export function __resetReservationQueueForTests(runId?: mongoose.Types.ObjectId | string): void {
  if (runId) queues.delete(String(runId));
  else queues.clear();
}

export async function reserveAttemptCost(runId: mongoose.Types.ObjectId, attemptEstimateUsd: number): Promise<ReservationResult> {
  return enqueue(String(runId), async () => {
    const run = await SearchMarketRun.findById(runId).select('costActualUsd authorizationMode approvedCostUsd').lean().exec();
    if (!run) return { allowed: false, reason: 'run not found' };

    if (run.authorizationMode === null) {
      return { allowed: false, reason: 'run-not-authorized' };
    }

    let ceiling: number;
    if (run.authorizationMode === 'confirm-under-threshold') {
      ceiling = marketConfig.cost.manualApprovalUsd; // 0.50 — the --confirm cumulative ceiling
    } else {
      // 'manual-approval'
      if (run.approvedCostUsd == null) {
        return { allowed: false, reason: 'manual-approval mode with no approvedCostUsd — invalid state' };
      }
      ceiling = run.approvedCostUsd;
    }

    const projectedRun = run.costActualUsd + attemptEstimateUsd;
    // monthToDateSpendUsd() already includes this run's own prior reservations
    // (it aggregates ALL SearchMarketRun docs, unfiltered by status) — never add
    // currentRun.costActualUsd to it again.
    const projectedMtd = (await monthToDateSpendUsd()) + attemptEstimateUsd;

    if (projectedRun > ceiling) return { allowed: false, reason: `projected run cost $${projectedRun} exceeds authorization ceiling $${ceiling}` };
    if (projectedRun > marketConfig.cost.perRunHardCapUsd) return { allowed: false, reason: `projected run cost $${projectedRun} exceeds per-run hard cap $${marketConfig.cost.perRunHardCapUsd}` };
    if (projectedMtd > marketConfig.cost.monthlyHardCapUsd) return { allowed: false, reason: `projected month spend $${projectedMtd} exceeds monthly hard cap $${marketConfig.cost.monthlyHardCapUsd}` };

    const updated = await SearchMarketRun.findOneAndUpdate(
      { _id: runId, costActualUsd: { $lte: ceiling - attemptEstimateUsd } },
      { $inc: { costActualUsd: attemptEstimateUsd } },
      { new: true },
    ).exec();
    if (!updated) return { allowed: false, reason: 'race-lost (concurrent reservation exhausted the ceiling)' };

    return { allowed: true, reason: 'reserved' };
  });
}
