import { assessRunCost, utcMonthKey } from '../../../src/modules/seo/market/services/cost-governor';
import { CostEstimate } from '../../../src/modules/seo/market/market.types';

const known = (usd: number): CostEstimate => ({ usd, unknown: false });
const unknown: CostEstimate = { usd: null, unknown: true };

describe('utcMonthKey', () => {
  it('formats a deterministic UTC calendar-month key', () => {
    expect(utcMonthKey(new Date(Date.UTC(2026, 7, 29)))).toBe('2026-08');
    expect(utcMonthKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01');
  });
});

describe('assessRunCost', () => {
  it('allows a small run ($0.20) with no approval needed', () => {
    const d = assessRunCost(known(0.2), 0);
    expect(d.allowed).toBe(true);
    expect(d.needsApproval).toBe(false);
    expect(d.projectedMonthUsd).toBe(0.2);
  });

  it('requires manual approval for $0.75 (above the $0.50 threshold, below caps)', () => {
    const d = assessRunCost(known(0.75), 0);
    expect(d.allowed).toBe(true);
    expect(d.needsApproval).toBe(true);
    expect(d.reason).toContain('approval threshold');
  });

  it('refuses $2.50 for exceeding the $2 per-run hard cap', () => {
    const d = assessRunCost(known(2.5), 0);
    expect(d.allowed).toBe(false);
    expect(d.needsApproval).toBe(false);
    expect(d.reason).toContain('per-run cap');
  });

  it('refuses when monthly spend $9.70 + proposed $0.40 exceeds the $10 monthly hard cap', () => {
    const d = assessRunCost(known(0.4), 9.7);
    expect(d.allowed).toBe(false);
    expect(d.projectedMonthUsd).toBe(10.1);
    expect(d.reason).toContain('monthly cap');
  });

  it('treats UNKNOWN cost as never-free: requires approval under default "approve" policy', () => {
    const d = assessRunCost(unknown, 0);
    expect(d.allowed).toBe(true);
    expect(d.needsApproval).toBe(true);
    expect(d.projectedMonthUsd).toBeNull();
    expect(d.estimateUsd).toBeNull();
  });

  it('allows a run exactly at the manual-approval threshold without requiring approval', () => {
    const d = assessRunCost(known(0.5), 0);
    expect(d.needsApproval).toBe(false);
    expect(d.allowed).toBe(true);
  });

  it('allows a run exactly at the per-run hard cap', () => {
    const d = assessRunCost(known(2), 0);
    expect(d.allowed).toBe(true);
  });
});
