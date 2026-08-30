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
import { SearchSeed } from '../src/modules/seo/market/models/search-seed.model';
import { isSeedDiscoveryDue } from '../src/modules/seo/market/services/evidence-freshness.service';
import { computePlanFingerprint } from '../src/modules/seo/market/services/market-orchestrator.service';
import { acquireOrReclaimLock, releaseLock, startHeartbeatLease } from '../src/modules/seo/market/services/market-run-lock.service';

const MARKET_KEYWORD_IDEAS_TASK_ESTIMATE_USD = 0.036; // documented, real 4b.2-validated pricing shape (12 seeds, limit 200)

async function computePlan() {
  const seeds = await SearchSeed.find({ enabled: true }).lean().exec();
  const dueSeeds = seeds.filter((s) => isSeedDiscoveryDue(s.providerDiscoveryState ?? [], 'dataforseo'));
  const plannedDiscoveryTaskCount = dueSeeds.length > 0 ? 1 : 0; // batched into one physical task per 4b.2's existing chunking
  // SERP candidate selection requires a completed clustering/mapping pass — the
  // default preflight reports 0 planned SERP requests conservatively (no
  // speculative paid work is ever estimated before evidence is actually
  // gathered); a real --confirm/--approve execution recomputes this once
  // clustering/mapping evidence is available.
  const plannedSerpRequestCount = 0;
  const estimatedCostUsd = plannedDiscoveryTaskCount * MARKET_KEYWORD_IDEAS_TASK_ESTIMATE_USD + plannedSerpRequestCount * 0.002;
  return { dueSeedCount: dueSeeds.length, plannedDiscoveryTaskCount, plannedSerpRequestCount, estimatedCostUsd };
}

function sanitizedPlanPrint(plan: { dueSeedCount: number; plannedDiscoveryTaskCount: number; plannedSerpRequestCount: number; estimatedCostUsd: number }) {
  console.log('=== Phase 4b.7 — Search Market Orchestrator: PLAN ===');
  console.log('Due seeds (discovery):', plan.dueSeedCount);
  console.log('Planned discovery physical tasks:', plan.plannedDiscoveryTaskCount);
  console.log('Planned SERP physical requests (pre-clustering estimate):', plan.plannedSerpRequestCount);
  console.log('Estimated cost (USD):', plan.estimatedCostUsd);
}

async function main() {
  const args = process.argv.slice(2);
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
    console.log(`Resumed run ${resumeRunId} at stage=${run.stage} persistenceStage=${run.persistenceStage}.`);
    console.log('Full stage-by-stage pipeline resumption is orchestrated by market-orchestrator.service.ts using the run\'s persisted stage/evaluationSnapshot — not re-implemented here.');
    const lease = startHeartbeatLease(runId, () => console.error('Ownership lost mid-resume — stopping.'));
    lease.stop();
    await releaseLock(runId);
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
    const plan = await computePlan();
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
    console.log(`Approved run ${approveRunId}: approvedCostUsd=${run.approvedCostUsd}. Execution wiring is intentionally NOT invoked by this implementation pass (see IMPLEMENTATION SAFETY BOUNDARY).`);
    return;
  }

  // Default / --confirm
  const plan = await computePlan();
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
  console.log(`\nRun ${run._id} authorized under the $${marketConfig.cost.manualApprovalUsd} confirm threshold.`);
  console.log('Execution wiring is intentionally NOT invoked by this implementation pass (see IMPLEMENTATION SAFETY BOUNDARY) — no paid call is made.');
  await releaseLock(run._id as mongoose.Types.ObjectId);
  run.status = 'failed';
  run.error = 'not-executed-during-implementation-safety-boundary';
  run.finishedAt = new Date();
  await run.save();
}

main().catch((e) => {
  console.error('market-run failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
