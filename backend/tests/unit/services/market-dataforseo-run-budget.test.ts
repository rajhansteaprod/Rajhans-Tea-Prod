import { RunBudget } from '../../../src/modules/seo/market/providers/dataforseo/run-budget';

describe('RunBudget', () => {
  it('allows a small reservation with no approval needed', () => {
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false });
    const r = budget.reserve({ usd: 0.1, unknown: false }, 'op1');
    expect(r.allowed).toBe(true);
    expect(budget.getCumulativeRunUsd()).toBe(0.1);
  });

  it('denies a reservation above the manual-approval threshold when not approved', () => {
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false });
    const r = budget.reserve({ usd: 0.75, unknown: false }, 'op1');
    expect(r.allowed).toBe(false);
    expect(budget.getCumulativeRunUsd()).toBe(0); // denied reservation is never charged
  });

  it('allows the same reservation once explicitly approved', () => {
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    const r = budget.reserve({ usd: 0.75, unknown: false }, 'op1');
    expect(r.allowed).toBe(true);
    expect(budget.getCumulativeRunUsd()).toBe(0.75);
  });

  it('refuses a single call above the per-run hard cap even with approval', () => {
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    const r = budget.reserve({ usd: 2.5, unknown: false }, 'op1');
    expect(r.allowed).toBe(false);
  });

  it('fails closed on CUMULATIVE run cost: many small under-cap calls that sum over the per-run cap', () => {
    const budget = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    // Each call is $0.30 (under the $2 per-run cap individually), but 7 of them = $2.10 > cap.
    let lastAllowed = true;
    for (let i = 0; i < 7; i++) {
      const r = budget.reserve({ usd: 0.3, unknown: false }, `op${i}`);
      lastAllowed = r.allowed;
      if (!r.allowed) break;
    }
    expect(lastAllowed).toBe(false);
    expect(budget.getCumulativeRunUsd()).toBeLessThanOrEqual(2);
  });

  it('refuses when month-to-date + cumulative run cost would exceed the monthly cap', () => {
    const budget = new RunBudget({ monthToDateUsd: 9.7, approvedForManualThreshold: true });
    const r = budget.reserve({ usd: 0.4, unknown: false }, 'op1');
    expect(r.allowed).toBe(false);
  });

  it('treats UNKNOWN cost as never-free: requires explicit approval', () => {
    const unapproved = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: false });
    expect(unapproved.reserve({ usd: null, unknown: true }, 'op1').allowed).toBe(false);

    const approved = new RunBudget({ monthToDateUsd: 0, approvedForManualThreshold: true });
    expect(approved.reserve({ usd: null, unknown: true }, 'op1').allowed).toBe(true);
  });
});
