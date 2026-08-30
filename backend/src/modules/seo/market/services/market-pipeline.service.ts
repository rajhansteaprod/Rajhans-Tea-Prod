import mongoose from 'mongoose';
import { marketConfig } from '../market.config';
import { Market, MarketOpportunityDraft } from '../market.types';
import { SearchMarketRun, ISearchMarketRunDoc } from '../models/search-market-run.model';
import { SearchSeed } from '../models/search-seed.model';
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
import { clusterKeywords, ClusteringKeywordInput, ClusterResult } from './clustering.engine';
import { mapClusterToUrl, MappingClusterInput } from './url-mapper';
import { applyCannibalizationGuard, CannibalizationEntry } from './cannibalization-guard';
import { buildPageCandidates } from './page-candidate.builder';
import { loadGscEvidenceIndex } from './gsc-evidence-index';
import { buildOpportunityKeywordEvidence, scoreOpportunity } from './opportunity-scoring';
import { matchClustersToStableIds, IdentityClusterInput } from './cluster-identity.service';
import { buildEvaluationSnapshot, selectSerpCandidates, SerpCandidateUnit } from './market-orchestrator.service';
import { reserveAttemptCost } from './market-cost-reservation.service';
import { upsertMarketOpportunityDrafts, resolveMissingMarketOpportunities } from './market-recommendation.service';
import { SerpOverlapCache } from './serp-overlap.provider';
import { normalizeKeyword } from './keyword-normalize';
import { DataForSeoProvider, DurableAttemptRefusedError, BeforePhysicalAttemptContext } from '../providers/dataforseo/dataforseo.provider';
import { DataForSeoSerpProvider } from '../providers/dataforseo/dataforseo-serp.provider';
import { RunBudget } from '../providers/dataforseo/run-budget';
import { monthToDateSpendUsd } from './cost-governor';

/**
 * Phase 4b.7 — the real integrated pipeline. Composes the existing, already
 * frozen/tested 4b.1–4b.7 primitives in the approved two-pass order; contains
 * no clustering/mapping/scoring/relevance/GSC/cost formulas of its own.
 *
 * Every paid provider call goes through a fresh provider instance carrying
 * the durable `beforePhysicalAttempt` hook (§5 of the approved seam plan) —
 * the process-wide `providerRegistry` instances (no hook) are never used for
 * orchestrated paid work.
 */

function durableHook(runId: mongoose.Types.ObjectId) {
  return async (ctx: BeforePhysicalAttemptContext): Promise<void> => {
    const result = await reserveAttemptCost(runId, ctx.estimatedCostUsd);
    if (!result.allowed) throw new DurableAttemptRefusedError(result.reason);
  };
}

async function makeRunBudget(run: ISearchMarketRunDoc): Promise<RunBudget> {
  const monthToDateUsd = await monthToDateSpendUsd();
  return new RunBudget({ monthToDateUsd, approvedForManualThreshold: run.authorizationMode !== null });
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

export async function runFullPipeline(runId: mongoose.Types.ObjectId): Promise<void> {
  const run = await SearchMarketRun.findById(runId).exec();
  if (!run) throw new Error(`runFullPipeline: run ${String(runId)} not found`);

  // Resume case B — evaluationSnapshot already frozen: never recompute evidence/scoring, only resume staged persistence.
  if (run.evaluationSnapshot) {
    await runStagedPersistence(run);
    return;
  }

  const market: Market = run.market;
  const degradationReasons: string[] = [];
  const keywordProvider = new DataForSeoProvider({ beforePhysicalAttempt: durableHook(run._id as mongoose.Types.ObjectId) });
  const serpProvider = new DataForSeoSerpProvider({ beforePhysicalAttempt: durableHook(run._id as mongoose.Types.ObjectId) });

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

  // ── 4-5: discovery freshness + optional discovery ──
  const seedDocs = await SearchSeed.find({ enabled: true, 'market.country': market.country, 'market.language': market.language }).exec();
  const dueSeedDocs = seedDocs.filter((s) => isSeedDiscoveryDue(s.providerDiscoveryState ?? [], keywordProvider.id));
  let discoveryKeywordStrings: string[] = [];

  if (dueSeedDocs.length > 0 && keywordProvider.isConfigured()) {
    try {
      const budget = await makeRunBudget(run);
      keywordProvider.beginRun(budget);
      const results = await keywordProvider.discoverKeywords(dueSeedDocs.map((s) => s.term), market);
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
      if (e instanceof DurableAttemptRefusedError) {
        // Authorization exhausted or hard-capped mid-discovery — stop new paid
        // work, keep whatever was already fetched/persisted, degrade rather
        // than fail (a scoped-down version of the full pending-approval
        // revival flow — see delivery notes).
        degradationReasons.push(`discovery-authorization-exhausted: ${e.reason}`);
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
    seeds, discoveryKeywords: discoveryKeywordStrings, cachedKeywords, carryForwardKeywords, keywordIdentityMap: identityMap, taxonomy, now: new Date(),
  });
  if (universe.active.length === 0) {
    await failRun(run, 'active keyword universe is empty — nothing to evaluate');
    return;
  }

  const metricsMap = await loadLatestMetricsByKeywordIds(universe.active.map((k) => new mongoose.Types.ObjectId(k.keywordId)), keywordProvider.id);

  // ── 12-13: MappingKeywordEvidence (records stale-demand degradation internally) ──
  const { evidence: mappingEvidenceList, degradationReasons: demandDegradations } = buildMappingKeywordEvidence(universe.active, metricsMap, taxonomy, new Date());
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
  // NOTE: 'borderline-clustering' candidates are not generated in this pass —
  // clusterKeywords() (4b.3, frozen) does not expose intermediate pairwise
  // scores/threshold distances needed to compute them without reaching into
  // clustering internals. See delivery notes.

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
        // getOrFetch also populates serpCache's own in-memory map for asOverlapProvider().
        await serpCache.getOrFetch(kw, market, { id: serpProvider.id, kind: 'serp', isConfigured: () => true, estimateCost: (op) => serpProvider.estimateCost(op), getSerp: async () => fresh });
        if (doc) {
          doc.serpSnapshot = { provider: serpProvider.id, locationCode: context.locationCode, languageCode: context.languageCode, device: context.device, depth: context.depth, schemaVersion: 1, retrievedAt: new Date(), topUrls: fresh.topUrls, topDomains: fresh.topDomains };
          await doc.save();
        }
      } catch (e) {
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
  const snapshot = buildEvaluationSnapshot(drafts, evaluationOutcome, degradationReasons);
  run.evaluationSnapshot = snapshot;
  run.stage = 'persisting';
  await run.save();

  // ── 38-39: staged persistence + terminalization ──
  await runStagedPersistence(run);
}

async function runStagedPersistence(run: ISearchMarketRunDoc): Promise<void> {
  const snap = run.evaluationSnapshot!;
  const drafts = snap.drafts as unknown as MarketOpportunityDraft[];

  if (run.persistenceStage === 'not-started') {
    run.persistenceStage = 'upserting';
    await run.save();
  }
  if (run.persistenceStage === 'upserting') {
    const result = await upsertMarketOpportunityDrafts(run._id as mongoose.Types.ObjectId, drafts);
    run.counts.recommendationsCreated = result.created;
    run.counts.recommendationsUpdated = result.updated;
    run.persistenceStage = 'upserted';
    await run.save();
  }
  if (run.persistenceStage === 'upserted') {
    run.persistenceStage = snap.allowResolution ? 'resolving' : 'done';
    await run.save();
  }
  if (run.persistenceStage === 'resolving') {
    // Never resolve using a freshly recomputed fingerprint list — always the frozen snapshot's.
    const result = await resolveMissingMarketOpportunities(run._id as mongoose.Types.ObjectId, snap.draftFingerprints);
    run.counts.recommendationsResolved = result.resolved;
    run.persistenceStage = 'done';
    await run.save();
  }

  run.status = snap.evaluationOutcome === 'completed' ? 'completed' : 'degraded';
  run.degradedReason = snap.evaluationOutcome === 'degraded' ? snap.degradationReasons.join('; ') : null;
  run.stage = 'finished';
  run.finishedAt = new Date();
  await run.save();
}
