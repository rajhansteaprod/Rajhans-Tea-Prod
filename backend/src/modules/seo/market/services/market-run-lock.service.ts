import mongoose from 'mongoose';
import { SearchMarketLock, SEARCH_MARKET_LOCK_ID } from '../models/search-market-lock.model';
import { marketConfig } from '../market.config';

/**
 * Atomic single-flight lock + periodic lease heartbeat (4b.7, FROZEN design).
 * No BullMQ worker exists in this phase, so this is the sole concurrency
 * guard — a real compare-and-swap on one singleton document, never a
 * find-then-create sequence.
 */

function staleThreshold(now = new Date()): Date {
  return new Date(now.getTime() - marketConfig.orchestrator.staleRunTimeoutMinutes * 60 * 1000);
}

/** Atomically acquire the lock for `runId`, or reclaim it if the current owner's lease has gone stale. */
export async function acquireOrReclaimLock(runId: mongoose.Types.ObjectId, now = new Date()): Promise<boolean> {
  const updated = await SearchMarketLock.findOneAndUpdate(
    { _id: SEARCH_MARKET_LOCK_ID, $or: [{ ownerRunId: null }, { heartbeatAt: { $lt: staleThreshold(now) } }] },
    { $set: { ownerRunId: runId, acquiredAt: now, heartbeatAt: now } },
    { upsert: true, new: true },
  ).exec();
  return !!updated && updated.ownerRunId?.equals(runId) === true;
}

/** Owner-checked heartbeat refresh. Returns false if this run no longer owns the lock. */
export async function refreshHeartbeat(runId: mongoose.Types.ObjectId, now = new Date()): Promise<boolean> {
  const result = await SearchMarketLock.updateOne({ _id: SEARCH_MARKET_LOCK_ID, ownerRunId: runId }, { $set: { heartbeatAt: now } }).exec();
  return result.matchedCount > 0;
}

/** Owner-checked release. Never releases another run's lock. */
export async function releaseLock(runId: mongoose.Types.ObjectId): Promise<boolean> {
  const result = await SearchMarketLock.updateOne(
    { _id: SEARCH_MARKET_LOCK_ID, ownerRunId: runId },
    { $set: { ownerRunId: null, acquiredAt: null, heartbeatAt: null } },
  ).exec();
  return result.matchedCount > 0;
}

export interface LeaseHandle {
  stop(): void;
}

/**
 * Starts the periodic lease timer — the PRIMARY stale-lock protection, running
 * independently of any provider request's lifecycle. `onOwnershipLost` fires
 * (at most once) the first time an owner-checked refresh reports this run no
 * longer owns the lock — the caller must stop issuing new paid attempts/
 * recommendation mutations and enter safe recovery handling.
 */
export function startHeartbeatLease(runId: mongoose.Types.ObjectId, onOwnershipLost: () => void): LeaseHandle {
  let stopped = false;
  let lostNotified = false;
  const intervalMs = marketConfig.orchestrator.lockHeartbeatIntervalSeconds * 1000;
  const timer = setInterval(() => {
    if (stopped) return;
    refreshHeartbeat(runId)
      .then((stillOwner) => {
        if (!stillOwner && !lostNotified && !stopped) {
          lostNotified = true;
          onOwnershipLost();
        }
      })
      .catch(() => {
        /* transient DB error on a heartbeat tick — next tick retries; do not treat as ownership loss */
      });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref(); // never keeps the process alive on its own
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
