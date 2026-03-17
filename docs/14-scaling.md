# 14 — Scaling Considerations

What to do when traffic grows. Current limits and how to break through them.

---

## Current Architecture Limits

Understanding what breaks first as traffic grows.

```
Current bottlenecks (in order of failure):

1. Single MongoDB node (rs0)
   Limit: ~5,000-10,000 read queries/second
   Breaks: Write-heavy workloads, large datasets

2. In-memory rate limiter (express-rate-limit)
   Limit: Works fine for a single server instance
   Breaks: As soon as you run 2+ backend instances (each has its own counter)

3. Single Node.js process
   Limit: One CPU core (Node.js is single-threaded)
   Breaks: CPU-intensive operations, sustained high concurrency

4. Local file system for Firebase credentials
   Limit: Works on one machine
   Breaks: When deploying to cloud (no filesystem persistence)
```

---

## Scaling the Backend

### Horizontal Scaling (more instances)

Running multiple backend containers behind a load balancer:

```
                    Load Balancer (Nginx)
                    /        |        \
            Backend 1   Backend 2   Backend 3
                    \        |        /
                        MongoDB
                        Redis
```

**What breaks when you do this:**

1. **Rate limiter** — each instance has its own in-memory counter
   - User makes 50 requests to Backend 1, 50 to Backend 2 → 100 total, but neither instance knows about the other's counter
   - **Fix:** Switch to Redis-backed rate limiter:
   ```typescript
   import RedisStore from 'rate-limit-redis';

   export const globalRateLimiter = rateLimit({
     store: new RedisStore({ client: redisClient }),
     windowMs: 60_000,
     max: 100,
   });
   ```

2. **Sessions / JWT** — already fine! JWTs are stateless. Any backend instance can verify any JWT.

3. **Sticky sessions** — not needed because JWTs are stateless.

---

### Vertical Scaling (bigger machine)

Node.js uses one CPU core per process. To use multiple cores on the same machine:

```typescript
// cluster.ts (not yet implemented)
import cluster from 'node:cluster';
import os from 'node:os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();  // spawn one worker per CPU core
  }
} else {
  // Each worker runs the Express app
  startServer();
}
```

Or use PM2 (process manager):
```bash
pm2 start dist/server.js -i max  # spawn one process per CPU core
```

---

## Scaling the Database

### Read Replicas

MongoDB replica sets can have multiple members. Currently: 1 primary only.

For read-heavy workloads, add secondary nodes:
```
Primary (writes + reads)
  ├── Secondary 1 (reads only)
  └── Secondary 2 (reads only)
```

Direct read operations to secondaries:
```typescript
// In connection string:
mongodb://primary:27017,secondary1:27017,secondary2:27017/db?replicaSet=rs0&readPreference=secondaryPreferred
```

**Important:** Secondaries may be slightly behind the primary (replication lag). For data that must be current (e.g., after a write, immediately read), use `readPreference: primary`.

### Indexing Strategy

Current indexes:
```
users: phone (unique), createdAt
tokens: user + token (compound), expiresAt (TTL)
```

As data grows, add indexes for query patterns:
```javascript
// If you add products:
db.products.createIndex({ category: 1, price: 1 });  // filter + sort
db.products.createIndex({ name: 'text' });             // text search

// If you add orders:
db.orders.createIndex({ userId: 1, createdAt: -1 });  // user's order history
db.orders.createIndex({ status: 1 });                  // filter by status
```

**Rule:** Every `find()` filter field should have an index. Check with `explain()`:
```javascript
db.users.find({ phone: '9876543210' }).explain('executionStats')
// Look for: "IXSCAN" (index scan = fast) vs "COLLSCAN" (collection scan = slow)
```

### Connection Pooling

MongoDB driver uses a connection pool. Current config:
```typescript
// config/index.ts
mongodb: {
  uri: process.env.MONGODB_URI,
  // Default pool: 5 connections
}
```

For high traffic, increase pool size:
```typescript
mongoose.connect(uri, {
  maxPoolSize: 50,   // up to 50 simultaneous DB connections
  minPoolSize: 5,    // keep 5 connections alive even when idle
});
```

---

## Caching Strategy

The current architecture has Redis available but only uses it for rate limiting (planned) and the banned user blocklist (planned). Caching can dramatically reduce DB load.

### What to cache

```
Good candidates for caching:
├── Dashboard stats (totalUsers, activeUsers, etc.)
│   → Change rarely, expensive to compute, fine to be ~1min stale
├── Product catalog (when products are added)
│   → Rarely changes, read by every visitor
└── User profile (after lookup)
    → Read on every authenticated request
    → Invalidate on profile update

Bad candidates for caching:
├── Order status → must be real-time
├── Payment status → must be real-time
└── Auth tokens → security-sensitive, already in DB
```

### Cache-aside pattern

```typescript
async getDashboardStats() {
  const cacheKey = 'dashboard:stats';

  // 1. Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Cache miss — compute from DB
  const stats = await this.computeStats();

  // 3. Store in cache for 60 seconds
  await redis.setex(cacheKey, 60, JSON.stringify(stats));

  return stats;
}
```

---

## CDN and Static Assets

When serving a frontend:

```
Current:
Browser → Nginx → Angular files (served by Nginx)

Scalable:
Browser → CDN (Cloudflare/CloudFront) → Origin (Nginx)
         ↑ caches static files globally
         ↑ ~20ms response from nearest edge node (vs ~200ms from origin)
```

Angular builds produce hashed filenames (`main.abc123.js`). Hash changes when code changes. CDN can cache these forever.

**What to set:**
```nginx
# For Angular's hashed files — cache forever
location ~* \.(js|css|woff2)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}

# For index.html — never cache (must always be fresh)
location = /index.html {
  expires 0;
  add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

---

## Queue for Async Work

Some operations don't need to block the HTTP response:
- Sending SMS notifications
- Sending order confirmation emails
- Generating PDF invoices
- Updating analytics

**Current problem:** If email sending takes 500ms, the user waits 500ms.

**Fix:** Use a job queue (BullMQ + Redis):

```typescript
// In the controller — fast response:
await orderQueue.add('send-confirmation', { orderId, userId });
res.json({ success: true });  // responds in <50ms

// In a worker process — async:
orderQueue.process('send-confirmation', async (job) => {
  await emailService.sendOrderConfirmation(job.data.orderId);
  // runs after HTTP response is already sent
});
```

---

## Load Testing Before Scaling

Before deciding what to scale, measure what actually breaks.

Using k6 (planned — see tech debt tracker):

```javascript
// k6/load-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp to 50 users
    { duration: '1m',  target: 50 },   // hold at 50 users
    { duration: '30s', target: 100 },  // ramp to 100 users
    { duration: '1m',  target: 100 },  // hold at 100 users
    { duration: '30s', target: 0 },    // ramp down
  ],
};

export default function () {
  const res = http.get('http://localhost:3100/health/ready');
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```

Run: `k6 run k6/load-test.js`

Watch in Grafana: request rate, p95 latency, error rate, CPU, memory.

**Scale rule of thumb:**
- p95 latency > 500ms → investigate bottleneck
- Error rate > 1% → something is failing
- CPU > 80% sustained → need more CPU (vertical or horizontal scale)
- Memory > 80% → memory leak or need more RAM

---

## Scaling Checklist (Pre-Production)

Before going live with real traffic:

- [ ] Switch rate limiter to Redis store (RF-003 dependency)
- [ ] Set `NODE_ENV=production` (enables Express production optimizations)
- [ ] Enable MongoDB connection pool sizing (`maxPoolSize: 20+`)
- [ ] Add health check probes to Kubernetes/ECS (uses `/health/live` and `/health/ready`)
- [ ] Configure auto-scaling rules (scale up when CPU > 70%)
- [ ] Set up Grafana alerts (error rate, latency, pod restarts)
- [ ] Test graceful shutdown (`docker stop` → verify in-flight requests complete)
- [ ] Run k6 load test against staging environment
- [ ] Review slow query logs in MongoDB Atlas or via `db.setProfilingLevel(1, { slowms: 100 })`
