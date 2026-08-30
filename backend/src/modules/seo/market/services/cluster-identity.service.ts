import { randomUUID } from 'crypto';

/**
 * Exact, one-to-one, run-scoped cluster identity matching (4b.7, FROZEN
 * design). Compares only against the most recent TRUSTWORTHY prior state
 * (caller is responsible for selecting clusters from a run with
 * status:'completed', stage:'finished', persistenceStage:'done' — this
 * module does not query the database itself, it is pure).
 */

export interface IdentityClusterInput {
  id: string; // the persisted _id (old) or a temp key (new) — opaque to this module
  normalizedKeywords: string[];
}

export interface ClusterMatchResult {
  newClusterId: string;
  stableClusterId: string; // inherited from an old cluster, or freshly generated
  matchedOldClusterId: string | null; // null when no qualifying match existed
  jaccard: number | null;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Greedy maximum-weight one-to-one matching: repeatedly pick the single
 * highest-scoring (old,new) pair clearing `threshold`, assign, remove both
 * from further consideration, repeat. Deterministic tie-break: old
 * stableClusterId ascending, then new normalizedKeywords[0] (or joined label
 * proxy) ascending — callers pass a stable, precomputed `oldStableClusterId`
 * per old cluster and rely on array order for the new-side tie-break input.
 */
export function matchClustersToStableIds(
  oldClusters: (IdentityClusterInput & { stableClusterId: string })[],
  newClusters: IdentityClusterInput[],
  threshold = 0.5,
): ClusterMatchResult[] {
  const oldSets = oldClusters.map((c) => new Set(c.normalizedKeywords));
  const newSets = newClusters.map((c) => new Set(c.normalizedKeywords));

  // Full score matrix.
  const scores: { oldIdx: number; newIdx: number; score: number }[] = [];
  for (let i = 0; i < oldClusters.length; i++) {
    for (let j = 0; j < newClusters.length; j++) {
      const score = jaccard(oldSets[i], newSets[j]);
      if (score >= threshold) scores.push({ oldIdx: i, newIdx: j, score });
    }
  }

  // Deterministic ordering: score desc, then old stableClusterId asc, then new id asc.
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const oldCmp = oldClusters[a.oldIdx].stableClusterId.localeCompare(oldClusters[b.oldIdx].stableClusterId);
    if (oldCmp !== 0) return oldCmp;
    return newClusters[a.newIdx].id.localeCompare(newClusters[b.newIdx].id);
  });

  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  const matchByNewIdx = new Map<number, { oldIdx: number; score: number }>();

  for (const s of scores) {
    if (usedOld.has(s.oldIdx) || usedNew.has(s.newIdx)) continue; // one-to-one: each row/column used at most once
    usedOld.add(s.oldIdx);
    usedNew.add(s.newIdx);
    matchByNewIdx.set(s.newIdx, { oldIdx: s.oldIdx, score: s.score });
  }

  return newClusters.map((nc, j) => {
    const match = matchByNewIdx.get(j);
    if (!match) {
      return { newClusterId: nc.id, stableClusterId: randomUUID(), matchedOldClusterId: null, jaccard: null };
    }
    const old = oldClusters[match.oldIdx];
    return { newClusterId: nc.id, stableClusterId: old.stableClusterId, matchedOldClusterId: old.id, jaccard: match.score };
  });
}
