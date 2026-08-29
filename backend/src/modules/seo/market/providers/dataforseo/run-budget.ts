import { assessRunCost } from '../../services/cost-governor';
import { CostEstimate } from '../../market.types';

export interface RunBudgetOptions {
  /** Actual spend so far this UTC month (from cost-governor.monthToDateSpendUsd()). */
  monthToDateUsd: number;
  /** Explicit human approval granted for THIS run, obtained before construction —
   * e.g. from a CLI --confirm flag after the human reviewed a printed estimate.
   * Never inferred, never defaulted to true. */
  approvedForManualThreshold: boolean;
}

export interface BudgetReservation {
  allowed: boolean;
  reason: string;
  estimate: CostEstimate;
  cumulativeRunUsd: number;
}

/**
 * Explicit approved execution/budget context (requirement 4). A provider MUST be
 * given one of these (via beginRun) before any capability method may call the
 * external API — the gate lives INSIDE the provider's capability methods, not
 * only in a caller/CLI, so calling the provider directly cannot bypass it.
 *
 * Tracks CUMULATIVE projected cost across every call made against this run
 * (discovery pages, metrics batches, retries) — an individual call being under
 * cap is not sufficient if the running total would exceed the per-run/monthly cap.
 * Reuses cost-governor.assessRunCost unchanged; a denied reservation is never
 * committed to the running total.
 */
export class RunBudget {
  private cumulativeRunUsd = 0;
  private readonly monthToDateUsd: number;
  private readonly approved: boolean;

  constructor(opts: RunBudgetOptions) {
    this.monthToDateUsd = opts.monthToDateUsd;
    this.approved = opts.approvedForManualThreshold;
  }

  /** Reserve budget for one external call. Does NOT execute the call itself. */
  reserve(estimate: CostEstimate, opDescription: string): BudgetReservation {
    // UNKNOWN cost is never free (refinement 9 / requirement 4).
    if (estimate.unknown || estimate.usd === null) {
      const decision = assessRunCost(estimate, this.monthToDateUsd);
      if (!decision.allowed) {
        return { allowed: false, reason: `${opDescription}: ${decision.reason}`, estimate, cumulativeRunUsd: this.cumulativeRunUsd };
      }
      if (!this.approved) {
        return {
          allowed: false,
          reason: `${opDescription}: cost UNKNOWN — requires explicit approval, none granted`,
          estimate,
          cumulativeRunUsd: this.cumulativeRunUsd,
        };
      }
      return { allowed: true, reason: `${opDescription}: UNKNOWN cost explicitly approved`, estimate, cumulativeRunUsd: this.cumulativeRunUsd };
    }

    // Check the CUMULATIVE projected total (this call + everything already
    // committed this run), not just this call in isolation. Deliberately NOT
    // rounded to cents here — some providers price sub-cent per-item costs
    // (e.g. $0.00012/item); rounding at every reservation would compound drift
    // across many small calls. Full precision is kept internally; round only
    // for display.
    const projectedCumulative = this.cumulativeRunUsd + estimate.usd;
    const decision = assessRunCost({ usd: projectedCumulative, unknown: false }, this.monthToDateUsd);
    if (!decision.allowed) {
      return {
        allowed: false,
        reason: `${opDescription}: cumulative run cost $${projectedCumulative} — ${decision.reason}`,
        estimate,
        cumulativeRunUsd: this.cumulativeRunUsd,
      };
    }
    if (decision.needsApproval && !this.approved) {
      return {
        allowed: false,
        reason: `${opDescription}: ${decision.reason} — no explicit approval granted`,
        estimate,
        cumulativeRunUsd: this.cumulativeRunUsd,
      };
    }

    // Commit only on allowed — a denied reservation never charges the budget.
    this.cumulativeRunUsd = projectedCumulative;
    return { allowed: true, reason: decision.reason, estimate, cumulativeRunUsd: this.cumulativeRunUsd };
  }

  getCumulativeRunUsd(): number {
    return this.cumulativeRunUsd;
  }
}
