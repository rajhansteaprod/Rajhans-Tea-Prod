import mongoose from 'mongoose';

interface FakeRun {
  _id: mongoose.Types.ObjectId;
  costActualUsd: number;
  authorizationMode: 'confirm-under-threshold' | 'manual-approval' | null;
  approvedCostUsd: number | null;
}

let runs: FakeRun[] = [];

jest.mock('../../../src/modules/seo/market/models/search-market-run.model', () => ({
  SearchMarketRun: {
    findById: jest.fn((id: mongoose.Types.ObjectId) => ({
      select: () => ({
        lean: () => ({ exec: async () => runs.find((r) => r._id.equals(id)) ?? null }),
      }),
    })),
    findOneAndUpdate: jest.fn((filter: { _id: mongoose.Types.ObjectId; costActualUsd: { $lte: number } }, update: { $inc: { costActualUsd: number } }) => ({
      exec: async () => {
        const run = runs.find((r) => r._id.equals(filter._id));
        if (!run) return null;
        if (run.costActualUsd > filter.costActualUsd.$lte) return null;
        run.costActualUsd += update.$inc.costActualUsd;
        return run;
      },
    })),
    aggregate: jest.fn(async () => [{ total: runs.reduce((sum, r) => sum + r.costActualUsd, 0) }]),
  },
}));

import { reserveAttemptCost, __resetReservationQueueForTests } from '../../../src/modules/seo/market/services/market-cost-reservation.service';

function makeRun(overrides: Partial<FakeRun> = {}): FakeRun {
  return { _id: new mongoose.Types.ObjectId(), costActualUsd: 0, authorizationMode: 'confirm-under-threshold', approvedCostUsd: null, ...overrides };
}

beforeEach(() => {
  runs = [];
  __resetReservationQueueForTests();
});

describe('reserveAttemptCost — authorization modes', () => {
  it('null authorization reserves nothing', async () => {
    const run = makeRun({ authorizationMode: null });
    runs.push(run);
    const result = await reserveAttemptCost(run._id, 0.002);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not-authorized');
    expect(run.costActualUsd).toBe(0);
  });

  it('confirm-under-threshold allows within $0.50 and refuses above', async () => {
    const run = makeRun({ authorizationMode: 'confirm-under-threshold', costActualUsd: 0.499 });
    runs.push(run);
    const ok = await reserveAttemptCost(run._id, 0.001);
    expect(ok.allowed).toBe(true);
    expect(run.costActualUsd).toBeCloseTo(0.5, 6);
    const refused = await reserveAttemptCost(run._id, 0.001);
    expect(refused.allowed).toBe(false);
  });

  it('manual-approval obeys approvedCostUsd exactly, not the $0.50 default', async () => {
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: 1.5, costActualUsd: 1.0 });
    runs.push(run);
    const result = await reserveAttemptCost(run._id, 0.002); // projectedRun ~1.002, way under $1.50, would have wrongly failed a "remaining capacity" formula
    expect(result.allowed).toBe(true);
  });

  it('manual-approval with null approvedCostUsd is an invalid state and refuses', async () => {
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: null });
    runs.push(run);
    const result = await reserveAttemptCost(run._id, 0.002);
    expect(result.allowed).toBe(false);
  });
});

describe('reserveAttemptCost — MTD no double counting', () => {
  it('two prior reservations of the SAME run are not added twice to MTD', async () => {
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: 10, costActualUsd: 0 });
    runs.push(run);
    await reserveAttemptCost(run._id, 0.036);
    await reserveAttemptCost(run._id, 0.036);
    // monthToDateSpendUsd() aggregates ALL runs including this one's 0.072 so far;
    // a third attempt must project 0.072 + 0.002 = 0.074, not 0.072 + 0.072 + 0.002.
    const before = run.costActualUsd;
    expect(before).toBeCloseTo(0.072, 6);
    const result = await reserveAttemptCost(run._id, 0.002);
    expect(result.allowed).toBe(true);
    expect(run.costActualUsd).toBeCloseTo(0.074, 6);
  });
});

describe('reserveAttemptCost — hard caps', () => {
  it('per-run hard cap ($2) cannot be exceeded even with a high approvedCostUsd', async () => {
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: 5, costActualUsd: 1.999 });
    runs.push(run);
    const result = await reserveAttemptCost(run._id, 0.01);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per-run hard cap');
  });

  it('monthly hard cap ($10) blocks even a tiny attempt once MTD is exhausted', async () => {
    const other = makeRun({ costActualUsd: 9.999 });
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: 10, costActualUsd: 0 });
    runs.push(other, run);
    const result = await reserveAttemptCost(run._id, 0.01);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('monthly hard cap');
  });
});

describe('reserveAttemptCost — concurrency safety', () => {
  it('5 simultaneous $0.002 reservations near a boundary cannot overshoot the ceiling', async () => {
    // ceiling leaves exactly $0.006 remaining -> only 3 of 5 concurrent $0.002 attempts may succeed
    const run = makeRun({ authorizationMode: 'manual-approval', approvedCostUsd: 0.006, costActualUsd: 0 });
    runs.push(run);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveAttemptCost(run._id, 0.002)));
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(3);
    expect(run.costActualUsd).toBeCloseTo(0.006, 6);
  });
});
