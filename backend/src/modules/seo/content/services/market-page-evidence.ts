import mongoose from 'mongoose';
import { SearchKeyword } from '../../market/models/search-keyword.model';
import { SearchKeywordMetric } from '../../market/models/search-keyword-metric.model';
import { SearchCluster } from '../../market/models/search-cluster.model';
import { SeoRecommendation } from '../../models/seo-recommendation.model';
import { classifyKeywordMetricAge } from '../../market/services/evidence-freshness.service';
import { normalizeKeyword } from '../../market/services/keyword-normalize';
import { contentConfig } from '../content.config';
import { EvidenceFreshness, PageMarketEvidence, PageMarketKeyword } from '../content.types';

/**
 * Phase 6.1 — Phase 4B market evidence, read from CACHE ONLY.
 *
 * ZERO paid provider calls. This module imports no provider, no registry and no
 * client; it reads `SearchKeyword`, `SearchKeywordMetric`, `SearchCluster` and
 * already-persisted market recommendations, and nothing else. Stale evidence is
 * MARKED stale and still reported — never silently refreshed — and absent
 * evidence never fails the analysis, because GSC and first-party page state
 * remain sufficient on their own.
 *
 * Mapping keyword→page uses the two relationships Phase 4B actually persists:
 *   1. `SearchKeyword.currentRajhansUrl`, the direct stored mapping;
 *   2. the `memberKeywords` recorded on open `source:'market'` recommendations,
 *      which is where a completed 4b.7 run's cluster→URL mapping survives.
 * The 4b URL mapper itself is never re-run: re-clustering would be neither free
 * nor deterministic here.
 */

interface MarketRecommendationEvidence {
  clusterLabel?: string;
  memberKeywords?: string[];
  primaryIntent?: string | null;
}

export interface MarketEvidenceBundle {
  /** True when the market module has any stored keyword evidence at all. */
  present: boolean;
  byUrl: Map<string, PageMarketEvidence>;
  /** Newest keyword-metric capture seen, for evidence-window provenance. */
  newestCaptureAt: Date | null;
}

const emptyEvidence = (): PageMarketEvidence => ({
  known: false,
  freshness: 'unknown',
  keywords: [],
  keywordCount: 0,
  keywordsTruncated: false,
  clusters: [],
  serpSnapshotAt: null,
  openMarketRecommendationIds: [],
});

/** Freshest wins: a page's evidence is as good as its best-dated keyword. */
const FRESHNESS_RANK: Record<EvidenceFreshness, number> = {
  fresh: 3,
  'stale-but-usable': 2,
  'too-old': 1,
  unknown: 0,
};

/**
 * Newest metric snapshot per keyword, across providers.
 *
 * Deliberately NOT `loadLatestMetricsByKeywordIds`, which is provider-scoped
 * because 4b must never average across providers when SCORING. This is a
 * different question — "what is the freshest thing we know about this keyword?"
 * — and it answers it by picking one single snapshot (never combining any two),
 * so the no-cross-provider-arithmetic rule still holds.
 */
async function loadNewestMetrics(
  keywordIds: mongoose.Types.ObjectId[],
): Promise<Map<string, { searchVolume: number | null; capturedAt: Date }>> {
  const out = new Map<string, { searchVolume: number | null; capturedAt: Date }>();
  if (!keywordIds.length) return out;
  const rows = await SearchKeywordMetric.aggregate([
    { $match: { keywordId: { $in: keywordIds } } },
    { $sort: { keywordId: 1, capturedAt: -1 } },
    { $group: { _id: '$keywordId', doc: { $first: '$$ROOT' } } },
  ]).exec();
  for (const row of rows as { _id: mongoose.Types.ObjectId; doc: { searchVolume: number | null; capturedAt: Date } }[]) {
    out.set(String(row._id), { searchVolume: row.doc.searchVolume ?? null, capturedAt: row.doc.capturedAt });
  }
  return out;
}

/** ONE bounded read per collection for the whole batch. */
export async function loadMarketEvidence(urls: string[], now = new Date()): Promise<MarketEvidenceBundle> {
  const byUrl = new Map<string, PageMarketEvidence>();
  for (const u of urls) byUrl.set(u, emptyEvidence());
  if (!urls.length) return { present: false, byUrl, newestCaptureAt: null };

  // ── mapping source 1: the direct stored keyword→URL mapping ──
  const directKeywords = await SearchKeyword.find({ currentRajhansUrl: { $in: urls } })
    .select('keyword normalizedKeyword currentRajhansUrl businessRelevance commercialIntent clusterId serpSnapshot')
    .lean()
    .exec();

  // ── mapping source 2: member keywords recorded on open market recommendations ──
  const marketRecs = await SeoRecommendation.find({ status: 'open', source: 'market', affectedUrls: { $in: urls } })
    .select('recommendationId affectedUrls evidence')
    .lean()
    .exec();

  const urlSet = new Set(urls);
  const keywordNamesByUrl = new Map<string, Set<string>>();
  const recIdsByUrl = new Map<string, string[]>();
  const clusterLabelsByUrl = new Map<string, Set<string>>();

  for (const url of urls) {
    keywordNamesByUrl.set(url, new Set());
    recIdsByUrl.set(url, []);
    clusterLabelsByUrl.set(url, new Set());
  }
  for (const k of directKeywords) {
    const url = k.currentRajhansUrl as string;
    if (urlSet.has(url)) keywordNamesByUrl.get(url)!.add(k.normalizedKeyword);
  }
  for (const rec of marketRecs) {
    const evidence = (rec.evidence ?? {}) as MarketRecommendationEvidence;
    for (const url of rec.affectedUrls ?? []) {
      if (!urlSet.has(url)) continue;
      recIdsByUrl.get(url)!.push(rec.recommendationId);
      if (evidence.clusterLabel) clusterLabelsByUrl.get(url)!.add(evidence.clusterLabel);
      for (const kw of evidence.memberKeywords ?? []) keywordNamesByUrl.get(url)!.add(normalizeKeyword(kw));
    }
  }

  // ── hydrate every referenced keyword in one read ──
  const allNames = new Set<string>();
  for (const set of keywordNamesByUrl.values()) for (const n of set) allNames.add(n);
  const keywordDocs = allNames.size
    ? await SearchKeyword.find({ normalizedKeyword: { $in: [...allNames] } })
        .select('keyword normalizedKeyword businessRelevance commercialIntent clusterId serpSnapshot')
        .lean()
        .exec()
    : [];
  const keywordByName = new Map(keywordDocs.map((k) => [k.normalizedKeyword, k]));
  const metrics = await loadNewestMetrics(keywordDocs.map((k) => k._id as mongoose.Types.ObjectId));

  // ── cluster labels for the referenced keywords ──
  const clusterIds = [...new Set(keywordDocs.map((k) => k.clusterId).filter(Boolean))] as mongoose.Types.ObjectId[];
  const clusters = clusterIds.length
    ? await SearchCluster.find({ _id: { $in: clusterIds } })
        .select('label primaryIntent stableClusterId memberships')
        .lean()
        .exec()
    : [];
  const clusterById = new Map(clusters.map((c) => [String(c._id), c]));

  let newestCaptureAt: Date | null = null;

  for (const url of urls) {
    const names = [...keywordNamesByUrl.get(url)!];
    const recIds = recIdsByUrl.get(url)!;
    if (!names.length && !recIds.length) continue;

    const keywords: PageMarketKeyword[] = [];
    const clusterKeys = new Map<string, PageMarketEvidence['clusters'][number]>();
    let serpSnapshotAt: Date | null = null;

    for (const name of names) {
      const doc = keywordByName.get(name);
      if (!doc) continue;
      const metric = metrics.get(String(doc._id)) ?? null;
      const capturedAt = metric?.capturedAt ? new Date(metric.capturedAt) : null;
      const freshness = classifyKeywordMetricAge(capturedAt, now) as EvidenceFreshness;
      if (capturedAt && (!newestCaptureAt || capturedAt > newestCaptureAt)) newestCaptureAt = capturedAt;

      keywords.push({
        keyword: doc.keyword,
        normalizedKeyword: doc.normalizedKeyword,
        // UNKNOWN stays null. A keyword with no captured metric is not a
        // zero-volume keyword.
        searchVolume: metric?.searchVolume ?? null,
        volumeKnown: metric?.searchVolume !== null && metric?.searchVolume !== undefined,
        businessRelevanceBand: doc.businessRelevance?.band ?? null,
        commercialIntentBand: doc.commercialIntent?.band ?? null,
        capturedAt,
        freshness,
      });

      const snapAt = doc.serpSnapshot?.retrievedAt ? new Date(doc.serpSnapshot.retrievedAt) : null;
      if (snapAt && (!serpSnapshotAt || snapAt > serpSnapshotAt)) serpSnapshotAt = snapAt;

      const cluster = doc.clusterId ? clusterById.get(String(doc.clusterId)) : null;
      if (cluster && !clusterKeys.has(String(cluster._id))) {
        clusterKeys.set(String(cluster._id), {
          label: cluster.label,
          primaryIntent: cluster.primaryIntent ?? null,
          stableClusterId: cluster.stableClusterId ?? null,
          memberCount: cluster.memberships?.length ?? 0,
        });
      }
    }

    // Cluster labels recorded on a market recommendation, for pages whose
    // keywords are not individually linked to a persisted cluster document.
    for (const label of clusterLabelsByUrl.get(url)!) {
      if ([...clusterKeys.values()].some((c) => c.label === label)) continue;
      clusterKeys.set(`label:${label}`, { label, primaryIntent: null, stableClusterId: null, memberCount: 0 });
    }

    const ranked = keywords.sort(
      (a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1) || a.normalizedKeyword.localeCompare(b.normalizedKeyword),
    );
    const kept = ranked.slice(0, contentConfig.limits.maxMarketKeywordsPerAnalysis);
    const freshness = kept.reduce<EvidenceFreshness>(
      (best, k) => (FRESHNESS_RANK[k.freshness] > FRESHNESS_RANK[best] ? k.freshness : best),
      'unknown',
    );

    byUrl.set(url, {
      known: kept.length > 0,
      freshness,
      keywords: kept,
      keywordCount: keywords.length,
      keywordsTruncated: keywords.length > kept.length,
      clusters: [...clusterKeys.values()],
      serpSnapshotAt,
      openMarketRecommendationIds: recIds,
    });
  }

  return { present: keywordDocs.length > 0, byUrl, newestCaptureAt };
}
