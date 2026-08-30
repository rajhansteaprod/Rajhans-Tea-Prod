import mongoose from 'mongoose';

interface FakeLock {
  _id: string;
  ownerRunId: mongoose.Types.ObjectId | null;
  acquiredAt: Date | null;
  heartbeatAt: Date | null;
}

let lock: FakeLock = { _id: 'singleton', ownerRunId: null, acquiredAt: null, heartbeatAt: null };

jest.mock('../../../src/modules/seo/market/models/search-market-lock.model', () => ({
  SEARCH_MARKET_LOCK_ID: 'singleton',
  SearchMarketLock: {
    findOneAndUpdate: jest.fn((filter: { ownerRunId?: unknown; $or?: { ownerRunId?: null; heartbeatAt?: { $lt: Date } }[] }, update: { $set: Record<string, unknown> }) => ({
      exec: async () => {
        const matches = filter.$or
          ? filter.$or.some((clause) => ('ownerRunId' in clause ? lock.ownerRunId === null : lock.heartbeatAt !== null && lock.heartbeatAt < (clause.heartbeatAt as { $lt: Date }).$lt))
          : true;
        if (!matches) return null;
        Object.assign(lock, update.$set);
        return { ...lock };
      },
    })),
    updateOne: jest.fn((filter: { ownerRunId: mongoose.Types.ObjectId }, update: { $set: Record<string, unknown> }) => ({
      exec: async () => {
        const matched = lock.ownerRunId !== null && lock.ownerRunId.equals(filter.ownerRunId);
        if (matched) Object.assign(lock, update.$set);
        return { matchedCount: matched ? 1 : 0 };
      },
    })),
  },
}));

import { acquireOrReclaimLock, refreshHeartbeat, releaseLock, startHeartbeatLease } from '../../../src/modules/seo/market/services/market-run-lock.service';

beforeEach(() => {
  lock = { _id: 'singleton', ownerRunId: null, acquiredAt: null, heartbeatAt: null };
});

describe('acquireOrReclaimLock', () => {
  it('acquires an unowned lock', async () => {
    const runId = new mongoose.Types.ObjectId();
    expect(await acquireOrReclaimLock(runId)).toBe(true);
    expect(lock.ownerRunId?.equals(runId)).toBe(true);
  });

  it('refuses to acquire an actively-held, non-stale lock', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    const other = new mongoose.Types.ObjectId();
    expect(await acquireOrReclaimLock(other)).toBe(false);
    expect(lock.ownerRunId?.equals(owner)).toBe(true);
  });

  it('reclaims a lock whose heartbeat has gone stale', async () => {
    const owner = new mongoose.Types.ObjectId();
    lock = { _id: 'singleton', ownerRunId: owner, acquiredAt: new Date(0), heartbeatAt: new Date(0) }; // ancient heartbeat
    const other = new mongoose.Types.ObjectId();
    expect(await acquireOrReclaimLock(other)).toBe(true);
    expect(lock.ownerRunId?.equals(other)).toBe(true);
  });
});

describe('refreshHeartbeat / releaseLock — owner-checked', () => {
  it('refreshHeartbeat succeeds only for the current owner', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    expect(await refreshHeartbeat(owner)).toBe(true);
    const impostor = new mongoose.Types.ObjectId();
    expect(await refreshHeartbeat(impostor)).toBe(false);
  });

  it('releaseLock only succeeds for the current owner — never releases another run\'s lock', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    const impostor = new mongoose.Types.ObjectId();
    expect(await releaseLock(impostor)).toBe(false);
    expect(lock.ownerRunId?.equals(owner)).toBe(true); // untouched
    expect(await releaseLock(owner)).toBe(true);
    expect(lock.ownerRunId).toBeNull();
  });
});

describe('startHeartbeatLease', () => {
  jest.useFakeTimers();

  it('periodically refreshes the heartbeat without any external event', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    const onLost = jest.fn();
    const lease = startHeartbeatLease(owner, onLost);
    const before = lock.heartbeatAt;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(lock.heartbeatAt).not.toBe(before);
    expect(onLost).not.toHaveBeenCalled();
    lease.stop();
  });

  it('notifies ownership loss when another process has reclaimed the lock, and stops issuing further calls after stop()', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    const onLost = jest.fn();
    const lease = startHeartbeatLease(owner, onLost);
    // Simulate another process stealing the lock (owner-checked update will now fail for `owner`).
    lock.ownerRunId = new mongoose.Types.ObjectId();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(onLost).toHaveBeenCalledTimes(1);
    const callsAfterLoss = onLost.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(onLost.mock.calls.length).toBe(callsAfterLoss); // fires at most once
    lease.stop();
  });

  it('stop() leaves no active timer (no leak)', async () => {
    const owner = new mongoose.Types.ObjectId();
    await acquireOrReclaimLock(owner);
    const onLost = jest.fn();
    const lease = startHeartbeatLease(owner, onLost);
    lease.stop();
    const before = lock.heartbeatAt;
    await jest.advanceTimersByTimeAsync(600_000);
    expect(lock.heartbeatAt).toBe(before); // no further ticks after stop
  });

  afterAll(() => jest.useRealTimers());
});
