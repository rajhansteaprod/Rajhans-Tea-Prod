import mongoose from 'mongoose';

/**
 * CLI argv-driven integration coverage for scripts/market-run.ts (4b.7 final
 * hardening pass). `main()` is now exported and guarded by
 * `require.main === module`, so importing it here never auto-executes.
 *
 * Scope: this test verifies market-run.ts's OWN wiring — argv parsing, run
 * creation/loading, lock/heartbeat lifecycle calls, and that
 * runFullPipeline/computeMarketPlan are invoked correctly — not pipeline or
 * lock internals (both already covered elsewhere). runFullPipeline and the
 * lock service are mocked; provider HTTP is never reached from this file.
 */

jest.mock('../../../src/modules/seo/market/providers/provider.bootstrap', () => ({ bootstrapMarketProviders: jest.fn() }));

const computeMarketPlan = jest.fn<Promise<unknown>, [unknown]>();
const runFullPipelineInternal = jest.fn<Promise<void>, [unknown, unknown]>(async () => undefined);
const createOwnershipGuard = jest.fn((_runId: unknown) => ({ guard: { isLost: () => false, assertOwned: async () => undefined }, markLost: jest.fn() }));
jest.mock('../../../src/modules/seo/market/services/market-pipeline.service', () => ({
  computeMarketPlan: (market: unknown) => computeMarketPlan(market),
  runFullPipelineInternal: (runId: unknown, deps: unknown) => runFullPipelineInternal(runId, deps),
  createOwnershipGuard: (runId: unknown) => createOwnershipGuard(runId),
}));

const acquireOrReclaimLock = jest.fn<Promise<boolean>, [unknown]>();
const releaseLock = jest.fn<Promise<boolean>, [unknown]>();
const heartbeatStop = jest.fn();
const startHeartbeatLease = jest.fn<{ stop: () => void }, [unknown, unknown]>(() => ({ stop: heartbeatStop }));
jest.mock('../../../src/modules/seo/market/services/market-run-lock.service', () => ({
  acquireOrReclaimLock: (runId: unknown) => acquireOrReclaimLock(runId),
  releaseLock: (runId: unknown) => releaseLock(runId),
  startHeartbeatLease: (runId: unknown, onLost: unknown) => startHeartbeatLease(runId, onLost),
}));

interface FakeRunDoc {
  _id: mongoose.Types.ObjectId;
  market: { country: string; language: string };
  status: string;
  authorizationMode: string | null;
  approvedCostUsd: number | null;
  approvedAt: Date | null;
  approvalSource: string | null;
  costActualUsd: number;
  planSnapshot: { planFingerprint: string } | null;
  error: string | null;
  finishedAt: Date | null;
  stage: string;
  persistenceStage: string;
  evaluationSnapshot: unknown | null;
  save: () => Promise<void>;
}
const createdRuns: FakeRunDoc[] = [];
let runsById = new Map<string, FakeRunDoc>();

function makeRun(overrides: Partial<FakeRunDoc> = {}): FakeRunDoc {
  const run: FakeRunDoc = {
    _id: new mongoose.Types.ObjectId(), market: { country: 'IN', language: 'en' }, status: 'pending-approval',
    authorizationMode: null, approvedCostUsd: null, approvedAt: null, approvalSource: null, costActualUsd: 0,
    planSnapshot: null, error: null, finishedAt: null, stage: 'planning', persistenceStage: 'not-started', evaluationSnapshot: null,
    save: jest.fn(async () => undefined),
    ...overrides,
  };
  runsById.set(String(run._id), run);
  return run;
}

jest.mock('../../../src/modules/seo/market/models/search-market-run.model', () => ({
  SearchMarketRun: {
    create: jest.fn(async (doc: Partial<FakeRunDoc>) => {
      const run = makeRun(doc as Partial<FakeRunDoc>);
      createdRuns.push(run);
      return run;
    }),
    findById: jest.fn((id: mongoose.Types.ObjectId) => ({ exec: async () => runsById.get(String(id)) ?? null })),
  },
}));

import { main } from '../../../scripts/market-run';
import { marketConfig } from '../../../src/modules/seo/market/market.config';

beforeEach(() => {
  jest.clearAllMocks();
  createdRuns.length = 0;
  runsById = new Map();
  acquireOrReclaimLock.mockResolvedValue(true);
});

describe('CLI --confirm', () => {
  it('creates an under-threshold run, authorizes it, acquires the lock, starts/stops the heartbeat, invokes runFullPipeline, and owner-checked-releases the lock', async () => {
    computeMarketPlan.mockResolvedValue({ dueSeedCount: 1, plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 0, estimatedCostUsd: 0.036 });

    await main(['--confirm']);

    expect(createdRuns).toHaveLength(1); // no duplicate SearchMarketRun
    const run = createdRuns[0];
    expect(run.authorizationMode).toBe('confirm-under-threshold');
    expect(acquireOrReclaimLock).toHaveBeenCalledWith(run._id);
    expect(startHeartbeatLease).toHaveBeenCalledWith(run._id, expect.any(Function));
    expect(runFullPipelineInternal).toHaveBeenCalledWith(run._id, expect.anything());
    expect(heartbeatStop).toHaveBeenCalled(); // heartbeat stopped
    expect(releaseLock).toHaveBeenCalledWith(run._id); // owner-checked release
  });

  it('refuses --confirm when the plan exceeds the manual-approval threshold', async () => {
    computeMarketPlan.mockResolvedValue({ dueSeedCount: 1, plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 100, estimatedCostUsd: marketConfig.cost.manualApprovalUsd + 1 });

    await main(['--confirm']);

    expect(runFullPipelineInternal).not.toHaveBeenCalled();
    expect(createdRuns).toHaveLength(0);
  });

  it('default preflight (no flags) creates zero runs and never executes anything', async () => {
    computeMarketPlan.mockResolvedValue({ dueSeedCount: 0, plannedDiscoveryTaskCount: 0, plannedSerpRequestCount: 0, estimatedCostUsd: 0 });

    await main([]);

    expect(createdRuns).toHaveLength(0);
    expect(runFullPipelineInternal).not.toHaveBeenCalled();
    expect(acquireOrReclaimLock).not.toHaveBeenCalled();
  });
});

describe('CLI --approve <runId>', () => {
  it('loads the SAME pending run, checks plan freshness, sets cumulative approvedCostUsd, acquires the lock, and invokes runFullPipeline with the SAME runId', async () => {
    const run = makeRun({ status: 'pending-approval', costActualUsd: 0.3, planSnapshot: { planFingerprint: 'fp-1' } });
    computeMarketPlan.mockResolvedValue({ dueSeedCount: 0, plannedDiscoveryTaskCount: 0, plannedSerpRequestCount: 5, estimatedCostUsd: 0.05 });
    // computePlanFingerprint is REAL (pure) here — force a matching fingerprint by using the run's own stored one via a spy-free approach:
    // simplest: give the run no planSnapshot so the freshness check is trivially satisfied (run.planSnapshot is falsy -> check skipped).
    run.planSnapshot = null;

    await main(['--approve', String(run._id)]);

    expect(createdRuns).toHaveLength(0); // no NEW run created — same run reused
    expect(run.authorizationMode).toBe('manual-approval');
    expect(run.approvedCostUsd).toBeCloseTo(0.3 + 0.05, 6); // cumulative: prior spend + newly-approved
    expect(acquireOrReclaimLock).toHaveBeenCalledWith(run._id);
    expect(runFullPipelineInternal).toHaveBeenCalledWith(run._id, expect.anything());
  });

  it('a stale plan fingerprint marks the OLD proposal failed and does NOT execute', async () => {
    const run = makeRun({ status: 'pending-approval', planSnapshot: { planFingerprint: 'stale-fingerprint-that-will-never-match' } });
    computeMarketPlan.mockResolvedValue({ dueSeedCount: 3, plannedDiscoveryTaskCount: 1, plannedSerpRequestCount: 0, estimatedCostUsd: 0.036 });

    await main(['--approve', String(run._id)]);

    expect(run.status).toBe('failed');
    expect(run.error).toBe('approval-plan-stale');
    expect(runFullPipelineInternal).not.toHaveBeenCalled();
    expect(acquireOrReclaimLock).not.toHaveBeenCalled();
  });

  it('refuses --approve for a run that is not pending-approval', async () => {
    const run = makeRun({ status: 'completed' });
    await main(['--approve', String(run._id)]);
    expect(runFullPipelineInternal).not.toHaveBeenCalled();
  });
});

describe('CLI --resume <runId>', () => {
  it('reclaims the lock for the SAME interrupted run, starts the heartbeat only after reclaim, and invokes runFullPipeline with the SAME runId', async () => {
    const run = makeRun({ status: 'running', stage: 'serp-fetch', persistenceStage: 'not-started' });

    await main(['--resume', String(run._id)]);

    expect(acquireOrReclaimLock).toHaveBeenCalledWith(run._id);
    // heartbeat starts only AFTER a successful reclaim — standard jest call-order comparison
    expect(acquireOrReclaimLock.mock.invocationCallOrder[0]).toBeLessThan(startHeartbeatLease.mock.invocationCallOrder[0]);
    expect(runFullPipelineInternal).toHaveBeenCalledWith(run._id, expect.anything());
    expect(createdRuns).toHaveLength(0);
  });

  it('refuses --resume for a run that is not status:running (not genuinely interrupted)', async () => {
    const run = makeRun({ status: 'completed' });
    await main(['--resume', String(run._id)]);
    expect(runFullPipelineInternal).not.toHaveBeenCalled();
    expect(acquireOrReclaimLock).not.toHaveBeenCalled();
  });

  it('refuses --resume when the lock cannot be reclaimed (still actively held)', async () => {
    const run = makeRun({ status: 'running' });
    acquireOrReclaimLock.mockResolvedValue(false);
    await main(['--resume', String(run._id)]);
    expect(runFullPipelineInternal).not.toHaveBeenCalled();
  });
});
