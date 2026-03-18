# Deployment Plan — Rajhans Ecommerce

## Already Done

- [x] CI pipeline (lint, typecheck, unit tests, integration tests, build, npm audit)
- [x] Docker setup (dev + prod multi-stage Dockerfiles)
- [x] Nginx reverse proxy
- [x] Prometheus + Grafana configs (HTTP metrics: `http_requests_total`, `http_request_duration_seconds`)
- [x] Health checks (`/health` basic + `/health/ready` with MongoDB & Redis connectivity check)
- [x] Graceful shutdown (SIGTERM/SIGINT handling, server.close, DB/Redis disconnect, 10s force kill)
- [x] Helmet (security headers — X-Content-Type-Options, X-Frame-Options, etc.)
- [x] CORS (configurable origin via `CORS_ORIGIN` env var, credentials enabled)
- [x] Rate limiting (global 100 req/min + auth-specific 10 req/min, Redis-backed via `rate-limit-redis`)
- [x] Logging (Pino + pino-http request logger, configurable log levels, pretty print in dev only)
- [x] API versioning (`/api/v1` — structured for future v2)
- [x] Input validation (Zod schemas on all routes)
- [x] Seed script (admin user via `infrastructure/seeds/seed-admin.js`)
- [x] RBAC (`authorize('admin')` middleware on all admin routes)
- [x] ABAC (banned user attribute check on every authenticated request)
- [x] Test DB isolation (separate `MONGO_TEST_URI`, `NODE_ENV=test` auto-switches, jest global setup/teardown)
- [x] Redis infrastructure (ioredis initialized with retry strategy, `maxRetriesPerRequest: 3` — currently used for rate limiting only)

---

## Must Do Before Launch

### Infrastructure

| # | Task | Details |
|---|------|---------|
| 1 | Pick hosting | AWS (ECS/EC2), DigitalOcean, Railway, or VPS |
| 2 | SSL/HTTPS | Certbot/Let's Encrypt or load balancer with SSL termination |
| 3 | Domain + DNS | Point domain to server IP |
| 4 | Managed MongoDB | MongoDB Atlas with auth, replica set, proper backups |
| 5 | Managed Redis | Redis Cloud or self-hosted with password + persistence |
| 6 | Secrets management | GitHub Secrets injected at deploy time, or AWS SSM/Vault — no .env in prod |
| 7 | Persist uploads | Docker volume or migrate to S3/Cloudinary — local /uploads won't survive container restarts |

### CI/CD

| # | Task | Details |
|---|------|---------|
| 8 | CD pipeline | Auto-deploy on merge to main — build Docker images, push to registry (GHCR/ECR), deploy to server, post-deploy health check |
| 9 | Zero-downtime deployment | Blue-Green or Rolling deployment strategy. AWS: ALB + target group switching. VPS: Nginx upstream switching. Without this, requests are dropped during deploy |
| 10 | Rollback strategy | Tag Docker images per commit, one-command rollback to previous version |
| 11 | Production docker-compose | Separate prod compose (no volume mounts, no nodemon, no debug ports) |

### Security

| # | Task | Details |
|---|------|---------|
| 12 | CSRF protection | Add CSRF token middleware for state-changing requests (POST/PUT/DELETE). Options: `csurf` or custom double-submit cookie pattern. Critical for browser-based form submissions |
| 13 | Nginx rate limiting | Additional rate limiting at Nginx layer (defense in depth — app-level already exists) |
| 14 | Strict CORS for prod | Lock down `CORS_ORIGIN` to exact production domain only |
| 15 | Secrets rotation runbook | Document how to rotate JWT secrets, DB credentials, Redis password without downtime. If a secret leaks, you need to rotate within minutes, not hours |

### Resilience & Performance

| # | Task | Details |
|---|------|---------|
| 16 | Request timeouts | Add Express request timeout (e.g., 10s). Currently no timeout — a hung DB query blocks a worker for 60s (Nginx default). Add `server.setTimeout()` in server.ts |
| 17 | Nginx timeouts | Add `proxy_read_timeout`, `proxy_connect_timeout`, `proxy_send_timeout` in nginx.conf. Currently using defaults (60s) — too generous |
| 18 | MongoDB connection pool | Add `maxPoolSize`, `minPoolSize` to mongoose.connect() options. Currently unlimited — under high traffic, unbounded connections crash MongoDB |
| 19 | Serve static files via Nginx | Move `/uploads` static serving from Express (`express.static`) to Nginx (`location /uploads`). Node shouldn't waste event loop cycles on file I/O |

### Testing & Reliability

| # | Task | Details |
|---|------|---------|
| 20 | Load testing | k6 or Artillery — simulate 500+ concurrent users, find breaking points |
| 21 | Database backups | Automated mongodump cron or Atlas scheduled backups |
| 22 | Disaster recovery plan | Define RTO (recovery time objective) and RPO (data loss window). Document: if DB is gone, how fast can you recover? Target: RTO < 1hr, RPO < 1hr |

### Caching (Redis is set up but underused)

| # | Task | Details |
|---|------|---------|
| 23 | Application-level caching | Cache products, categories, collections in Redis with TTL. Define invalidation strategy (cache-aside pattern: read from cache → miss → read DB → write cache) |
| 24 | Cache invalidation rules | On product/category/collection create/update/delete → invalidate relevant cache keys. Use short TTL as safety net (e.g., 5min) so stale data self-heals even if invalidation fails |

---

## Must Do Before Payments/Checkout Go Live

| # | Task | Details |
|---|------|---------|
| 1 | Background job queue (BullMQ) | Redis-based async job processing for: email sending, order processing, inventory updates, retry on failure. Without this, a slow email API blocks the checkout response |
| 2 | Idempotency keys | Middleware to accept `Idempotency-Key` header on POST requests — prevents double orders, double charges. Store key + response in Redis with TTL |
| 3 | Payment gateway | Stripe or Razorpay — NEVER handle raw card data |
| 4 | Order state machine | Ensure order status transitions are atomic and validated |
| 5 | Business metrics | Custom Prometheus counters: orders placed, failed checkouts, revenue per minute, cart abandonment. Wire into Grafana dashboards for business visibility |
| 6 | Circuit breaker | Wrap payment gateway calls with circuit breaker (e.g., opossum). If payment API is down, fail fast instead of hanging. Not needed now — no external API calls yet |

---

## Can Do After Launch

| # | Task | When |
|---|------|------|
| 1 | E2E tests (Playwright/Cypress) | When manual testing gets tedious |
| 2 | CDN (Cloudflare/CloudFront) | When you care about page speed |
| 3 | APM (New Relic/Datadog) | When debugging prod performance issues |
| 4 | WAF (Cloudflare WAF/AWS WAF) | When you get real traffic |
| 5 | SonarCloud SAST | When team grows to 3+ developers |
| 6 | Centralized logging | ELK stack or cloud logging (Pino logs exist, just need aggregation) |
| 7 | Feature flags | Enable/disable features without redeploy (LaunchDarkly or config-based) |
| 8 | Alerting | Slack/email alerts on error spikes, high latency, server down (wire into Grafana) |
| 9 | Schema migrations | Versioned DB migrations with rollback support (when schema changes frequently) |
| 10 | Incident response plan | Runbook for server crash, DB down, high traffic — restart strategy + escalation |
| 11 | Staging environment | Prod-like environment for pre-deploy verification. Add when team grows or before enterprise clients. Solo dev: CI + feature branches is sufficient |
