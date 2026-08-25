# Phase 4 — Google Search Console Integration & Search-Opportunity Analysis

**Status:** design approved for finalization · **Phase 4a implementation NOT started**
**Discipline:** OBSERVE + RECOMMEND only. No automatic production/content/schema changes.

---

## 0. Objective

Make the SEO agent **demand-driven**. Today the audit (Phase 2a/2b) and recommendation
engine (Phase 3a) reason from the site's own HTML. Phase 4 adds a fourth signal —
**real Google Search query/impression/click/position data** — and, crucially, **joins
it to the existing audit snapshots and recommendations** so opportunities are ranked by
actual search demand, not assumptions.

Phase 4a is **not another analytics dashboard.** Its deliverable is the *integration*:
combine GSC performance with the existing SEO system to surface ranking-growth
opportunities:

- high impressions + low CTR (snippet opportunity),
- positions 4–20 with realistic upside (striking distance),
- query ↔ page mismatch / cannibalization,
- declining pages/queries (early regression alert),
- growing queries (capitalize),
- **pages that have a technical recommendation AND real search demand** (priority boost),
- **content gaps validated by actual Google query data** (demand-backed topical roadmap).

---

## 1. Access & authentication (approved)

- **Property:** Domain property. `GSC_SITE_URL=sc-domain:rajhanstea.com` — **read from env,
  never hardcoded** in application logic.
- **Auth:** Google Cloud **Service Account**. Key supplied as
  `GSC_SA_KEY_BASE64=<base64(service-account-json)>`.
  - Decoded **only in backend memory** to sign a JWT (`google-auth-library`).
  - **Never** committed, logged, returned by any API, or written to the DB.
  - All GSC/credential errors pass through a **sanitizer** that strips key/token material
    before logging or storing.
  - Hostinger `.env` kept at restricted permissions (chmod 600).
- **Scope:** `https://www.googleapis.com/auth/webmasters.readonly` (read-only).
- **Manual step (owner):** add the service-account email as a **Restricted** user on the
  Search Console property.
- **Library:** `google-auth-library` (JWT) + direct REST to
  `https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`
  (siteUrl URL-encoded, e.g. `sc-domain%3Arajhanstea.com`). Avoids the heavy `googleapis`
  SDK; one small dependency.

Config lives in a dedicated `gscConfig` (env-driven, all knobs overridable):
`GSC_SITE_URL`, `GSC_SA_KEY_BASE64`, `GSC_BACKFILL_DAYS`, `GSC_OPPORTUNITY_WINDOW_DAYS`,
`GSC_MIN_IMPRESSIONS`, thresholds, cron toggle. GSC integration is **disabled when the
credential/site are unset** (feature-flagged), so the rest of the SEO system is unaffected.

---

## 2. Data model (new collections in the existing `seo` module)

Mirrors the Phase 2/3 patterns (a run doc + fact tables + reuse of the recommendation
lifecycle). GSC data has a **~2–3 day lag** and a **16-month** window; the sync respects both
and stores only `dataState:'final'` rows.

### `GscSyncRun` (one sync execution — like `SeoAuditRun`)
| field | type | notes |
|---|---|---|
| trigger | 'manual' \| 'cron' | |
| status | running \| completed \| degraded \| failed | degraded = partial pull; not used to resolve opportunities |
| dateRange | { start, end } | ISO dates actually pulled |
| pullsAttempted / rowsUpserted | number | |
| error | string \| null | **sanitized** (never contains credential material) |
| startedAt / finishedAt / createdAt | Date | |

### `GscPageDailyMetric` (trend fact — page rollup per day)
Unique index `{ date, normalizedUrl }`.
| field | type | notes |
|---|---|---|
| date | string (YYYY-MM-DD) | |
| page | string | raw GSC page URL |
| normalizedUrl | string | `normalizeUrl(page)` — the join key to SEO snapshots |
| clicks, impressions | number | |
| ctr | number | 0..1 |
| position | number | avg |
| syncRunId | ObjectId | provenance |

### `GscQueryPageMetric` (opportunity fact — query×page aggregated over the window)
Unique index `{ periodEnd, query, normalizedUrl }`. This is the core table the analyzers read.
| field | type | notes |
|---|---|---|
| periodStart / periodEnd | string (YYYY-MM-DD) | e.g. trailing 28 days |
| query | string | search term (may be withheld/anonymized by Google → skipped) |
| page / normalizedUrl | string | page + join key |
| clicks, impressions, ctr, position | number | window aggregate |
| syncRunId | ObjectId | |

### `SeoOpportunity` → **reuse `SeoRecommendation`**
No parallel model. GSC opportunities are `SeoRecommendation` docs with
`category: 'search-opportunity'`, `source: 'gsc'` (new field, default `'audit'` for existing
recs), and a demand payload in `evidence`:
`{ query?, page, impressions, clicks, ctr, position, expectedCtr, positionBucket, trend }`.
They inherit the existing **fingerprint identity + NEW/PERSISTENT/RESOLVED diff + dashboard**.

---

## 3. GSC API queries / dimensions

Three narrow pulls per sync (low row count, quota-friendly), all `type:'web'`,
`dataState:'final'`, paginated via `rowLimit:25000` + `startRow`:

1. **Opportunity pull** — `dimensions:['query','page']`, range = trailing
   `GSC_OPPORTUNITY_WINDOW_DAYS` (default **28**). Window-aggregated query×page metrics →
   `GscQueryPageMetric`. Core of opportunity detection.
2. **Page-trend pull** — `dimensions:['date','page']`, range = trailing
   `GSC_BACKFILL_DAYS` (default **90**) on backfill, incremental thereafter → `GscPageDailyMetric`.
   Powers declining/growing detection.
3. **Query-trend pull** *(optional in 4a)* — `dimensions:['date','query']` for query-level
   momentum. May defer to 4b to keep 4a lean.

`dimensionFilterGroups` reserved for future country/device slicing (4a pulls web/global).

---

## 4. Backfill & daily sync

- **Initial backfill:** **90 days** page-daily + a **28-day** opportunity aggregate. (16-month
  history available; 90d is sufficient for trend + opportunity and keeps storage modest.
  Extendable via `GSC_BACKFILL_DAYS`.)
- **Daily sync (`gsc.sync.job.ts`, cron ~03:45, after the audit's 03:15):**
  1. Pull new **final** page-daily rows for dates `lastSynced+1 … today−3`; upsert (idempotent).
  2. Recompute the trailing-28-day opportunity aggregate; upsert `GscQueryPageMetric`.
  3. Run analyzers → upsert/diff `SeoOpportunity` recommendations.
  Wrapped in try/catch, **isolated from the audit pipeline**. Records a `GscSyncRun`.
- Concurrency-guarded manual trigger, same as the audit.

---

## 5. Rate / quota handling

GSC allows ~1,200 QPS-minute per user and ~day-level per-property limits; we issue only a
handful of calls/day. Safeguards: `startRow` pagination; exponential backoff + bounded
retries on 429/5xx (reuse the SEO fetcher discipline); single-flight sync; per-pull timeout;
a `degraded` sync status when a pull is truncated (never resolves opportunities on a
degraded run — same false-positive protection as the audit).

---

## 6. URL normalization / join with SEO snapshots (the integration core)

- GSC `page` values are absolute URLs. Normalize with the **same `normalizeUrl()`** the audit
  uses → `normalizedUrl`. (Post the canonical-links fix, GSC pages are already trailing-slash;
  normalize defensively anyway.)
- **Join** `normalizedUrl` → the latest `SeoPageSnapshot` (title, canonical, wordCount,
  structuredDataTypes, indexable) **and** open `SeoIssue` / `SeoRecommendation` for that URL.
- This join is what turns raw metrics into *agent intelligence*:
  - a page with an **open audit finding or Phase 3a rec** + **real impressions** → priority boost;
  - a **thin-content** page + **striking-distance** queries → urgent;
  - a **duplicate/near-miss title** + **high impressions, low CTR** → snippet rewrite, high value.
- **Queries have no URL.** Content-gap detection maps a query to the page GSC actually ranks;
  if that page is a **generic hub** (`/`, `/products/`, `/blog/`) rather than a dedicated page,
  and the query matches a known topical entity (Assam/Nilgiri/…), it's a **demand-validated
  content gap** — upgrading the Phase 3a topical recs from assumption to evidence.

---

## 7. Opportunity scoring

A position→CTR **benchmark curve** (configurable table) gives `expectedCtr(position)`.
Each analyzer is a pure function over `GscQueryPageMetric` (+ the SEO join):

| Opportunity | Trigger (defaults, all configurable) | Score / upside |
|---|---|---|
| **High-impression low-CTR** | impressions ≥ `MIN_IMPRESSIONS` (100/28d) and `ctr < expectedCtr(pos) × 0.6` | `impressions × (expectedCtr − ctr)` = missed clicks |
| **Striking distance** | position ∈ [4,20] and impressions ≥ threshold (bucket 4–10 high, 11–20 medium) | `impressions × (expectedCtr(3) − ctr)` = upside if pushed to top-3 |
| **Cannibalization / query→page mismatch** | one query ranks with ≥2 pages, or the ranking page's intent ≠ query | consolidation / retargeting |
| **Declining** | impressions↓ or position↑ vs preceding equal window, beyond `DECLINE_DELTA` | regression alert (severity by drop size) |
| **Growing** | impressions rising beyond `GROWTH_DELTA` | capitalize (content/links) |
| **Demand-validated content gap** | topical-entity query with impressions but only a generic page ranks | new-content rec + demand number |
| **Tech-debt-with-demand (cross-ref)** | URL has an open `SeoIssue`/`SeoRecommendation` **and** impressions ≥ threshold | existing rec's priority **boosted by demand** |

The Phase 3a **scoring engine gains demand weights** (impressions bands, position bucket,
CTR gap) so GSC opportunities and demand-boosted existing recs are ranked by real traffic
potential. All thresholds are env/config-driven.

---

## 8. Admin dashboard changes (integration, not a new analytics app)

- **Extend the existing Admin → SEO Recommendations page:** GSC-sourced recs get a `GSC`
  badge and demand columns — query, impressions, avg position, CTR, trend arrow. Demand-boosted
  audit/Phase-3a recs show their attached impressions/position.
- **Compact evidence drill-down:** a small per-recommendation table of the supporting queries
  (not a standalone dashboard). Optional read-only `GET /admin/seo/gsc/queries` for evidence.
- Endpoints (admin + RBAC, like existing SEO routes): `GET /admin/seo/gsc/summary`,
  `GET /admin/seo/gsc/opportunities` (or folded into the recommendations report),
  `POST /admin/seo/gsc/sync` (guarded manual trigger).

---

## 9. Failure handling

- Sync isolated in try/catch — a GSC failure never affects the audit/recommendations.
- **Credential-safe errors:** a sanitizer strips key/JWT/token substrings before any log or
  stored `error`. Missing/invalid config → a clear "GSC not configured/authorized" admin-safe
  message; never echoes key material.
- Partial pulls → `degraded` (no opportunity resolution on degraded runs).
- Anonymized/withheld queries are simply absent — stored as returned, never inferred.

---

## 10. Tests

- **Pure analyzers:** CTR-curve, high-impression-low-CTR, striking-distance buckets,
  decline/growth deltas, content-gap mapping, and the **SEO-join cross-reference** — over
  metric fixtures (no DB/network).
- **Sync:** mocked GSC client (fixture responses incl. pagination) → upsert idempotency;
  URL-normalization join; lag/`dataState` handling.
- **Security:** credential-sanitizer test asserting errors/logs never contain key material.
- **Read-only dry-run** against the live property before enabling the cron.

---

## 11. Exact fields stored (summary)

- `GscSyncRun`: trigger, status, dateRange{start,end}, pullsAttempted, rowsUpserted,
  error(sanitized), startedAt, finishedAt, createdAt.
- `GscPageDailyMetric`: date, page, normalizedUrl, clicks, impressions, ctr, position, syncRunId.
- `GscQueryPageMetric`: periodStart, periodEnd, query, page, normalizedUrl, clicks,
  impressions, ctr, position, syncRunId.
- `SeoRecommendation` (extended): + `source` ('audit'|'gsc'), evidence demand payload
  {query?, page, impressions, clicks, ctr, position, expectedCtr, positionBucket, trend}.
- **Never stored:** the service-account key, JWTs, access tokens, or any raw credential.

---

## 12. Privacy / security considerations

- Read-only GSC scope; aggregated data (no user PII); withheld queries respected.
- Credential handled only in memory; never committed/logged/returned/persisted; error
  sanitizer enforced; `.env` at 600.
- Admin endpoints behind `authenticate` + `authorize('admin')`, like all SEO endpoints.
- Feature-flagged off when unconfigured — zero impact on the existing system.

---

## 13. Phasing

- **4a (this scope):** config + auth + sync + storage + URL-join + opportunity analyzers +
  cross-referencing with existing audit/recs + demand-weighted recommendations surfaced in
  the existing dashboard. Validate via read-only dry-run before the cron.
- **4b (later):** query-level trends, device/country slicing, richer intent/cannibalization,
  and (only after the agent is trusted) proposing specific on-page/snippet edits for approval.

Workflow discipline unchanged: **AUDIT → CLASSIFY → HUMAN REVIEW → APPROVED FIX → DEPLOY →
AUDIT AGAIN.** No automatic changes.
