/**
 * Phase 4b.7 — Search Market Orchestrator CLI (manual entrypoint only; NOT a
 * cron/BullMQ job). Modes:
 *
 *   market-run                        default: plan/preflight only, zero paid
 *                                      calls, zero recommendation mutation.
 *   market-run --confirm              execute a run whose estimate <= $0.50.
 *   market-run --approve <runId>      resume a pending-approval run with a
 *                                      freshly recomputed, non-stale plan.
 *   market-run --resume <runId>       resume a genuinely interrupted running
 *                                      evaluation (stale lease) on the SAME run.
 *
 * IMPLEMENTATION-TIME SAFETY: this script must never be invoked in --confirm
 * or --approve mode during implementation/testing — no real DataForSEO call
 * may occur. authorizationMode stays null unless one of those flags is passed
 * and the cost gate independently refuses every paid attempt for an
 * unauthorized run regardless.
 */
import mongoose from 'mongoose';
import { bootstrapMarketProviders } from '../src/modules/seo/market/providers/provider.bootstrap';
import { marketConfig } from '../src/modules/seo/market/market.config';
import { SearchMarketRun } from '../src/modules/seo/market/models/search-market-run.model';
import { computePlanFingerprint } from '../src/modules/seo/market/services/market-orchestrator.service';
import { acquireOrReclaimLock, releaseLock, startHeartbeatLease, LeaseHandle } from '../src/modules/seo/market/services/market-run-lock.service';
import { computeMarketPlan, createOwnershipGuard, runFullPipelineInternal } from '../src/modules/seo/market/services/market-pipeline.service';

// computeMarketPlan is the ONE preflight/remaining-work planner (market-pipeline.service.ts) —
// reused here rather than duplicated, including for the pending-approval revival flow.

function sanitizedPlanPrint(plan: { dueSeedCount: number; plannedDiscoveryTaskCount: number; plannedSerpRequestCount: number; estimatedCostUsd: number }) {
  console.log('=== Phase 4b.7 — Search Market Orchestrator: PLAN ===');
  console.log('Due seeds (discovery):', plan.dueSeedCount);
  console.log('Planned discovery physical tasks:', plan.plannedDiscoveryTaskCount);
  console.log('Planned SERP physical requests (pre-clustering estimate):', plan.plannedSerpRequestCount);
  console.log('Estimated cost (USD):', plan.estimatedCostUsd);
}

/**
 * Runs the pipeline while the caller-acquired lock is held: starts the
 * periodic heartbeat lease, invokes the pipeline with a real ownership guard
 * tied to that SAME lock, and always stops the heartbeat and releases the
 * lock afterward (owner-checked — never releases another run's lock, e.g.
 * after an ownership-loss during execution). `onOwnershipLost` synchronously
 * marks the guard lost (`markLost()`) so the pipeline's very next guarded
 * check — before any new paid attempt, provider-result write, or
 * recommendation mutation — fails immediately, without waiting for its own
 * next live re-verification. A thrown pipeline error leaves the run in
 * whatever state it reached (never fabricates a terminal status) so
 * --resume can continue it.
 */
async function executeUnderLock(runId: mongoose.Types.ObjectId, label: string): Promise<void> {
  let ownershipLost = false;
  const { guard, markLost } = createOwnershipGuard(runId);
  const lease: LeaseHandle = startHeartbeatLease(runId, () => {
    ownershipLost = true;
    markLost();
    console.error(`${label}: lock ownership lost mid-run — no further paid work or recommendation mutation will occur.`);
  });
  try {
    await runFullPipelineInternal(runId, { ownershipGuard: guard });
  } catch (e) {
    console.error(`${label}: pipeline error — run left in its current persisted state for --resume:`, e instanceof Error ? e.message : e);
  } finally {
    lease.stop();
    if (!ownershipLost) await releaseLock(runId);
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = argv;
  const confirmed = args.includes('--confirm');
  const approveIdx = args.indexOf('--approve');
  const resumeIdx = args.indexOf('--resume');
  const approveRunId = approveIdx >= 0 ? args[approveIdx + 1] : null;
  const resumeRunId = resumeIdx >= 0 ? args[resumeIdx + 1] : null;

  bootstrapMarketProviders();

  if (resumeRunId) {
    const runId = new mongoose.Types.ObjectId(resumeRunId);
    const run = await SearchMarketRun.findById(runId).exec();
    if (!run || run.status !== 'running') {
      console.error('--resume requires an existing run with status:running (genuinely interrupted). Refusing.');
      process.exitCode = 1;
      return;
    }
    const reclaimed = await acquireOrReclaimLock(runId);
    if (!reclaimed) {
      console.error('Could not reclaim the execution lock — another process may still own it. Refusing.');
      process.exitCode = 1;
      return;
    }
    console.log(`Resuming run ${resumeRunId} at stage=${run.stage} persistenceStage=${run.persistenceStage}.`);
    console.log(run.evaluationSnapshot ? 'evaluationSnapshot already frozen — resuming staged persistence only, no re-evaluation.' : 'No evaluationSnapshot yet — pure stages will safely recompute, reusing already-persisted evidence (no redundant paid calls).');
    await executeUnderLock(runId, '--resume');
    return;
  }

  if (approveRunId) {
    const runId = new mongoose.Types.ObjectId(approveRunId);
    const run = await SearchMarketRun.findById(runId).exec();
    if (!run || run.status !== 'pending-approval') {
      console.error('--approve requires an existing run with status:pending-approval. Refusing.');
      process.exitCode = 1;
      return;
    }
    const plan = await computeMarketPlan(run.market);
    const evidenceFreshnessSnapshotAt = new Date();
    const newFingerprint = computePlanFingerprint({
      plannedDiscoveryTaskCount: plan.plannedDiscoveryTaskCount,
      plannedSerpRequestCount: plan.plannedSerpRequestCount,
      estimatedCostUsd: plan.estimatedCostUsd,
      pricingVersion: marketConfig.opportunity.scoringConfigVersion,
      evidenceFreshnessSnapshotAt,
    });
    if (run.planSnapshot && run.planSnapshot.planFingerprint !== newFingerprint) {
      run.status = 'failed';
      run.error = 'approval-plan-stale';
      run.finishedAt = new Date();
      await run.save();
      console.error('Plan changed materially since it was proposed. Old proposal marked failed (approval-plan-stale). Run the default preflight again for a fresh proposal.');
      process.exitCode = 1;
      return;
    }
    const approvedAdditionalCostUsd = plan.estimatedCostUsd;
    run.approvedCostUsd = run.costActualUsd + approvedAdditionalCostUsd;
    run.approvedAt = new Date();
    run.approvalSource = 'manual-cli';
    run.authorizationMode = 'manual-approval';
    run.status = 'running';
    await run.save();
    const acquired = await acquireOrReclaimLock(runId);
    if (!acquired) {
      console.error('Could not acquire the execution lock — another process may still own it. Refusing.');
      process.exitCode = 1;
      return;
    }
    console.log(`Approved run ${approveRunId}: approvedCostUsd=${run.approvedCostUsd}. Executing.`);
    await executeUnderLock(runId, '--approve');
    return;
  }

  // Default / --confirm
  const plan = await computeMarketPlan(marketConfig.defaultMarket);
  sanitizedPlanPrint(plan);

  if (!confirmed) {
    if (plan.estimatedCostUsd <= marketConfig.cost.manualApprovalUsd) {
      console.log(`\nEstimate <= $${marketConfig.cost.manualApprovalUsd} — no SearchMarketRun created. Rerun with --confirm to execute.`);
    } else {
      const run = await SearchMarketRun.create({
        trigger: 'manual',
        status: 'pending-approval',
        market: marketConfig.defaultMarket,
        seedIds: [],
        costEstimateUsd: plan.estimatedCostUsd,
        planSnapshot: {
          plannedDiscoveryTaskCount: plan.plannedDiscoveryTaskCount,
          plannedSerpRequestCount: plan.plannedSerpRequestCount,
          estimatedCostUsd: plan.estimatedCostUsd,
          market: marketConfig.defaultMarket,
          plannedAt: new Date(),
          pricingVersion: marketConfig.opportunity.scoringConfigVersion,
          evidenceFreshnessSnapshotAt: new Date(),
          planFingerprint: computePlanFingerprint({
            plannedDiscoveryTaskCount: plan.plannedDiscoveryTaskCount,
            plannedSerpRequestCount: plan.plannedSerpRequestCount,
            estimatedCostUsd: plan.estimatedCostUsd,
            pricingVersion: marketConfig.opportunity.scoringConfigVersion,
            evidenceFreshnessSnapshotAt: new Date(),
          }),
        },
      });
      console.log(`\nEstimate exceeds $${marketConfig.cost.manualApprovalUsd} — created pending-approval run ${run._id}. Rerun with --approve ${run._id} to execute.`);
    }
    return;
  }

  if (plan.estimatedCostUsd > marketConfig.cost.manualApprovalUsd) {
    console.error(`--confirm only authorizes runs estimated <= $${marketConfig.cost.manualApprovalUsd}. This plan needs --approve instead.`);
    process.exitCode = 1;
    return;
  }

  const run = await SearchMarketRun.create({
    trigger: 'manual',
    status: 'pending-approval',
    market: marketConfig.defaultMarket,
    seedIds: [],
    costEstimateUsd: plan.estimatedCostUsd,
  });
  const acquired = await acquireOrReclaimLock(run._id as mongoose.Types.ObjectId);
  if (!acquired) {
    console.error('Another market evaluation is already running. Refusing to start a second one.');
    run.status = 'failed';
    run.error = 'lock-unavailable';
    run.finishedAt = new Date();
    await run.save();
    process.exitCode = 1;
    return;
  }
  run.authorizationMode = 'confirm-under-threshold';
  run.status = 'running';
  await run.save();
  console.log(`\nRun ${run._id} authorized under the $${marketConfig.cost.manualApprovalUsd} confirm threshold. Executing.`);
  await executeUnderLock(run._id as mongoose.Types.ObjectId, '--confirm');
}

// CLI entrypoint guard — only runs when this file is executed directly (`ts-node scripts/market-run.ts ...`),
// never when imported (e.g. by tests importing `main` for argv-driven integration coverage).
if (require.main === module) {
  main().catch((e) => {
    console.error('market-run failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
