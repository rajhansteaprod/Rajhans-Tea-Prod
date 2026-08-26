# Phase 4b — Search Market Discovery & Keyword Intelligence

**Status: DESIGN ONLY — awaiting approval. No implementation, no deployment, no cron,
no paid API usage, no content generation, no production DB writes.**

Goal: extend the SEO agent from *"how are our existing pages doing"* (Phase 2/3/4a) to
*"what is the tea/chai search market, what of it is realistic for Rajhans, and what should
we build or optimize next"* — an evidence-based organic growth roadmap that fuses external
search-market data + GSC performance + Rajhans inventory + audit/recommendations + business
relevance.

---

## 0. Reuse map (do NOT duplicate the existing system)

| Existing (Phase 2/3/4a) | Reused for Phase 4b |
|---|---|
| `SeoRecommendation` (fingerprint identity, open/resolved lifecycle, `source: 'audit'\|'gsc'`, evidence, diff, dashboard) | **The output layer.** Add `source: 'market'` + new categories; every market opportunity is a `SeoRecommendation`. No parallel "keyword dashboard". |
| Diff/lifecycle pattern (`fingerprint`, first/last-seen, resolvedRunId, NEW/PERSISTENT/RESOLVED, degraded-gated resolution) | Market-run diff for keywords/clusters/opportunities — same semantics. |
| `normalizeUrl`, `canonicalPageSlug`, **`gsc.join.ts` resolver** (exact→host-alias→trailing-slash→legacy→query-variant) | **Keyword→URL mapping** reuses the exact canonical resolver + `buildSeoContext()` canonical set. |
| `SeoPageSnapshot` + `buildSeoContext()` (canonical inventory, title/wordCount, open issues, open recs) | Site-inventory + existing-coverage evidence + business-relevance seeds. |
| `GscQueryPageMetric` / `GscPageDailyMetric` | **The GSC overlay** (DISCOVER→WIN states) — join clusters to real Rajhans performance. |
| Phase 3a scoring (`scoreComponents`, `confidence`, priority) + Phase 4a `expectedCtr`/`positionBucket` | Opportunity scoring engine — extended, not rewritten. |
| BullMQ queue/worker + cron pattern (single-flight, feature-flag, `truncated`→degraded) | Market-discovery run infra + **cost/quota controls** (manual-approval gate). |
| `gsc.config` (env-driven thresholds/quotas) + **`sanitizeGscError`** | Provider config, per-run caps, and **provider-API-key sanitization**. |
| Pure generators/analyzers pattern | Market analyzers (normalizer, intent, clustering, mapping, scoring) as pure, testable functions. |
| Read-only **dry-run / worktree** validation pattern | The first Rajhans discovery validation run. |
| Phase 3a `topical-authority` generator | **Superseded** by demand-validated content-gap; keep as a fallback when no market provider is configured. |

**Net-new:** a provider adapter layer (multi-source, vendor-neutral), keyword/cluster models,
intent + clustering + business-relevance engines, and cost governance.

---

## 1. Proposed architecture

```
                    ┌──────────────── Provider Adapter Layer (vendor-neutral) ─────────────┐
 seeds ── SeedEngine│  KeywordDemandProvider*   SerpProvider*   TrendProvider(optional)     │
   ▲                │  GscQueryProvider (1st-party, already built)                          │
   │                └───────────────┬──────────────────────────────────────────────────────┘
 Rajhans inventory                  │  normalize + persist raw evidence
 (buildSeoContext,                  ▼
  products/cats/blogs)   ┌── SearchMarketRun ──┐   Normalizer → SearchKeyword (+ variants)
                         │  cost-gated, single- │   IntentClassifier → intent[] + reasons
                         │  flight, degraded    │   Clusterer (SERP-overlap-weighted) → SearchCluster
                         └──────────┬───────────┘   KeywordMetric snapshots (per provider, time-series)
                                    ▼
        Cluster ─┬─ URLMapper (reuse canonical resolver + inventory) ── A..G buckets
                 ├─ GSC overlay (GscQueryPageMetric) ── NO_VIS/EMERGING/STRIKING/WINNING/DECLINING
                 ├─ BusinessRelevance scorer (Rajhans taxonomy)
                 └─ CannibalizationGuard (existing pages + clusters + SERP overlap)
                                    ▼
                 OpportunityScorer (scoreComponents) → SeoRecommendation (source='market')
                                    ▼
                 Admin → SEO Recommendations (Market Summary / Top Opportunities / Cluster Detail)
```

Everything is **observe/recommend-only**. Providers are **read-only** and **behind a
manual-approval + cost cap**. Feature-flagged off unless a provider is configured.

---

## 2. Provider interfaces (vendor-neutral)

```ts
export interface Market {
  country: string;        // 'IN'
  language: string;       // 'en'
  currency?: string;      // 'INR'
  device?: 'desktop' | 'mobile' | 'all';
  region?: string;        // optional state/region
}

export type ProviderId = string; // 'gsc' | 'google-ads' | 'keyword-provider-x' | 'serp-provider-y'

/** Common to every adapter: identity, health, quota/cost accounting. */
export interface SearchProvider {
  id: ProviderId;
  kind: 'keyword-demand' | 'serp' | 'trend' | 'gsc-performance';
  isConfigured(): boolean;                 // env-gated; false ⇒ skipped
  estimateCost(op: ProviderOp): CostEstimate; // units/credits BEFORE calling
}

export interface KeywordDemandProvider extends SearchProvider {
  discoverKeywords(seed: string, market: Market): Promise<KeywordDemandResult[]>;
  getMetrics(keywords: string[], market: Market): Promise<KeywordMetrics[]>;
}

export interface SerpProvider extends SearchProvider {
  getSerp(keyword: string, market: Market): Promise<SerpResult>; // top URLs/domains, result types, features, titles
}

export interface TrendProvider extends SearchProvider {         // OPTIONAL
  getInterest(keyword: string, market: Market): Promise<TrendSeries | null>;
}

/** First-party — thin wrapper over the existing GscQueryPageMetric store. */
export interface GscQueryProvider extends SearchProvider {
  getPerformance(keywords: string[]): Promise<GscOverlay[]>;    // impr/clicks/ctr/pos/trend/url
}
```

- **Adapters normalize** provider-specific payloads into our models; the **raw response is
  persisted separately** (`SearchProviderRawResponse`) so nothing provider-specific leaks into
  normalized intelligence and evidence stays reconstructable.
- A `ProviderRegistry` resolves configured providers by `kind`; missing capability ⇒ that signal
  is `UNKNOWN`, never fabricated. **No vendor is hardcoded**; adding one = one adapter + config.
- **No direct Google scraping.** SERP/keyword data only via an approved, compliant provider.

---

## 3. Mongo models

Raw evidence is separated from normalized intelligence; time-series metrics are append-style
snapshots so history survives provider changes.

```ts
// One discovery execution (like SeoAuditRun / GscSyncRun).
SearchMarketRun {
  trigger: 'manual' | 'scheduled';         // scheduled OFF by default
  status: 'pending-approval' | 'running' | 'completed' | 'degraded' | 'failed';
  market: Market;
  seedIds: ObjectId[];
  providersUsed: ProviderId[];
  costEstimate: number; costActual: number; // credits/units
  counts: { keywordsDiscovered, keywordsRetained, keywordsRejected, clusters, opportunities };
  degradedReason?: string; error?: string;   // sanitized
  startedAt, finishedAt, createdAt;
}

SearchSeed {                                 // from Rajhans inventory, not invented
  term; type: 'region'|'processing'|'consumption'|'attribute'|'commercial'|'category'|'product';
  sourceRef?: { kind: 'product'|'category'|'blog'|'page', id, slug };
  market; enabled; createdAt;
}

SearchKeyword {                              // one canonical keyword identity
  keyword;                                   // representative original
  normalizedKeyword;                         // identity key (dedup) — see §6
  variants: string[];                        // original surface forms preserved
  market; language;
  sources: ProviderId[];                     // which providers returned it
  intents: { intent, confidence, reasons[] }[]; // multi-intent — §4
  businessRelevance: { score, band, reasons[] } | null;
  clusterId?: ObjectId;
  currentRajhansUrl?: string;                // mapped canonical URL (may be null)
  gsc?: GscOverlay;                          // §13 overlay snapshot
  discoveredAt; lastCheckedAt; sourceFreshness; // per §18: missing ⇒ UNKNOWN
}

SearchKeywordMetric {                        // time-series, per provider snapshot
  keywordId; provider: ProviderId; capturedAt;
  searchVolume?: number|null; volumeRange?: [min,max]|null;  // null = UNKNOWN
  // ── PAID-ADVERTISER signals (see §10a) — NEVER organic difficulty ──
  paidCompetition?: 'low'|'medium'|'high'|null;              // Google-Ads-style advertiser competition
  paidCompetitionIndex?: number|null;                       // 0..100 advertiser competition
  cpc?: { value, currency }|null;                           // paid cost-per-click
  // ── ORGANIC difficulty is a SEPARATE, differently-named field ──
  organicDifficulty?: { score: number, band: 'low'|'medium'|'high', source: 'serp'|'gsc', reasons[] }|null;
  //   populated ONLY from SERP evidence / ranking domains / authority / Rajhans GSC (4b.5+); null=UNKNOWN
  trend?: 'rising'|'flat'|'declining'|null; seasonality?: object|null;
}

SearchCluster {                              // one intent/topic ⇒ ideally one primary page
  label; market;
  primaryIntent; intents[];
  keywordIds: ObjectId[];
  clusterReasons: { signal: 'serp-overlap'|'semantic'|'shared-entity'|'intent'|'modifier', detail, weight }[];
  serpEvidence?: SerpResult;                 // aggregated for the cluster
  businessRelevance: { score, band, reasons[] };
  mapping: UrlMapping;                        // §8 A..G + justification
  opportunity?: { score, confidence, priority, scoreComponents };  // §10
  gsc?: GscOverlay;
  lifecycleState: OpportunityState;          // §16
  createdAt, updatedAt;
}

SearchProviderRawResponse {                  // OPTIONAL raw evidence — see §3a
  runId; provider; op/capability; requestParams; requestHash; retrievedAt;
  sourceFreshness; provenance;               // ALWAYS retained (provenance, licence-safe)
  payload?: Mixed | null;                    // stored ONLY when provider.rawStorageAllowed
  expiresAt?: Date | null;                   // TTL when raw storage is bounded
}
```

### 3a. Raw provider data retention (licence-respecting)

We do **not** assume the right to permanently warehouse every vendor response. Raw storage is
**per-provider configurable**:
- `provider.rawStorageAllowed` (config) — when false, `payload` is **not stored** at all.
- `provider.rawRetentionDays` — bounded TTL (`expiresAt`) when raw storage is allowed but must expire;
  a cleanup job purges expired payloads.
- **Regardless of raw storage**, we always keep the licence-safe **provenance** so an opportunity stays
  reconstructable/auditable: `provider`, `endpoint/capability`, `runId`, `requestParams`/`requestHash`,
  `retrievedAt`, `sourceFreshness`, and the **normalized** fields on `SearchKeyword`/`SearchKeywordMetric`.
- Provider licence terms are recorded in provider config; the adapter refuses to persist raw payloads a
  provider disallows.

Opportunities themselves are **`SeoRecommendation` docs** (source `'market'`) — not a new
collection. The cluster carries the analytical detail; the recommendation carries the action.

---

## 4. Intent taxonomy (explainable, multi-intent)

`TRANSACTIONAL · COMMERCIAL_INVESTIGATION · CATEGORY · INFORMATIONAL · HOW_TO · COMPARISON ·
NAVIGATIONAL · PROBLEM_NEED`.

Rule + signal classifier (not a black box): modifier lexicons (`buy/price/online/order`→transactional;
`best/top/vs/review`→commercial/comparison; `what/why/benefits`→informational; `how to/recipe`→how-to;
brand token→navigational) **plus SERP-type evidence** (product/category SERP ⇒ commercial; guide/article
SERP ⇒ informational). Stored per keyword as `{ intent, confidence, reasons[] }[]` — multiple intents
allowed; every classification carries its evidence.

---

## 5. Seed universe (from real inventory, bounded)

`SeedEngine` builds seeds from `buildSeoContext()` + product/category/blog taxonomy across the
facets you listed (regions, processing/type, consumption, attributes, commercial, existing
categories, product entities). **It never explodes combinations blindly** — seeds are a small,
curated set; *external search evidence decides what's kept* (retention rule in §18). Per-run seed
cap (config). First run uses the 12 seeds in §20.

---

## 6. Normalization (identity, not intent destruction)

`normalizedKeyword` = lowercase → trim → collapse internal whitespace → strip only trailing
punctuation and duplicate spaces. **Preserve original `variants[]`.** Deliberately does **not**
strip modifiers, so these stay distinct: `assam tea` ≠ `assam ctc tea` ≠ `assam tea benefits` ≠
`buy assam tea` ≠ `assam tea vs darjeeling`. Only surface-form duplicates collapse
(`"Assam Tea"`, `"assam tea "` → one). Mirrors the discipline already proven in the GSC
canonical-vs-query-variant work (don't over-collapse).

---

## 7. Clustering (multi-signal, SERP-weighted, explainable & reversible)

A cluster = one search intent that ideally maps to one primary page. Signals, weighted:
1. **SERP overlap** (shared top-ranking URLs/domains) — **highest weight when available** (it's
   Google's own grouping evidence).
2. Shared entities (region/type/attribute tokens) + intent similarity + modifier patterns.
3. Semantic/lexical similarity (start **lexical + entity** to avoid a paid embedding dependency;
   pluggable embedding provider later — an open question in §19).

Every membership stores `clusterReasons[]` (which signals, weights) → **explainable**; membership
is data, so re-clustering is **reversible**. Queries are **not** grouped without evidence.

---

## 8. Keyword → URL mapping (reuse the canonical resolver)

For each cluster, map to Rajhans reality using `buildSeoContext()` canonical set + the **existing
`resolveGscUrl` canonical resolver** + GSC join + SERP intent:

- **A EXISTING_GOOD** — strong existing page (e.g. product/category already ranking / clearly on-intent).
- **B EXISTING_NEEDS_OPT** — relevant page exists but weak (thin, low position, poor CTR).
- **C CONTENT_SUPPORT** — product exists; a supporting guide/section would help.
- **D NEW_LANDING** — commercial cluster, real demand, **no** adequate page.
- **E NEW_ARTICLE** — informational/how-to/comparison demand, no coverage.
- **F NOT_RELEVANT** — volume but outside what Rajhans can credibly serve (§11).
- **G ALREADY_COVERED** — another cluster/page owns this intent (avoid cannibalization, §9).

**Every D/E proposal must answer `whyExistingPageInsufficient`** (stored) — no new page without it.

---

## 9. Cannibalization guard

Before any new-page proposal: inspect existing pages, mapped clusters, GSC query→page data, and
SERP overlap; if an existing page could satisfy the intent → **B (optimize) beats D/E (create)**.
New-page creation carries a **higher evidence threshold** (config: `newPageMinEvidence` > `optimizeMinEvidence`).
Clusters whose SERPs overlap heavily are merged (Google treats them as one intent) — prevents the
`/assam-tea/`, `/best-assam-tea/`, `/assam-ctc-tea/` sprawl.

---

## 10. Opportunity scoring (transparent; volume is one input, not the verdict)

```
opportunityScore = Σ (weightᵢ × componentᵢ), capped 0..100, weights in config
components:
  searchDemand            (normalized volume band; log-scaled so "chai" doesn't dominate)
  businessRelevance       (§11)
  commercialValue         (intent×CPC/commercial signal)
  gscVisibilityGap        (external demand vs current Rajhans impressions — high when NO_VIS/EMERGING)
  rankingProximity        (reuse positionBucket: 4–20 = high upside)
  serpDifficulty          (INVERSE — strong domains/competition lowers it)  [UNKNOWN if no SERP provider]
  existingPageFit         (A/B raise realism; D/E carry effort cost)
  contentGapStrength      (demand present + coverage absent)
  trendMomentum           (optional; 0 if no trend provider)
  effort (inverse)        (new page > optimization > metadata)
→ opportunityScore, confidence (sample size + signal agreement + provider freshness), priority
scoreComponents{} persisted for full explainability (same contract as Phase 3a/4a).
```

Example the design must honor: `"chai"` = huge volume, extreme `serpDifficulty`, vague intent →
**mid/low** score; `"best strong tea for milk chai"` = lower volume, high relevance + commercial
value + clear intent → **higher** score.

### 10a. Paid competition ≠ organic SEO difficulty (ENFORCED)

A hard rule, enforced by field naming and by which score component may read which field:

- **`cpc`** — paid cost-per-click. May contribute **modestly to `commercialValue`** only (a
  commercial-intent/value signal). Never to difficulty.
- **`paidCompetition` / `paidCompetitionIndex`** — Google-Ads-style **advertiser** competition.
  **Stored as provider evidence only.** No scoring component may read these as difficulty.
- **`organicDifficulty`** (the `serpDifficulty` scoring input) — the *only* difficulty signal, and it
  is populated **exclusively** from SERP evidence (ranking domains/URLs/authority) and actual Rajhans
  GSC performance, available from **4b.5** onward. Until then it is **UNKNOWN**, and `serpDifficulty`
  contributes 0 with low confidence — we do **not** substitute paid competition for it.

The fields are deliberately named apart so the two can never be conflated in code or UI.

---

## 11. Business relevance (Rajhans-specific; don't chase traffic)

A `BusinessRelevance` scorer over a Rajhans **relevance taxonomy** (entities + weights): tea regions
(Assam/Darjeeling/Nilgiri/Dooars), CTC/orthodox/loose-leaf, chai/milk-chai/kadak/strong, brewing,
buying, comparisons, bulk/wholesale. Score = entity overlap × weight − off-topic penalty. **Low
relevance dampens the opportunity score even at high volume.** The taxonomy is config/DB-owned
(reviewable), not hardcoded magic. (Ownership is an open question — §19.)

---

## 12. Competitor / SERP intelligence

Via the pluggable `SerpProvider` (never direct scraping): top domains/URLs, **result-page type**
(category vs product vs article), SERP features, title patterns, and difficulty signals if the
provider supports them. Answers *"what kind of page does Google reward for this intent?"* — which
directly drives §8 (if SERP is all category pages, an article is the wrong asset; if all guides, a
bare product page will struggle). **We store evidence and classification, never competitor content.**

---

## 13. GSC integration (the discover→win funnel)

Join each keyword/cluster to `GscQueryPageMetric` (canonical URLs already normalized by 4a) to
compute a `GscOverlay.state`:

`NO_VISIBILITY` (external demand, 0 Rajhans impressions) → `EMERGING` (small impressions) →
`STRIKING_DISTANCE` (meaningful impressions, pos 4–20) → `WINNING` (top pos + healthy CTR) →
`DECLINING` (weakening vs history).

This closes the loop **DISCOVER → TARGET → PUBLISH/OPTIMIZE → Google tests → IMPRESSIONS → RANK →
CLICKS**, and lets us measure whether acting on an opportunity actually moved GSC.

---

## 14. Recommendation-engine integration

`SeoRecommendation.source` evolves `audit | gsc | market`. New categories:
`content-gap · existing-page-optimization · topic-cluster · new-landing-page · new-guide ·
commercial-opportunity` (plus existing `search-opportunity`, `internal-linking`). Every market rec
carries: `why`, `evidence` (keywords, provider metrics, SERP, GSC overlay), `affectedUrls`,
`keywordClusterId`, `searchDemand`, `businessRelevance`, `intent`, `suggestedAction`,
`expectedValue`, `effort`, `confidence`, `priority`, `automationLevel: 'recommend'`. Flows through
the **existing diff + dashboard**. **No automatic content publishing.**

---

## 15. Admin UI (extend, don't fork)

Additions to the existing **Admin → SEO Recommendations** area (not a separate keyword product):
- **Search Market Summary** — tracked keywords, clusters, high-opportunity/commercial/informational/
  existing-page/new-page counts, last run + cost.
- **Top Opportunities** — cluster · intent · demand · GSC impressions · position · mapped page ·
  relevance · score · confidence · recommended action.
- **Cluster Detail** — keywords + metrics, SERP evidence, existing Rajhans coverage, GSC overlay,
  recommended URL/action, and the stored **reasoning**.
- A guarded **"Run market discovery"** trigger showing the **cost estimate + manual approval** (§17).

---

## 16. Lifecycle / history

Opportunity states: `discovered → validated → recommended → accepted → rejected → targeted →
monitoring → winning → declining → resolved`. Reuses the `SeoRecommendation` lifecycle + a cluster
`lifecycleState`. **Past decisions are never erased when provider metrics change** — `SearchKeywordMetric`
and `SearchProviderRawResponse` snapshots preserve enough to reconstruct *why* an opportunity existed.

---

## 17. Provider cost / quota controls

- **Per-run cost estimate BEFORE calling** (`estimateCost`) + a **manual-approval gate**. Approved
  agent-spending caps (distinct from the provider account balance): `MONTHLY_HARD_CAP_USD = 10`,
  `PER_RUN_HARD_CAP_USD = 2`; during validation **any run estimated > $0.50 → `pending-approval`**.
  A running monthly-spend ledger enforces the hard cap; a run that would breach it is refused.
- Caps: `maxSeedsPerRun`, `maxKeywordExpansionsPerSeed`, `maxSerpLookupsPerRun`.
- **Caching + TTL** per (provider, op, market, keyword) so repeat lookups are free; **incremental
  refresh** (only stale keywords past `metricTtlDays`); **batching** of `getMetrics`.
- Provider quota accounting per run; **degraded/provider-unavailable behavior** = partial run marked
  `degraded`, no opportunity resolution (mirrors 4a's truncated→degraded gate).
- Nothing runs automatically at first — **no cron** in the initial phases; scheduled runs only after
  explicit approval, and always cost-capped.

---

## 18. Data quality / safety

- **Missing metric ⇒ `UNKNOWN` (null), never 0.** Scoring treats UNKNOWN as low-confidence, not
  low-value.
- Provider disagreement → keep both snapshots, reconcile with a documented rule (prefer freshest /
  flag conflict); never silently pick.
- Filters: **branded/competitor-brand** terms (down-rank/label, not target), **adult/spam/unrelated**
  (drop with reason), typo/near-dupe collapse into variants, withheld GSC queries respected.
- Every rejection stored with a **reason** (retention/quality), so the validation report can explain
  what was dropped and why. Credential/API-key material sanitized in all logs/errors (reuse
  `sanitizeGscError` generalized to `sanitizeProviderError`).

---

## 19. Approved decisions

1. **Keyword-demand provider = DataForSEO** as the FIRST implementation behind the vendor-neutral
   `KeywordDemandProvider` (pay-as-you-go; avoids Google Ads manager-account/developer-token
   complexity in v1). **Architecture stays vendor-neutral** — a Google Ads Keyword Planner adapter
   can be added later. No DataForSEO-specific coupling.
2. **SERP provider = DataForSEO (planned)** but **NOT called in 4b.1–4b.4** — implemented at **4b.5**,
   and even then **selective** (only retained/meaningful-demand/ambiguous-intent/clustering-question/
   high-value-proposal keywords; never SERP-check every keyword).
3. **Semantic similarity = lexical + entity + modifier + intent only** in v1; SERP-overlap evidence
   added at 4b.5. **No paid embeddings yet.**
4. **Business-relevance taxonomy** — I propose an **editable/versioned** taxonomy (DB/config, not
   hardcoded into scoring), returned for review during 4b.1. Seed concepts: regions (Assam/Darjeeling/
   Nilgiri/Dooars); tea/product (CTC/orthodox/loose-leaf/black tea); consumption (chai/chai-patti/
   milk-chai/kadak-chai/strong-tea); commercial (buy-tea/buy-tea-online/bulk-tea/wholesale-tea);
   attributes (strong/malty/aromatic/smooth/full-bodied).
5. **Cost limits (agent spending permission, distinct from provider account balance):**
   `MONTHLY_HARD_CAP_USD = 10`, `PER_RUN_HARD_CAP_USD = 2`; during validation **any run estimated
   > $0.50 requires explicit manual approval**. **No automatic paid discovery scheduling** — discovery
   stays manual until validation is complete.
6. **Trend provider — skipped** in v1; keep the `TrendProvider` extension point, integrate later.
7. **Language — India / English + common Roman-script (Hinglish) chai terms** only. **No Devanagari
   Hindi / regional-language universes yet** — designed as future market/language expansions.
8. **CPC / paid competition** — store only when the provider supplies them; `cpc` may contribute
   **modestly to `commercialValue`**; `paidCompetition`/`paidCompetitionIndex` are **provider evidence
   only** (never organic difficulty — §10a). Missing values stay **UNKNOWN**, never zero.

---

## 20. First Rajhans validation run (design)

Read-only, cost-capped, **12 seeds only**: `Assam tea, CTC tea, kadak chai, chai patti, strong tea,
Darjeeling tea, Nilgiri tea, Dooars tea, loose leaf tea, tea for milk chai, buy tea online, bulk tea`.
Run via the proven **worktree + throwaway-container, read-only** pattern (persists nothing in the
first pass). Report:
- seeds used; keywords discovered / retained / rejected (+reasons); clusters + intents;
- external demand (or UNKNOWN); SERP/competitor evidence where available;
- mapped Rajhans URLs; **GSC overlay** per cluster; existing-page vs proposed-new-page opportunities;
- business relevance; opportunity scores + confidence; **projected provider cost**.
- **No content created.** We review, then decide what (if anything) to act on.

---

## 21. Phased implementation plan (each stage independently testable)

- **4b.1** — models + `ProviderRegistry` + provider interfaces + `SeedEngine` (+ pure normalizer &
  intent classifier). No external calls; tests on fixtures. *(reuses buildSeoContext, resolver, config)*
- **4b.2** — first **KeywordDemandProvider** adapter (chosen vendor) + caching/TTL/cost gate +
  `SearchMarketRun` orchestration; mocked-provider tests + a tiny real read-only smoke run.
- **4b.3** — **clustering** (lexical+entity; SERP-overlap slot) + intent finalization; explainability tests.
- **4b.4** — **URL mapping** (A–G) + **cannibalization guard** + business-relevance scorer; reuse resolver.
- **4b.5** — **SERP provider** adapter + SERP-weighted clustering + competitor intelligence (optional/gated).
- **4b.6** — **opportunity scoring** + **`SeoRecommendation` (source 'market')** integration + GSC overlay
  states; diff/lifecycle tests.
- **4b.7** — **admin UI** (Market Summary / Top Opportunities / Cluster Detail) + guarded run trigger.
- Only after all of the above, and only with approval: an optional **scheduled** discovery cadence
  (cost-capped, degraded-safe) — mirroring how the GSC cron was enabled last.

## 22. Tests (per stage, mostly pure)

Normalizer (identity vs intent-preserving), intent classifier (each type + multi-intent + reasons),
clustering (SERP-overlap weighting, explainability, reversibility, "don't group without evidence"),
URL mapping (A–G incl. "why not existing page"), cannibalization guard (merge overlapping intents),
scoring (volume ≠ verdict; UNKNOWN handling; scoreComponents), business relevance, GSC-overlay states,
provider adapters (mocked payloads; cost estimate; degraded/unavailable), sanitizer (no key leakage),
and a read-only fixture-driven dry-run of the full pipeline.

---

**STOP — awaiting approval of this design (and answers to §19) before any 4b implementation.**
