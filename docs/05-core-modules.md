# 05 — Core Modules

Deep dives into each major module.

---

## Module 1: Authentication

**Files:**
- `backend/src/services/auth.service.ts`
- `backend/src/api/v1/controllers/auth.controller.ts`
- `backend/src/api/v1/routes/auth.routes.ts`
- `backend/src/loaders/firebase.loader.ts`
- `frontend/src/app/core/services/auth.service.ts`
- `frontend/src/app/core/services/firebase.service.ts`
- `frontend/src/app/features/auth/login/login.ts`

### What It Does
Phone-only authentication using Firebase OTP. No passwords, no email-based auth.

### Token Architecture
```
Access Token:
  - Type: JWT (signed with HS256)
  - Payload: { userId, role }
  - Secret: JWT_ACCESS_SECRET (env var)
  - Expiry: 15 minutes
  - Storage: localStorage (see RF-004 for security concern)
  - Use: Sent as Authorization: Bearer header on every API call

Refresh Token:
  - Type: Random 80 hex characters (NOT a JWT)
  - Storage: SHA-256 hash stored in MongoDB `tokens` collection
  - Expiry: 7 days (MongoDB TTL index auto-deletes)
  - Storage on client: httpOnly cookie + localStorage
  - Use: Exchange for a new access token when it expires
```

### Firebase Credential Loading (3 strategies)
```
Priority 1: File path (FIREBASE_SERVICE_ACCOUNT_PATH)
  → Used in development (file mounted via Docker volume)

Priority 2: Base64 env var (FIREBASE_SERVICE_ACCOUNT_BASE64)
  → Used in production (no file on disk needed)
  → Generate: base64 -w 0 firebase-service-account.json

Priority 3: GOOGLE_APPLICATION_CREDENTIALS
  → Used on GCP (Cloud Run, GKE) with workload identity
  → Firebase auto-detects credentials from the environment
```

---

## Module 2: Admin Panel

**Files:**
- `backend/src/services/admin-user.service.ts`
- `backend/src/services/admin-dashboard.service.ts`
- `backend/src/api/v1/routes/admin.routes.ts`
- `frontend/src/app/features/admin/`

### Access Control
All admin routes are protected by two middleware in sequence:
```typescript
router.use(authenticate);      // Must have valid JWT
router.use(authorize('admin')); // JWT must have role: "admin"
```
This is applied to the entire router — every route in `admin.routes.ts` is automatically protected.

### Dashboard Stats
Six counters computed in parallel:
```typescript
Promise.all([
  count({}),                           // totalUsers
  count({ isActive: true }),           // activeUsers
  count({ role: 'admin' }),            // adminUsers
  findMany({}, { limit: 5 }),          // recentUsers (last 5)
  count({ createdAt: { $gte: today } }), // todaySignups
  count({ createdAt: { $gte: week } }),  // weekSignups
])
```
`Promise.all` runs all 6 queries simultaneously — total time = slowest query, not sum of all.

### User Management
Supports: search, filter by role, filter by isActive, sort, paginate.

The search uses MongoDB `$regex` with `$or` across 4 fields. See RF-003 for the ReDoS concern with unescaped user input.

---

## Module 3: Monitoring

**Files:**
- `backend/src/loaders/metrics.loader.ts`
- `backend/src/middleware/metrics.middleware.ts`
- `backend/src/api/v1/routes/metrics.routes.ts`
- `infrastructure/docker/prometheus/prometheus.yml`
- `docker-compose.monitoring.yml`

### Metrics Collected

**Default Node.js metrics** (from `prom-client.collectDefaultMetrics()`):
- `process_cpu_seconds_total` — CPU time
- `process_heap_bytes` — memory usage
- `nodejs_active_handles_total` — open file handles / connections
- `nodejs_eventloop_lag_seconds` — event loop health

**Custom HTTP metrics:**
```
http_requests_total{method, route, status_code}
  → How many requests per endpoint, per status code
  → Example: http_requests_total{method="POST",route="/api/v1/auth/verify-token",status_code="201"} = 4523

http_request_duration_seconds{method, route}
  → Histogram of response times
  → Buckets: 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
  → Lets you see p50, p95, p99 latency in Grafana
```

### Prometheus Scraping
Prometheus is configured to scrape the backend every 15 seconds:
```yaml
# infrastructure/docker/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'rajhans-tea-backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'
```

### Stack
```
Backend app
  └─ /metrics endpoint (prom-client)
        ↑ scrape every 15s
Prometheus (:9090)
  └─ stores time-series data (15 days retention)
        ↑ query
Grafana (:3001)
  └─ visualizes dashboards, sends alerts

MongoDB Exporter (:9216) → Prometheus (MongoDB-specific metrics)
Redis Exporter (:9121)   → Prometheus (Redis-specific metrics)
```

---

## Module 4: Request Lifecycle

Every request touches these middleware in order. Understanding this is essential for debugging.

```
1. Helmet
   Sets: X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
   Removes: X-Powered-By (hides "Express" from attackers)

2. CORS
   Checks Origin header against config.cors.origin
   If not allowed: responds 403, request dies here

3. globalRateLimiter
   Checks IP against in-memory rate limit counter
   100 requests per 60 seconds
   If exceeded: responds 429, request dies here

4. express.json()
   Parses Content-Type: application/json body
   Limit: 10MB (prevents payload bombs)

5. express.urlencoded()
   Parses HTML form data

6. cookieParser()
   Parses Cookie header into req.cookies object

7. requestIdMiddleware
   Reads X-Request-ID header or generates UUID
   Sets req.requestId = "abc123-..."
   Used in logs for tracing

8. requestLoggerMiddleware (pino-http)
   Logs: method, url, status, duration, requestId
   Level depends on status: ≥500=error, ≥400=warn, <400=info

9. metricsMiddleware
   Starts timer on request
   On response finish: increments http_requests_total, records duration

10. Routes → Controller → Service → Repository

11. errorHandler (if anything throws)
    Formats error, sends appropriate status code

12. notFoundHandler (if no route matched)
    Sends 404
```

---

## Module 5: Logging

**Library:** Pino (fastest Node.js logger)

**Development:** Pretty-printed with colors
```
[15:30:22] INFO: Server running on port 3000
[15:30:24] INFO: POST /api/v1/auth/verify-token 201
```

**Production:** JSON structured logs (machine-readable)
```json
{"level":30,"time":1710679824000,"requestId":"abc123","msg":"POST /api/v1/auth/verify-token 201","statusCode":201,"responseTime":45}
```

Structured JSON logs can be shipped to Elasticsearch, Datadog, CloudWatch, etc. for searching and alerting.

**Log Levels:**
- `fatal` — app about to crash (MongoDB connection failed at startup)
- `error` — something failed but app continues (MongoDB connection error after startup)
- `warn` — unusual but handled (Redis disconnected, readiness check failed)
- `info` — normal operations (server started, request completed)
- `debug` — development detail (connection strings, etc.)
