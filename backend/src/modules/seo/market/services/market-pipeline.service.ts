import mongoose from 'mongoose';
import { marketConfig } from '../market.config';
import { Market, MarketOpportunityDraft } from '../market.types';
import { SearchMarketRun, ISearchMarketRunDoc, IPlanSnapshot } from '../models/search-market-run.model';
import { SearchSeed, ISearchSeedDoc } from '../models/search-seed.model';
import { SearchKeyword, ISearchKeywordDoc } from '../models/search-keyword.model';
import { SearchCluster } from '../models/search-cluster.model';
import { SearchKeywordMetric } from '../models/search-keyword-metric.model';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { generateSeeds, loadInventoryEntities, SeedDraft } from './seed.engine';
import { buildRelevanceModel, RelevanceTaxonomy } from '../relevance.taxonomy';
import { isSeedDiscoveryDue, classifySerpAge } from './evidence-freshness.service';
import { ensureKeywordIdentities, buildActiveKeywordUniverse, MemberCoverageStatus } from './active-keyword-universe';
import { loadLatestMetricsByKeywordIds } from './keyword-metric-selector';
import { buildMappingKeywordEvidence, buildClusterGscDemandEvidence, buildMatchedPageGscEvidence } from './market-evidence-assembler';
import { computeResolutionCoverage, allOpenRecommendationsCovered } from './resolution-coverage';
import { clusterKeywords, scoreClusteringPairWithoutSerp, ClusteringKeywordInput, ClusterResult } from './clustering.engine';
import { mapClusterToUrl, MappingClusterInput } from './url-mapper';
import { applyCannibalizationGuard, CannibalizationEntry } from './cannibalization-guard';
import { buildPageCandidates } from './page-candidate.builder';
import { loadGscEvidenceIndex } from './gsc-evidence-index';
import { buildOpportunityKeywordEvidence, scoreOpportunity } from './opportunity-scoring';
import { matchClustersToStableIds, IdentityClusterInput } from './cluster-identity.service';
import { buildEvaluationSnapshot, computePlanFingerprint, selectSerpCandidates, SerpCandidateUnit } from './market-orchestrator.service';
import { reserveAttemptCost } from './market-cost-reservation.service';
import { upsertMarketOpportunityDrafts, resolveMissingMarketOpportunities } from './market-recommendation.service';
import { SerpOverlapCache } from './serp-overlap.provider';
import { normalizeKeyword } from './keyword-normalize';
import { DataForSeoProvider, DataForSeoProviderOverrides, DurableAttemptRefusedError, BeforePhysicalAttemptContext } from '../providers/dataforseo/dataforseo.provider';
import { DataForSeoSerpProvider, DataForSeoSerpProviderOverrides } from '../providers/dataforseo/dataforseo-serp.provider';
import { RunBudget } from '../providers/dataforseo/run-budget';
import { monthToDateSpendUsd } from './cost-governor';
import { refreshHeartbeat } from './market-run-lock.service';

/**
 * Phase 4b.7 — the real integrated pipeline. Composes the existing, already
 * frozen/tested 4b.1–4b.7 primitives in the approved two-pass order; contains
 * no clustering/mapping/scoring/relevance/GSC/cost formulas of its own.
 *
 * Every paid provider call goes through a fresh provider instance carrying
 * the durable `beforePhysicalAttempt` hook (§5 of the approved seam plan) —
 * the process-wide `providerRegistry` instances (no hook) are never used for
 * orchestrated paid work. `MarketPipelineDeps` lets tests inject a mocked
 * `fetchImpl` into that SAME construction (the durable hook is always wired
 * regardless of overrides) so integration tests exercise the real
 * runFullPipeline -> provider -> beforePhysicalAttempt -> reserveAttemptCost
 * -> RunBudget -> fetchImpl chain with zero network surface. The public
 * `runFullPipeline(runId)` signature is unchanged; this is additive.
 */

/**
 * Minimal ownership-safety seam (4b.7 final hardening). Consulted before
 * every NEW physical paid attempt, before persisting a provider result, and
 * before every mutation phase that must not proceed once
 * `SearchMarketLock` ownership is gone. Production wiring (market-run.ts)
 * ties this to the real acquired lock; tests inject a deterministic fake.
 * When omitted entirely (the default `runFullPipeline(runId)` entrypoint),
 * an always-owned no-op guard is used — unchanged prior behavior.
 */
export interface MarketPipelineOwnershipGuard {
  isLost(): boolean;
  assertOwned(): Promise<void>;
}

export class OwnershipLostError extends Error {
  constructor() {
    super('market-lock-ownership-lost');
    this.name = 'OwnershipLostError';
  }
}

const alwaysOwnedGuard: MarketPipelineOwnershipGuard = {
  isLost: () => false,
  assertOwned: async () => undefined,
};

/** True for either guard-boundary failure mode — a direct `assertOwned()` throw, or the provider-seam's `DurableAttemptRefusedError` carrying the same reasonCode (needed because the providers' own catch blocks only pass a fixed set of error types through unchanged — see `isAuthorizationCeilingExhausted`). */
function isOwnershipLost(e: unknown): boolean {
  return e instanceof OwnershipLostError || (e instanceof DurableAttemptRefusedError && e.reasonCode === 'lock-ownership-lost');
}

export interface MarketPipelineDeps {
  keywordProviderOverrides?: DataForSeoProviderOverrides;
  serpProviderOverrides?: DataForSeoSerpProviderOverrides;
  now?: () => Date;
  ownershipGuard?: MarketPipelineOwnershipGuard;
}

/**
 * `DurableAttemptRefusedError.reasonCode === 'authorization-ceiling-exceeded'`
 * is the ONLY category that triggers the pending-approval revival flow — a
 * SEPARATE error class was deliberately NOT used here: both
 * DataForSeoProvider/DataForSeoSerpProvider's own catch blocks only pass
 * `CostGateRefusedError | NoActiveRunBudgetError | DurableAttemptRefusedError`
 * through unchanged (everything else is wrapped into a generic sanitized
 * Error), so a distinct class would have been silently swallowed there.
 * Dispatching on `reasonCode` reuses that already-approved pass-through path.
 */
function isAuthorizationCeilingExhausted(e: unknown): e is DurableAttemptRefusedError {
  return e instanceof DurableAttemptRefusedError && e.reasonCode === 'authorization-ceiling-exceeded';
}

function durableHook(runId: mongoose.Types.ObjectId, ownershipGuard: MarketPipelineOwnershipGuard) {
  return async (ctx: BeforePhysicalAttemptContext): Promise<void> => {
    // Ownership is revalidated BEFORE every new physical attempt (incl. retries —
    // this hook fires once per physical HTTP attempt) and BEFORE reserveAttemptCost,
    // so a lost lock blocks the reservation itself, not just the HTTP call. A raw
    // OwnershipLostError is deliberately never let out of this function — it would
    // be silently wrapped into a generic Error by the provider's own catch block
    // (only CostGateRefusedError/NoActiveRunBudgetError/DurableAttemptRefusedError
    // pass through unchanged) — so it's re-thrown as the already-approved type.
    try {
      if (ownershipGuard.isLost()) throw new OwnershipLostError();
      await ownershipGuard.assertOwned();
    } catch {
      throw new DurableAttemptRefusedError('market-lock-ownership-lost', 'lock-ownership-lost');
    }
    const result = await reserveAttemptCost(runId, ctx.estimatedCostUsd);
    if (result.allowed) return;
    throw new DurableAttemptRefusedError(result.reason, result.reasonCode);
  };
}

async function makeRunBudget(run: ISearchMarketRunDoc): Promise<RunBudget> {
  const monthToDateUsd = await monthToDateSpendUsd();
  return new RunBudget({ monthToDateUsd, approvedForManualThreshold: run.authorizationMode !== null });
}

const MARKET_KEYWORD_IDEAS_TASK_ESTIMATE_USD = 0.036; // real 4b.2-validated pricing shape (12 seeds, limit 200) — the single planner, reused by scripts/market-run.ts

export interface MarketPlanResult {
  dueSeedCount: number;
  plannedDiscoveryTaskCount: number;
  plannedSerpRequestCount: number;
  estimatedCostUsd: number;
}

/** The ONE preflight/remaining-work planner — used for the initial preflight
 * (scripts/market-run.ts) AND for recomputing remaining work after an
 * authorization-ceiling revival (below). Never duplicated. */
/**
 * Read persisted discovery freshness only for the CURRENT seed set.
 * This helper is read-only and is used by preflight planning.
 *
 * Historical SearchSeed rows that are no longer generated by today's
 * inventory/facet seed engine are deliberately excluded.
 */
async function loadPersistedCurrentSeeds(seeds: SeedDraft[], market: Market) {
  if (seeds.length === 0) return [];

  return SearchSeed.find({
    normalizedTerm: { $in: seeds.map((seed) => seed.normalizedTerm) },
    'market.country': market.country,
    'market.language': market.language,
  }).lean().exec();
}

/**
 * Execution-only bridge between the pure seed engine and persistent discovery
 * freshness. Existing providerDiscoveryState is NEVER overwritten, so a
 * previously successful lastDiscoveredAt survives synchronization.
 *
 * Ownership is checked before each DB mutation. If ownership is lost, the
 * OwnershipLostError is allowed to bubble to runFullPipelineInternal(), which
 * leaves the run resumable rather than falsely marking it failed.
 */
async function synchronizeCurrentSeeds(
  seeds: SeedDraft[],
  market: Market,
  ownershipGuard: MarketPipelineOwnershipGuard,
): Promise<ISearchSeedDoc[]> {
  const docs: ISearchSeedDoc[] = [];

  for (const seed of seeds) {
    if (ownershipGuard.isLost()) throw new OwnershipLostError();
    await ownershipGuard.assertOwned();

    const doc = await SearchSeed.findOneAndUpdate(
      {
        normalizedTerm: seed.normalizedTerm,
        'market.country': market.country,
        'market.language': market.language,
      },
      {
        $set: {
          term: seed.term,
          type: seed.type,
          sourceRef: seed.sourceRef,
          market,
          enabled: true,
        },
        $setOnInsert: {
          normalizedTerm: seed.normalizedTerm,
          providerDiscoveryState: [],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    if (!doc) {
      throw new Error(`SearchSeed upsert returned no document for ${seed.normalizedTerm}`);
    }

    docs.push(doc);
  }

  return docs;
}

export async function computeMarketPlan(market: Market): Promise<MarketPlanResult> {
  // Preflight remains strictly read-only: generate today's seed set from
  // inventory/facets, then inspect persisted freshness for only those seeds.
  // A current generated seed with no persisted row is immediately due.
  const currentSeeds = await generateSeeds(market);
  const persistedSeeds = await loadPersistedCurrentSeeds(currentSeeds, market);
  const persistedByNormalizedTerm = new Map(
    persistedSeeds.map((seed) => [seed.normalizedTerm, seed]),
  );

  const dueSeeds = currentSeeds.filter((seed) => {
    const persisted = persistedByNormalizedTerm.get(seed.normalizedTerm);
    return !persisted ||
      isSeedDiscoveryDue(persisted.providerDiscoveryState ?? [], 'dataforseo');
  });

  const plannedDiscoveryTaskCount = dueSeeds.length > 0 ? 1 : 0;
  const plannedSerpRequestCount = 0; // conservative preflight — real selection happens once clustering evidence exists
  const estimatedCostUsd = plannedDiscoveryTaskCount * MARKET_KEYWORD_IDEAS_TASK_ESTIMATE_USD + plannedSerpRequestCount * 0.002;
  return { dueSeedCount: dueSeeds.length, plannedDiscoveryTaskCount, plannedSerpRequestCount, estimatedCostUsd };
}

/**
 * Case A revival (frozen §8): authorization ceiling exhausted while both hard
 * caps still have room. SAME run returns to pending-approval — never
 * completed/degraded/failed — with a freshly recomputed remaining-work
 * planSnapshot. `--approve <sameRunId>` is required to continue.
 */
async function revertToPendingApproval(run: ISearchMarketRunDoc): Promise<void> {
  const plan = await computeMarketPlan(run.market);
  const now = new Date();
  const planSnapshot: IPlanSnapshot = {
    plannedDiscoveryTaskCount: plan.plannedDiscoveryTaskCount,
    plannedSerpRequestCount: plan.plannedSerpRequestCount,
    estimatedCostUsd: plan.estimatedCostUsd,
    market: run.market,
    plannedAt: now,
    pricingVersion: marketConfig.opportunity.scoringConfigVersion,
    evidenceFreshnessSnapshotAt: now,
    planFingerprint: computePlanFingerprint({
      plannedDiscoveryTaskCount: plan.plannedDiscoveryTaskCount,
      plannedSerpRequestCount: plan.plannedSerpRequestCount,
      estimatedCostUsd: plan.estimatedCostUsd,
      pricingVersion: marketConfig.opportunity.scoringConfigVersion,
      evidenceFreshnessSnapshotAt: now,
    }),
  };
  // stage/persistenceStage/costActualUsd/already-persisted evidence are left exactly as they were.
  run.status = 'pending-approval';
  run.authorizationMode = null; // no longer authorizes further attempts
  run.approvedCostUsd = null;
  run.planSnapshot = planSnapshot;
  await run.save();
}

interface MappingKeywordEvidenceRow {
  keywordId: string;
  keyword: string;
  normalizedKeyword: string;
  businessRelevance: ReturnType<typeof buildMappingKeywordEvidence>['evidence'][number]['businessRelevance'];
  demand: ReturnType<typeof buildMappingKeywordEvidence>['evidence'][number]['demand'];
}

/** Fails the whole run — reserved for infrastructure failures, never for ordinary UNKNOWN evidence. */
async function failRun(run: ISearchMarketRunDoc, error: string): Promise<void> {
  run.status = 'failed';
  run.error = error;
  run.finishedAt = new Date();
  await run.save();
}

/** Production entrypoint — unchanged public signature. */
export async function runFullPipeline(runId: mongoose.Types.ObjectId): Promise<void> {
  return runFullPipelineInternal(runId, {});
}

/**
 * Production ownership guard factory — reuses the EXISTING owner-checked
 * `refreshHeartbeat()` for live re-verification (no duplicated lock-query
 * logic), plus a synchronous `markLost()` the heartbeat lease's
 * `onOwnershipLost` callback can call immediately, without waiting for the
 * next `assertOwned()` call. `market-run.ts` (the CLI) wires both together;
 * this module has no CLI dependency.
 */
export function createOwnershipGuard(runId: mongoose.Types.ObjectId): { guard: MarketPipelineOwnershipGuard; markLost: () => void } {
  let lost = false;
  const guard: MarketPipelineOwnershipGuard = {
    isLost: () => lost,
    async assertOwned() {
      if (lost) throw new OwnershipLostError();
      const stillOwner = await refreshHeartbeat(runId);
      if (!stillOwner) {
        lost = true;
        throw new OwnershipLostError();
      }
    },
  };
  return { guard, markLost: () => { lost = true; } };
}

/**
 * Test-only extension point (still exported, but `runFullPipeline` is the
 * production-documented entrypoint). `deps` may override the provider
 * `fetchImpl` for integration tests — the durable `beforePhysicalAttempt`
 * hook is ALWAYS wired regardless of overrides, so no test can bypass the
 * cost-reservation seam.
 */
export async function runFullPipelineInternal(runId: mongoose.Types.ObjectId, deps: MarketPipelineDeps): Promise<void> {
  const run = await SearchMarketRun.findById(runId).exec();
  if (!run) throw new Error(`runFullPipeline: run ${String(runId)} not found`);

  try {
    // Resume case B — evaluationSnapshot already frozen: never recompute evidence/scoring, only resume staged persistence.
    if (run.evaluationSnapshot) {
      await runStagedPersistence(run, deps.ownershipGuard ?? alwaysOwnedGuard);
      return;
    }
    await runEvaluation(run, deps);
  } catch (e) {
    if (isAuthorizationCeilingExhausted(e)) {
      await revertToPendingApproval(run);
      return;
    }
    if (isOwnershipLost(e)) {
      // Ownership is gone — never mark completed/degraded/failed here. The run is
      // left in whatever persisted state it already reached (stage/persistenceStage/
      // costActualUsd/evidence already written before the loss are untouched) so a
      // future owner can safely --resume it. No further action is safe from here.
      return;
    }
    throw e;
  }
}

async function runEvaluation(run: ISearchMarketRunDoc, deps: MarketPipelineDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const ownershipGuard = deps.ownershipGuard ?? alwaysOwnedGuard;
  const market: Market = run.market;
  const degradationReasons: string[] = [];
  const keywordProvider = new DataForSeoProvider({ ...deps.keywordProviderOverrides, beforePhysicalAttempt: durableHook(run._id as mongoose.Types.ObjectId, ownershipGuard) });
  const serpProvider = new DataForSeoSerpProvider({ ...deps.serpProviderOverrides, beforePhysicalAttempt: durableHook(run._id as mongoose.Types.ObjectId, ownershipGuard) });

  // ── 1-2: taxonomy/inventory ──
  let taxonomy: RelevanceTaxonomy;
  try {
    const inventory = await loadInventoryEntities();
    taxonomy = buildRelevanceModel(inventory);
  } catch (e) {
    await failRun(run, `taxonomy/inventory load failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // ── 3: seeds ──
  run.stage = 'discovery';
  await run.save();
  let seeds: SeedDraft[];
  try {
    seeds = await generateSeeds(market);
  } catch (e) {
    await failRun(run, `seed generation failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // ── 4-5: synchronize current seeds, then discovery freshness + optional discovery ──
  let seedDocs: ISearchSeedDoc[];
  try {
    seedDocs = await synchronizeCurrentSeeds(seeds, market, ownershipGuard);
  } catch (e) {
    // Lock loss is not an infrastructure failure: preserve the existing
    // resumable ownership-loss semantics handled by runFullPipelineInternal().
    if (isOwnershipLost(e)) throw e;

    await failRun(
      run,
      `seed synchronization failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const dueSeedDocs = seedDocs.filter((s) =>
    isSeedDiscoveryDue(s.providerDiscoveryState ?? [], keywordProvider.id),
  );
  let discoveryKeywordStrings: string[] = [];

  if (dueSeedDocs.length > 0 && keywordProvider.isConfigured()) {
    try {
      const budget = await makeRunBudget(run);
      keywordProvider.beginRun(budget);
      const results = await keywordProvider.discoverKeywords(dueSeedDocs.map((s) => s.term), market);
      // The HTTP call may have been in flight when ownership was lost — revalidate
      // BEFORE persisting anything it returned. A successful response is never
      // enough on its own to justify a write.
      if (ownershipGuard.isLost()) throw new OwnershipLostError();
      await ownershipGuard.assertOwned();
      discoveryKeywordStrings = results.map((r) => r.keyword);

      // Persist identities + inline metrics BEFORE marking discovery fresh.
      const identityMap = await ensureKeywordIdentities({ seeds: [], discoveryKeywords: discoveryKeywordStrings, carryForwardKeywords: [], market });
      const now = new Date();
      for (const r of results) {
        const nk = normalizeKeyword(r.keyword);
        const doc = identityMap.get(nk);
        if (!doc || !r.inlineMetrics) continue;
        await SearchKeywordMetric.findOneAndUpdate(
          { keywordId: doc._id, provider: keywordProvider.id, capturedAt: now },
          {
            $setOnInsert: {
              keywordId: doc._id,
              provider: keywordProvider.id,
              capturedAt: now,
              searchVolume: r.inlineMetrics.searchVolume ?? null,
              volumeRange: r.inlineMetrics.volumeRange ?? null,
              cpc: r.inlineMetrics.cpc ?? null,
              paidCompetition: r.inlineMetrics.paidCompetition ?? null,
              paidCompetitionIndex: r.inlineMetrics.paidCompetitionIndex ?? null,
              trend: r.inlineMetrics.trend ?? null,
            },
          },
          { upsert: true },
        ).exec();
      }
      // Discovery freshness is updated ONLY after evidence persistence above succeeded.
      for (const seedDoc of dueSeedDocs) {
        const entry = seedDoc.providerDiscoveryState.find((s) => s.provider === keywordProvider.id);
        if (entry) entry.lastDiscoveredAt = now;
        else seedDoc.providerDiscoveryState.push({ provider: keywordProvider.id, lastDiscoveredAt: now });
        await seedDoc.save();
      }
      run.costActualUsd = Math.max(run.costActualUsd, budget.getCumulativeRunUsd());
      await run.save();
    } catch (e) {
      if (isOwnershipLost(e)) throw e; // propagate to top-level handler — no further paid work or mutation, run left resumable
      if (isAuthorizationCeilingExhausted(e)) throw e; // propagate to top-level revival handler — SAME run returns to pending-approval
      if (e instanceof DurableAttemptRefusedError) {
        // Hard-cap or other budget refusal mid-discovery — stop new paid work,
        // keep whatever was already fetched/persisted, degrade (never revives
        // to pending-approval — human approval cannot override a hard cap).
        degradationReasons.push(`discovery-refused: ${e.reason}`);
      } else {
        await failRun(run, `discovery failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
  } else if (dueSeedDocs.length > 0 && !keywordProvider.isConfigured()) {
    degradationReasons.push('discovery-due-but-provider-unconfigured');
  }

  // ── 6-7: cached keywords + open recommendations (for carry-forward) ──
  const cachedKeywords = await SearchKeyword.find({ 'market.country': market.country, 'market.language': market.language }).exec();
  const openRecommendations = await SeoRecommendation.find({ source: 'market', status: 'open' }).select('fingerprint evidence').lean().exec();
  const carryForwardKeywords = openRecommendations.flatMap((r) => ((r.evidence as { memberKeywords?: string[] } | undefined)?.memberKeywords ?? []));

  // ── 8-9: identity ensure + batched metric load ──
  let identityMap: Map<string, ISearchKeywordDoc>;
  try {
    identityMap = await ensureKeywordIdentities({ seeds, discoveryKeywords: discoveryKeywordStrings, carryForwardKeywords, market });
  } catch (e) {
    await failRun(run, `identity assembly failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  // Cached keywords already ARE persisted identities — merge them in so
  // buildActiveKeywordUniverse's identity lookup (shared by every origin,
  // including 'cache') can resolve them too.
  for (const doc of cachedKeywords) if (!identityMap.has(doc.normalizedKeyword)) identityMap.set(doc.normalizedKeyword, doc);

  // ── 10-11: active universe (current-run hardNegative/relevance recomputed inside) ──
  const universe = buildActiveKeywordUniverse({
    seeds, discoveryKeywords: discoveryKeywordStrings, cachedKeywords, carryForwardKeywords, keywordIdentityMap: identityMap, taxonomy, now: now(),
  });
  if (universe.active.length === 0) {
    await failRun(run, 'active keyword universe is empty — nothing to evaluate');
    return;
  }

  const metricsMap = await loadLatestMetricsByKeywordIds(universe.active.map((k) => new mongoose.Types.ObjectId(k.keywordId)), keywordProvider.id);

  // ── 12-13: MappingKeywordEvidence (records stale-demand degradation internally) ──
  const { evidence: mappingEvidenceList, degradationReasons: demandDegradations } = buildMappingKeywordEvidence(universe.active, metricsMap, taxonomy, now());
  degradationReasons.push(...demandDegradations);
  const mappingEvidenceByKeywordId = new Map<string, MappingKeywordEvidenceRow>(mappingEvidenceList.map((e) => [e.keywordId, e]));

  // ── 14-15: initial clustering (no SERP) ──
  run.stage = 'initial-clustering';
  await run.save();
  const clusteringInputs: ClusteringKeywordInput[] = universe.active.map((k) => ({ keywordId: k.keywordId, keyword: k.keyword, normalizedKeyword: k.normalizedKeyword }));
  let initialClusters: ClusterResult[];
  try {
    initialClusters = clusterKeywords({ keywords: clusteringInputs, taxonomy }).clusters;
  } catch (e) {
    await failRun(run, `initial clustering failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // ── 16-17: page candidates + GSC index, ONCE, reused across both passes ──
  run.stage = 'preliminary-mapping';
  await run.save();
  let pageCandidates: Awaited<ReturnType<typeof buildPageCandidates>>;
  let gscIndex: Awaited<ReturnType<typeof loadGscEvidenceIndex>>;
  try {
    pageCandidates = await buildPageCandidates(taxonomy);
    gscIndex = await loadGscEvidenceIndex(new Set(pageCandidates.map((c) => c.canonicalUrl)));
  } catch (e) {
    await failRun(run, `page inventory / GSC index load failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const buildMemberEvidenceForCluster = (cluster: ClusterResult): MappingKeywordEvidenceRow[] | null => {
    const rows: MappingKeywordEvidenceRow[] = [];
    for (const m of cluster.members) {
      const row = mappingEvidenceByKeywordId.get(m.keywordId);
      if (!row) return null; // invariant violation — never silently drop a member
      rows.push(row);
    }
    return rows;
  };

  // ── 18-19: preliminary mapping + cannibalization (in-memory only, never persisted) ──
  const preliminaryEntries: CannibalizationEntry[] = [];
  for (const cluster of initialClusters) {
    const memberEvidence = buildMemberEvidenceForCluster(cluster);
    if (!memberEvidence) {
      degradationReasons.push(`preliminary-mapping-skipped: cluster "${cluster.label}" has an unresolved member`);
      continue;
    }
    try {
      const mapping = mapClusterToUrl({ cluster, memberEvidence, taxonomy } as MappingClusterInput, pageCandidates, gscIndex);
      preliminaryEntries.push({ cluster, taxonomy, mapping });
    } catch (e) {
      degradationReasons.push(`preliminary-mapping-failed: cluster "${cluster.label}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const preliminaryGuarded = applyCannibalizationGuard(preliminaryEntries, pageCandidates);

  // ── 20-23: pair-aware selective SERP ──
  run.stage = 'serp-fetch';
  await run.save();
  const serpCache = new SerpOverlapCache();
  const serpCandidates: SerpCandidateUnit[] = [];
  preliminaryGuarded.forEach((mapping, idx) => {
    const risk = mapping.possibleCannibalizationRisk;
    if (risk) {
      const cluster = preliminaryEntries[idx].cluster;
      serpCandidates.push({ reason: 'cannibalization-disambiguation', keywordA: cluster.label, keywordB: risk.competingClusterLabel });
    }
  });

  // 'borderline-clustering' candidates: representative (medoid) pairs across
  // DIFFERENT initial clusters whose no-SERP combinedScore sits within
  // `borderlineClusteringBandWidth` of `minEdgeScore`, using the EXACT same
  // pairwise scoring clusterKeywords() computes internally (the additive
  // diagnostic seam) — never a duplicated formula. Anchor-gate failures are
  // never candidates, matching clusterKeywords()'s own unconditional gate.
  const inputByKeywordId = new Map(clusteringInputs.map((k) => [k.keywordId, k]));
  const minEdge = marketConfig.clustering.minEdgeScore;
  const band = marketConfig.orchestrator.borderlineClusteringBandWidth;
  for (let i = 0; i < initialClusters.length; i++) {
    const aInput = inputByKeywordId.get(initialClusters[i].medoidKeywordId);
    if (!aInput) continue;
    for (let j = i + 1; j < initialClusters.length; j++) {
      const bInput = inputByKeywordId.get(initialClusters[j].medoidKeywordId);
      if (!bInput) continue;
      const diag = scoreClusteringPairWithoutSerp(aInput, bInput, taxonomy);
      if (!diag.anchorGatePassed) continue;
      const thresholdDistance = Math.abs(diag.combinedScore - minEdge);
      if (thresholdDistance > band) continue;
      serpCandidates.push({ reason: 'borderline-clustering', keywordA: aInput.normalizedKeyword, keywordB: bInput.normalizedKeyword, thresholdDistance });
    }
  }

  const isAlreadyCached = (kw: string) => {
    const doc = identityMap.get(normalizeKeyword(kw)) ?? cachedKeywords.find((c) => c.normalizedKeyword === normalizeKeyword(kw));
    return classifySerpAge(doc?.serpSnapshot ?? null, { provider: serpProvider.id, locationCode: 2356, languageCode: market.language, device: 'desktop', depth: 10 }, 'priority', new Date()) === 'fresh';
  };
  const { keywordsToFetch } = selectSerpCandidates(serpCandidates, isAlreadyCached);

  if (keywordsToFetch.length > 0 && serpProvider.isConfigured()) {
    const budget = await makeRunBudget(run);
    serpProvider.beginRun(budget);
    for (const kw of keywordsToFetch) {
      const doc = identityMap.get(normalizeKeyword(kw)) ?? cachedKeywords.find((c) => c.normalizedKeyword === normalizeKeyword(kw)) ?? null;
      const context = { provider: serpProvider.id, locationCode: 2356, languageCode: market.language, device: 'desktop' as const, depth: 10 };
      const ageClass = classifySerpAge(doc?.serpSnapshot ?? null, context, 'priority', new Date());
      if (ageClass === 'fresh') continue; // reuse without a paid call — handled by isAlreadyCached, defensive re-check
      try {
        const fresh = await serpProvider.getSerp(kw, market);
        // The HTTP call may have already been in flight when ownership was lost —
        // revalidate BEFORE persisting the returned snapshot.
        if (ownershipGuard.isLost()) throw new OwnershipLostError();
        await ownershipGuard.assertOwned();
        // getOrFetch also populates serpCache's own in-memory map for asOverlapProvider().
        await serpCache.getOrFetch(kw, market, { id: serpProvider.id, kind: 'serp', isConfigured: () => true, estimateCost: (op) => serpProvider.estimateCost(op), getSerp: async () => fresh });
        if (doc) {
          doc.serpSnapshot = { provider: serpProvider.id, locationCode: context.locationCode, languageCode: context.languageCode, device: context.device, depth: context.depth, schemaVersion: 1, retrievedAt: new Date(), topUrls: fresh.topUrls, topDomains: fresh.topDomains };
          await doc.save();
        }
      } catch (e) {
        if (isOwnershipLost(e)) throw e; // propagate — stop issuing further SERP attempts, run left resumable
        if (isAuthorizationCeilingExhausted(e)) throw e; // propagate — stop issuing further SERP attempts, revive to pending-approval
        const usableStale = doc?.serpSnapshot && ageClass === 'stale-but-usable';
        if (usableStale) {
          await serpCache.getOrFetch(kw, market, {
            id: serpProvider.id,
            kind: 'serp',
            isConfigured: () => true,
            estimateCost: (op) => serpProvider.estimateCost(op),
            getSerp: async () => ({ keyword: kw, topUrls: doc!.serpSnapshot!.topUrls, topDomains: doc!.serpSnapshot!.topDomains, resultTypes: [], features: [], retrievedAt: doc!.serpSnapshot!.retrievedAt.toISOString() }),
          });
          degradationReasons.push(`serp-stale-fallback-used: "${kw}"`);
        } else {
          degradationReasons.push(`serp-unresolved: "${kw}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    run.costActualUsd = Math.max(run.costActualUsd, budget.getCumulativeRunUsd());
    run.counts.serpsFetched = keywordsToFetch.length;
    await run.save();
  } else if (keywordsToFetch.length > 0 && !serpProvider.isConfigured()) {
    degradationReasons.push('serp-selected-but-provider-unconfigured');
  }

  // ── 24-25: final clustering WITH SERP evidence ──
  run.stage = 'final-clustering';
  await run.save();
  let finalClusters: ClusterResult[];
  try {
    finalClusters = clusterKeywords({ keywords: clusteringInputs, taxonomy, serpOverlap: serpCache.asOverlapProvider(market) }).clusters;
  } catch (e) {
    await failRun(run, `final clustering failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // ── 26-27: final mapping + cannibalization (SAME taxonomy/pageCandidates/gscIndex/evidence) ──
  run.stage = 'final-mapping';
  await run.save();
  const finalEntries: CannibalizationEntry[] = [];
  const finalMemberEvidenceByCluster = new Map<ClusterResult, MappingKeywordEvidenceRow[]>();
  for (const cluster of finalClusters) {
    const memberEvidence = buildMemberEvidenceForCluster(cluster);
    if (!memberEvidence) {
      degradationReasons.push(`final-mapping-skipped: cluster "${cluster.label}" has an unresolved member`);
      continue;
    }
    try {
      const mapping = mapClusterToUrl({ cluster, memberEvidence, taxonomy } as MappingClusterInput, pageCandidates, gscIndex);
      finalEntries.push({ cluster, taxonomy, mapping });
      finalMemberEvidenceByCluster.set(cluster, memberEvidence);
    } catch (e) {
      degradationReasons.push(`final-mapping-failed: cluster "${cluster.label}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const finalGuarded = applyCannibalizationGuard(finalEntries, pageCandidates);
  run.counts.clusters = finalClusters.length;
  run.counts.mappingsProduced = finalGuarded.length;

  // ── 28-29: stable cluster identity + persistence (FINAL clusters only) ──
  run.stage = 'scoring';
  await run.save();
  const baselineRun = await SearchMarketRun.findOne({ status: 'completed', stage: 'finished', persistenceStage: 'done', 'market.country': market.country, 'market.language': market.language }).sort({ createdAt: -1 }).exec();
  const oldClusters: (IdentityClusterInput & { stableClusterId: string })[] = baselineRun
    ? (await SearchCluster.find({ runId: baselineRun._id }).exec()).map((c) => ({ id: String(c._id), stableClusterId: c.stableClusterId ?? String(c._id), normalizedKeywords: c.memberships.map((m) => normalizeKeyword(m.keyword)) }))
    : [];
  const newClusterInputs: IdentityClusterInput[] = finalEntries.map((e, i) => ({ id: String(i), normalizedKeywords: e.cluster.members.map((m) => m.normalizedKeyword) }));
  const identityMatches = matchClustersToStableIds(oldClusters, newClusterInputs, marketConfig.orchestrator.clusterMatchThreshold);

  // Ownership must hold before this run commits ANY final, persisted cluster state.
  if (ownershipGuard.isLost()) throw new OwnershipLostError();
  await ownershipGuard.assertOwned();

  try {
    for (let i = 0; i < finalEntries.length; i++) {
      const { cluster } = finalEntries[i];
      const stableClusterId = identityMatches[i].stableClusterId;
      await SearchCluster.create({
        market,
        label: cluster.label,
        primaryIntent: cluster.primaryIntent,
        intents: cluster.intents.map((s) => ({ intent: s.intent, confidence: s.confidence, reasons: s.reasons })),
        memberships: cluster.members.map((m) => ({ keywordId: new mongoose.Types.ObjectId(m.keywordId), keyword: m.keyword, membershipScore: m.membershipScore, reasons: m.reasons })),
        clusterReasons: cluster.clusterReasons,
        serpOverlapEvidence: cluster.serpOverlapEvidence ? { ...cluster.serpOverlapEvidence, capturedAt: new Date(cluster.serpOverlapEvidence.capturedAt) } : null,
        status: 'active',
        version: 1,
        runId: run._id,
        stableClusterId, // NOT consumed by 4b.6's topicKey — deferred, per frozen design
      });
    }
  } catch (e) {
    await failRun(run, `final cluster persistence failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // ── 30-33: opportunity evidence + scoring ──
  const drafts: MarketOpportunityDraft[] = [];
  finalEntries.forEach((entry, i) => {
    const finalMapping = finalGuarded[i];
    const memberEvidence = finalMemberEvidenceByCluster.get(entry.cluster);
    if (!memberEvidence) return;
    try {
      const opportunityEvidence = buildOpportunityKeywordEvidence(memberEvidence, taxonomy);
      const clusterGscDemand = buildClusterGscDemandEvidence(entry.cluster, gscIndex);
      const matchedPageGsc = buildMatchedPageGscEvidence(entry.cluster, finalMapping, gscIndex);
      const draft = scoreOpportunity({ cluster: entry.cluster, mapping: finalMapping, memberEvidence: opportunityEvidence, clusterGscDemand, matchedPageGsc, taxonomy });
      if (draft) drafts.push(draft);
    } catch (e) {
      degradationReasons.push(`opportunity-scoring-failed: cluster "${entry.cluster.label}": ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  run.counts.opportunities = drafts.length;

  // ── 34: resolution coverage for every open recommendation ──
  const coverage = computeResolutionCoverage(
    openRecommendations.map((r) => ({ fingerprint: r.fingerprint, memberKeywords: (r.evidence as { memberKeywords?: string[] } | undefined)?.memberKeywords })),
    universe.carryForwardVerdicts as Map<string, MemberCoverageStatus>,
  );
  if (!allOpenRecommendationsCovered(coverage)) {
    degradationReasons.push('resolution-coverage-incomplete');
  }

  // ── 35-36: evaluationOutcome ──
  const evaluationOutcome: 'completed' | 'degraded' = degradationReasons.length === 0 ? 'completed' : 'degraded';

  // ── 37: freeze evaluationSnapshot ──
  // Ownership must hold before the snapshot (the resolution-capability gate) is written at all.
  if (ownershipGuard.isLost()) throw new OwnershipLostError();
  await ownershipGuard.assertOwned();
  const snapshot = buildEvaluationSnapshot(drafts, evaluationOutcome, degradationReasons);
  run.evaluationSnapshot = snapshot;
  run.stage = 'persisting';
  await run.save();

  // ── 38-39: staged persistence + terminalization ──
  await runStagedPersistence(run, ownershipGuard);
}

async function runStagedPersistence(run: ISearchMarketRunDoc, ownershipGuard: MarketPipelineOwnershipGuard): Promise<void> {
  const snap = run.evaluationSnapshot!;
  const drafts = snap.drafts as unknown as MarketOpportunityDraft[];

  const assertStillOwned = async (): Promise<void> => {
    if (ownershipGuard.isLost()) throw new OwnershipLostError();
    await ownershipGuard.assertOwned();
  };

  if (run.persistenceStage === 'not-started') {
    await assertStillOwned();
    run.persistenceStage = 'upserting';
    await run.save();
  }
  if (run.persistenceStage === 'upserting') {
    await assertStillOwned(); // no NEW recommendation mutation may start after ownership loss
    const result = await upsertMarketOpportunityDrafts(run._id as mongoose.Types.ObjectId, drafts);
    run.counts.recommendationsCreated = result.created;
    run.counts.recommendationsUpdated = result.updated;
    run.persistenceStage = 'upserted';
    await run.save();
  }
  if (run.persistenceStage === 'upserted') {
    await assertStillOwned();
    run.persistenceStage = snap.allowResolution ? 'resolving' : 'done';
    await run.save();
  }
  if (run.persistenceStage === 'resolving') {
    // Resolution is the highest-stakes mutation (it can close out real
    // recommendations) — ownership is revalidated IMMEDIATELY before it starts,
    // not relying on any earlier check in this function.
    await assertStillOwned();
    // Never resolve using a freshly recomputed fingerprint list — always the frozen snapshot's.
    const result = await resolveMissingMarketOpportunities(run._id as mongoose.Types.ObjectId, snap.draftFingerprints);
    run.counts.recommendationsResolved = result.resolved;
    run.persistenceStage = 'done';
    await run.save();
  }

  await assertStillOwned(); // a stale owner must never claim successful completed/degraded terminalization
  run.status = snap.evaluationOutcome === 'completed' ? 'completed' : 'degraded';
  run.degradedReason = snap.evaluationOutcome === 'degraded' ? snap.degradationReasons.join('; ') : null;
  run.stage = 'finished';
  run.finishedAt = new Date();
  await run.save();
}
