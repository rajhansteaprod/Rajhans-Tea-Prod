import { Intent, SerpOverlapProvider } from '../market.types';
import { BASE_TAXONOMY, RelevanceTaxonomy, anchorTermsOf, classifyKeyword, modifierEvidenceOf } from '../relevance.taxonomy';
import { finalizeIntents, KeywordIntentResult } from './intent-classifier';
import { marketConfig } from '../market.config';

/**
 * Deterministic keyword clustering (4b.3). No embeddings, no API calls, no
 * persistence — pure in-memory function of its input. See docs/phase4b-search-
 * market-design.md §7 and the approved 4b.3 plan for the full rationale.
 *
 * KEY RULES ENFORCED HERE:
 *  - Anti-bridging: pairwise edges alone are NOT sufficient. Every non-singleton
 *    cluster must retain one anchor term common to ALL members simultaneously
 *    (checked post Union-Find); incoherent components are split deterministically.
 *  - The anchor gate is the conservative PRE-SERP rule for 4b.3: it is required
 *    unconditionally. SERP evidence (when it exists, 4b.5+) does NOT bypass it —
 *    that is an explicit, documented open question for 4b.5 to revisit, not a
 *    behavior implemented here.
 *  - UNKNOWN/absent ≠ 0 for EVERY signal (lexical/entity/modifier/intent/serp):
 *    an unavailable signal is excluded from the weighted average and weights are
 *    renormalized over what IS available, never defaulted into the sum as 0.
 *  - Every score is guarded to a finite number in [0,1] via `safe01`.
 *  - Deterministic regardless of input order: the candidate edge set is a pure
 *    function of keyword content; medoid/label/split tie-breaks use fixed,
 *    content-derived rules (never array position).
 */

export type ClusterSignalName = 'lexical' | 'entity' | 'modifier' | 'intent' | 'serp';

export interface ClusterSignalScore {
  signal: ClusterSignalName;
  score: number; // finite, 0..1
  available: boolean;
  detail?: string;
}
export interface ClusterMembershipReason {
  signal: ClusterSignalName;
  score: number;
  detail?: string;
}
export interface ClusterIntentSummary {
  intent: Intent;
  confidence: number; // finite, 0..1
  reasons: string[];
}
export interface ClusterSerpOverlapEvidence {
  score: number;
  sharedDomains: string[];
  sharedUrls: string[];
  reasons: string[];
  capturedAt: string;
}
export interface ClusterMember {
  keywordId: string;
  keyword: string;
  normalizedKeyword: string;
  membershipScore: number; // similarity to the cluster's medoid, NOT the union edge that first connected it
  reasons: ClusterMembershipReason[];
}
export interface ClusterResult {
  label: string; // medoid's surface form
  medoidKeywordId: string;
  primaryIntent: Intent | null;
  intents: ClusterIntentSummary[];
  clusterReasons: string[];
  members: ClusterMember[];
  serpOverlapEvidence: ClusterSerpOverlapEvidence | null; // always null in 4b.3
}
export interface ClusteringKeywordInput {
  keywordId: string;
  keyword: string;
  normalizedKeyword: string;
}
export interface ClusteringExcludedKeyword {
  keywordId: string;
  keyword: string;
  reason: 'hard_negative';
}
export interface ClusteringOutput {
  clusters: ClusterResult[];
  excludedKeywords: ClusteringExcludedKeyword[];
}
export interface ClusteringInput {
  keywords: ClusteringKeywordInput[];
  taxonomy?: RelevanceTaxonomy;
  /** Optional, provider-neutral. 4b.3 ships no implementation — see market.types.ts. */
  serpOverlap?: SerpOverlapProvider;
}

// ── guards ──
const safe01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function lexicalTokensOf(normalizedKeyword: string): Set<string> {
  return new Set(normalizedKeyword.split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = a.size + b.size - [...a].filter((x) => b.has(x)).length;
  if (union === 0) return 0; // both empty — guard 0/0
  const inter = [...a].filter((x) => b.has(x)).length;
  return safe01(inter / union);
}

/** intersection / min(|A|,|B|). Explicitly 0 if either set is empty (guards 0/0/NaN). */
function overlapCoefficient(a: Set<string>, b: Set<string>): { coefficient: number; intersectionSize: number } {
  if (a.size === 0 || b.size === 0) return { coefficient: 0, intersectionSize: 0 };
  const intersectionSize = [...a].filter((x) => b.has(x)).length;
  return { coefficient: safe01(intersectionSize / Math.min(a.size, b.size)), intersectionSize };
}

interface KeywordFacts {
  input: ClusteringKeywordInput;
  anchors: Set<string>;
  modifiers: Set<string>;
  tokens: Set<string>;
  intents: KeywordIntentResult[];
}

interface PairScore {
  signals: ClusterSignalScore[];
  combinedScore: number;
  gatePass: boolean; // anchor-overlap gate — the conservative PRE-SERP rule; SERP never bypasses it in 4b.3
}

function computePairScore(a: KeywordFacts, b: KeywordFacts, serpOverlap?: SerpOverlapProvider): PairScore {
  const lexicalAvailable = a.tokens.size > 0 && b.tokens.size > 0;
  const lexicalScore = lexicalAvailable ? jaccard(a.tokens, b.tokens) : 0;

  const { coefficient: entityScore, intersectionSize } = overlapCoefficient(a.anchors, b.anchors);
  const gatePass = intersectionSize > 0; // anchor gate — always required in 4b.3, never bypassed by SERP

  const modifierAvailable = a.modifiers.size > 0 || b.modifiers.size > 0; // unavailable only if BOTH have none
  const modifierScore = modifierAvailable ? jaccard(a.modifiers, b.modifiers) : 0;

  const intentAvailable = a.intents.length > 0 && b.intents.length > 0;
  const intentScore = intentAvailable ? (a.intents[0].intent === b.intents[0].intent ? 1 : 0) : 0;

  const signals: ClusterSignalScore[] = [
    { signal: 'lexical', score: safe01(lexicalScore), available: lexicalAvailable },
    { signal: 'entity', score: safe01(entityScore), available: true, detail: `${intersectionSize} shared anchor(s)` },
    { signal: 'modifier', score: safe01(modifierScore), available: modifierAvailable },
    { signal: 'intent', score: safe01(intentScore), available: intentAvailable },
  ];

  if (serpOverlap) {
    const evidence = serpOverlap.getPairEvidence(a.input.normalizedKeyword, b.input.normalizedKeyword);
    if (evidence) {
      signals.push({ signal: 'serp', score: safe01(evidence.score), available: true, detail: evidence.reasons.join('; ') });
    } else {
      signals.push({ signal: 'serp', score: 0, available: false, detail: 'no SERP evidence for this pair' });
    }
  }

  const weights = marketConfig.clustering.weights as Record<ClusterSignalName, number>;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of signals) {
    if (!s.available) continue;
    const w = weights[s.signal] ?? 0;
    weightedSum += w * s.score;
    weightTotal += w;
  }
  const combinedScore = weightTotal > 0 ? safe01(weightedSum / weightTotal) : 0;

  return { signals, combinedScore, gatePass };
}

// ── Union-Find ──
function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  }
  return { find, union };
}

/** Anchor terms common to every index in the group. Empty set = incoherent. */
function commonAnchors(indices: number[], facts: KeywordFacts[]): Set<string> {
  if (indices.length === 0) return new Set();
  let common = new Set(facts[indices[0]].anchors);
  for (let i = 1; i < indices.length && common.size > 0; i++) {
    const next = facts[indices[i]].anchors;
    common = new Set([...common].filter((t) => next.has(t)));
  }
  return common;
}

/** Deterministic tie-break: higher mean score → shortest normalizedKeyword → lexicographic. */
function pickMedoid(indices: number[], facts: KeywordFacts[], pairScoreOf: (i: number, j: number) => number): number {
  let best = indices[0];
  let bestMean = -Infinity;
  for (const i of indices) {
    const others = indices.filter((j) => j !== i);
    const mean = others.length === 0 ? 1 : safe01(others.reduce((sum, j) => sum + pairScoreOf(i, j), 0) / others.length);
    const bk = facts[i].input.normalizedKeyword;
    const bestKw = facts[best].input.normalizedKeyword;
    const better =
      mean > bestMean ||
      (mean === bestMean && bk.length < bestKw.length) ||
      (mean === bestMean && bk.length === bestKw.length && bk < bestKw);
    if (better) {
      best = i;
      bestMean = mean;
    }
  }
  return best;
}

/**
 * Splits an incoherent group deterministically: pick the medoid, then the
 * SINGLE anchor term (of the medoid's own anchors, tried alphabetically so ties
 * resolve to the alphabetically-first term) shared by the most other members;
 * everyone sharing it stays with the medoid, the remainder is re-examined
 * recursively (it may cohere on its own, or split further).
 */
function splitToCoherentGroups(indices: number[], facts: KeywordFacts[], pairScoreOf: (i: number, j: number) => number): number[][] {
  if (indices.length <= 1) return [indices];
  if (commonAnchors(indices, facts).size > 0) return [indices]; // already coherent

  const medoid = pickMedoid(indices, facts, pairScoreOf);
  const medoidAnchors = [...facts[medoid].anchors].sort();

  if (medoidAnchors.length === 0) {
    // Medoid itself has no anchors — cannot anchor a group; everyone stands alone.
    return indices.map((i) => [i]);
  }

  let bestTerm = medoidAnchors[0];
  let bestCount = -1;
  for (const term of medoidAnchors) {
    const count = indices.filter((i) => i !== medoid && facts[i].anchors.has(term)).length;
    if (count > bestCount) {
      bestCount = count;
      bestTerm = term; // medoidAnchors iterated alphabetically → first max wins ties deterministically
    }
  }

  const inSubgroup = indices.filter((i) => i === medoid || facts[i].anchors.has(bestTerm));
  const leftover = indices.filter((i) => !inSubgroup.includes(i));

  return [inSubgroup, ...splitToCoherentGroups(leftover, facts, pairScoreOf)];
}

function aggregateIntents(indices: number[], facts: KeywordFacts[]): ClusterIntentSummary[] {
  const byIntent = new Map<Intent, { confidenceSum: number; reasons: Set<string> }>();
  for (const i of indices) {
    for (const r of facts[i].intents) {
      const entry = byIntent.get(r.intent) ?? { confidenceSum: 0, reasons: new Set<string>() };
      entry.confidenceSum += safe01(r.confidence);
      for (const reason of r.reasons) entry.reasons.add(reason);
      byIntent.set(r.intent, entry);
    }
  }
  const memberCount = indices.length || 1;
  const summaries: ClusterIntentSummary[] = [...byIntent.entries()].map(([intent, v]) => ({
    intent,
    confidence: safe01(v.confidenceSum / memberCount),
    reasons: [...v.reasons],
  }));
  summaries.sort((a, b) => b.confidence - a.confidence || a.intent.localeCompare(b.intent));
  return summaries;
}

export function clusterKeywords(input: ClusteringInput): ClusteringOutput {
  const taxonomy = input.taxonomy ?? BASE_TAXONOMY;
  const excludedKeywords: ClusteringExcludedKeyword[] = [];

  const activeInputs = input.keywords.filter((kw) => {
    const cls = classifyKeyword(kw.keyword, taxonomy);
    if (cls.hardNegative) {
      excludedKeywords.push({ keywordId: kw.keywordId, keyword: kw.keyword, reason: 'hard_negative' });
      return false;
    }
    return true;
  });

  // Sort by content (normalizedKeyword), not input array order — first step toward
  // full order-independence (final components don't depend on this either way,
  // since Union-Find connectivity is order-independent, but this keeps every
  // downstream tie-break's "first" truly content-derived).
  const sorted = [...activeInputs].sort((a, b) => a.normalizedKeyword.localeCompare(b.normalizedKeyword));

  const facts: KeywordFacts[] = sorted.map((kw) => ({
    input: kw,
    anchors: anchorTermsOf(kw.keyword, taxonomy),
    modifiers: modifierEvidenceOf(kw.keyword, taxonomy),
    tokens: lexicalTokensOf(kw.normalizedKeyword),
    intents: finalizeIntents(kw.keyword, taxonomy),
  }));

  const n = facts.length;
  const pairCache = new Map<string, PairScore>();
  const cacheKey = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);
  const pairScoreObj = (i: number, j: number): PairScore => {
    if (i === j) return { signals: [], combinedScore: 1, gatePass: true };
    const key = cacheKey(i, j);
    let cached = pairCache.get(key);
    if (!cached) {
      cached = computePairScore(facts[i], facts[j], input.serpOverlap);
      pairCache.set(key, cached);
    }
    return cached;
  };
  const pairScoreOf = (i: number, j: number): number => pairScoreObj(i, j).combinedScore;

  // Candidate edges — a pure function of content, independent of input order.
  const edges: { i: number; j: number; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = pairScoreObj(i, j);
      if (p.gatePass && p.combinedScore >= marketConfig.clustering.minEdgeScore) {
        edges.push({ i, j, score: p.combinedScore });
      }
    }
  }
  // Deterministic processing order (doesn't change final components, which are
  // order-independent for a fixed edge set, but required for reproducibility).
  edges.sort(
    (a, b) =>
      b.score - a.score ||
      facts[a.i].input.normalizedKeyword.localeCompare(facts[b.i].input.normalizedKeyword) ||
      facts[a.j].input.normalizedKeyword.localeCompare(facts[b.j].input.normalizedKeyword),
  );

  const uf = makeUnionFind(n);
  for (const e of edges) uf.union(e.i, e.j);

  const componentsByRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const arr = componentsByRoot.get(root) ?? [];
    arr.push(i);
    componentsByRoot.set(root, arr);
  }

  const finalGroups: number[][] = [];
  for (const component of componentsByRoot.values()) {
    for (const group of splitToCoherentGroups(component, facts, pairScoreOf)) {
      finalGroups.push(group);
    }
  }

  // Post-hoc, order-independent cap: never enforced by "stop while iterating".
  const cappedGroups: number[][] = [];
  for (const group of finalGroups) {
    if (group.length <= marketConfig.clustering.maxClusterSize) {
      cappedGroups.push(group);
      continue;
    }
    const medoid = pickMedoid(group, facts, pairScoreOf);
    const rest = group.filter((i) => i !== medoid).sort((a, b) => pairScoreOf(medoid, b) - pairScoreOf(medoid, a) || facts[a].input.normalizedKeyword.localeCompare(facts[b].input.normalizedKeyword));
    const kept = [medoid, ...rest.slice(0, marketConfig.clustering.maxClusterSize - 1)];
    const overflow = rest.slice(marketConfig.clustering.maxClusterSize - 1);
    cappedGroups.push(kept);
    for (const g of splitToCoherentGroups(overflow, facts, pairScoreOf)) cappedGroups.push(g);
  }

  const clusters: ClusterResult[] = cappedGroups
    .filter((g) => g.length > 0)
    .map((group) => {
      const medoid = group.length === 1 ? group[0] : pickMedoid(group, facts, pairScoreOf);
      const anchors = commonAnchors(group, facts);
      const intents = aggregateIntents(group, facts);
      const members: ClusterMember[] = group.map((i) => {
        const p = pairScoreObj(i, medoid);
        const reasons: ClusterMembershipReason[] = i === medoid ? [] : p.signals.filter((s) => s.available).map((s) => ({ signal: s.signal, score: s.score, detail: s.detail }));
        return {
          keywordId: facts[i].input.keywordId,
          keyword: facts[i].input.keyword,
          normalizedKeyword: facts[i].input.normalizedKeyword,
          membershipScore: i === medoid ? 1 : safe01(p.combinedScore),
          reasons,
        };
      });
      const clusterReasons: string[] = [];
      if (anchors.size > 0) clusterReasons.push(`entity: shared anchor(s) ${[...anchors].sort().join(', ')}`);
      if (intents.length > 0) clusterReasons.push(`intent: ${intents[0].intent} dominant (confidence ${intents[0].confidence.toFixed(2)})`);
      if (group.length === 1) clusterReasons.push('singleton: no other keyword met the clustering threshold');

      return {
        label: facts[medoid].input.keyword,
        medoidKeywordId: facts[medoid].input.keywordId,
        primaryIntent: intents[0]?.intent ?? null,
        intents,
        clusterReasons,
        members,
        serpOverlapEvidence: null, // always null in 4b.3 — no SERP provider exists yet
      };
    });

  return { clusters, excludedKeywords };
}
