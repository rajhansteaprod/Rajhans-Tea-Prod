# 16 — Tech Debt Tracker

Prioritized cleanup roadmap. Do these in order — P1 before P2, etc.

---

## Priority 1 — Security (Fix Before Production)

| ID | Issue | File | Effort |
|----|-------|------|--------|
| RF-004 | Access tokens in localStorage | `frontend/core/services/auth.service.ts` | 2h |
| RF-006 | /metrics endpoint unauthenticated | `nginx.conf` + `metrics.routes.ts` | 30m |
| RF-008 | Hardcoded admin phone in seed | `infrastructure/seeds/seed-admin.js` | 15m |

---

## Priority 2 — Architecture (Fix Before v2 Features)

| ID | Issue | File | Effort |
|----|-------|------|--------|
| RF-002 | Manual `new Repository()` in services | All `*.service.ts` files | 1h |
| RF-001 | Stale OTP interfaces in auth types | `src/types/auth.types.ts` | 15m |

---

## Priority 3 — Code Quality (Fix When Convenient)

| ID | Issue | File | Effort |
|----|-------|------|--------|
| RF-003 | `as never` type casts | `admin-dashboard.service.ts` | 30m |
| RF-005 | `console.log` in firebase.service | `frontend/core/services/firebase.service.ts` | 15m |
| RF-007 | Fragile string matching in interceptor | `frontend/core/interceptors/auth.interceptor.ts` | 20m |

---

## Missing Features (Planned)

| Feature | Description | Complexity |
|---------|-------------|-----------|
| `isActive` check in `authenticate` | Banned users can still use platform until JWT expires | Medium |
| DTOs for API responses | Standardize response shapes using factory methods | Medium |
| Integration tests | No repository/service integration tests exist | High |
| Sanity tests | Post-deploy smoke tests | Medium |
| k6 load tests | Performance benchmarks | Medium |
| Product module | Full CRUD + categories | High |
| Cart module | Add/remove/update items | Medium |
| Orders module | Checkout, order status, history | High |
| Payment (Razorpay) | Payment gateway integration | High |

---

## Banned User Problem (Discussed — Not Yet Fixed)

**The Issue:**
```
Admin bans user → sets isActive: false in DB
User still has valid JWT access token (up to 15 min)
User can still make API calls → ban doesn't take effect immediately
```

**Current Behavior:**
- `authenticate` middleware (`auth.middleware.ts`) verifies JWT signature only
- It does NOT check `isActive` from DB
- `refreshToken` endpoint DOES check `isActive` — so after token expires and user tries to refresh, they'll be blocked

**Options:**

| Option | Pro | Con |
|--------|-----|-----|
| Check DB on every request | Instant ban enforcement | DB call on every request — latency + load |
| Redis-based blocklist | Fast, instant | Need to populate Redis on ban, purge on unban |
| Short access token (e.g. 2 min) | Simple, no changes needed | More refresh calls |
| Embed `isActive` in JWT | No DB call | Stale until token expires |

**Recommended Fix:** Redis blocklist
```typescript
// On ban:
await redis.set(`banned:${userId}`, '1', 'EX', 7 * 24 * 3600);

// In authenticate middleware (add after jwt.verify):
const isBanned = await redis.exists(`banned:${req.user!.userId}`);
if (isBanned) throw new UnauthorizedError('Account suspended');
```

This gives instant ban enforcement with one Redis lookup (~0.5ms) per request.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-03-17 | Initial setup: auth, admin panel, monitoring, CI/CD |
| v2 | — | Products, cart, orders, payment (planned) |
