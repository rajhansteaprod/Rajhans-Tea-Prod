# 12 — Debugging Guide

How to diagnose specific problems in this codebase.

---

## Backend Debugging

### "Cannot connect to MongoDB"

```bash
# 1. Is the container running?
docker compose ps

# 2. What does MongoDB say?
docker logs rnd-ecom-mongo

# 3. Is replica set initialized?
docker exec rnd-ecom-mongo mongosh --eval "rs.status()"
# Should show: "stateStr": "PRIMARY"

# 4. Can the backend reach Mongo?
curl http://localhost:3100/health/ready
# Check: "mongodb": "connected" or "error"
```

### "JWT verify failed / 401 on valid token"

```bash
# Decode the JWT payload (doesn't verify signature, just decodes)
echo "eyJhbGciOiJIUzI1NiJ9.PAYLOAD.SIG" | cut -d'.' -f2 | base64 -d

# Check:
# 1. Is exp (expiry) in the past? → Token expired, refresh it
# 2. Is the userId present?
# 3. Is the role correct?

# Verify the backend env var matches what was used to sign:
docker exec rnd-ecom-backend env | grep JWT_ACCESS_SECRET
```

### "Rate limit 429 in dev"

```bash
# Rate limits apply per IP. In dev your IP is 127.0.0.1.
# Wait 60 seconds or temporarily raise the limit in .env:
AUTH_RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_MAX_REQUESTS=10000
# Restart: docker compose up -d --force-recreate backend
```

### "Firebase: Invalid or expired token"

```
Causes:
1. Firebase service account not loaded → check docker logs for "Firebase credentials not configured"
2. Token expired (Firebase ID tokens expire in 1 hour)
3. Token from different Firebase project

Debug:
docker logs rnd-ecom-backend | grep -i firebase
```

### "Request fails but no error in logs"

Add temporary debug logging:
```typescript
// In the relevant service method:
logger.debug({ input }, 'Debug: checking input');
// Set LOG_LEVEL=debug in .env to see these
```

### Tracing a Request End-to-End

Every request has a `requestId`. Use it to trace:

```bash
# Make a request, note the X-Request-ID in the response headers
curl -v http://localhost:3100/health 2>&1 | grep "x-request-id"
# x-request-id: abc123-...

# Find all logs for that request
docker logs rnd-ecom-backend | grep "abc123"
```

---

## Frontend Debugging

### "Auth interceptor not attaching token"

Open browser DevTools → Network tab → click the failing request:
1. Check `Authorization` header is present
2. If missing: `console.log(authService.getAccessToken())` in browser console
3. If null: token wasn't stored → check `localStorage` in DevTools → Application → Local Storage

### "Stuck on login screen after OTP"

```
Step-by-step check:
1. Open Network tab
2. Look for POST /api/v1/auth/verify-token
3. Check the request payload — is idToken present?
4. Check the response — is it 201? Or 401?
5. If 401: Firebase token was invalid (maybe it expired between verify and send)
   → User must restart the login flow
6. If network error: check CORS — the backend URL must match CORS_ORIGIN
```

### "Components not updating after state change"

Angular Signals are synchronous. If a component doesn't update:
1. Make sure you're using `signal()` not a plain variable
2. Make sure you're calling the signal as a function: `authService.isLoggedIn()` not `authService.isLoggedIn`
3. In the template, verify the computed expression is reactive

### "ng serve proxy not working"

```bash
# Check proxy config:
cat frontend/src/proxy.conf.json
# Should show: { "/api": { "target": "http://localhost:3100" } }

# Restart ng serve
```

---

## Docker Debugging

```bash
# See all container statuses
docker compose ps

# See logs for a specific container
docker logs rnd-ecom-backend --tail=50 --follow

# Enter a container shell
docker exec -it rnd-ecom-backend sh
docker exec -it rnd-ecom-mongo mongosh

# Restart a single container
docker compose restart backend

# Rebuild after Dockerfile changes
docker compose up -d --build backend

# Nuclear option — start fresh
docker compose down -v  # WARNING: deletes all data
docker compose up -d
```

---

## CI/CD Debugging

```bash
# See latest pipeline run status
gh run list --limit 5

# See what failed
gh run view <run-id> --log-failed

# Re-run failed jobs
gh run rerun <run-id> --failed
```

---

## MongoDB Debugging

```bash
# Connect to running instance
docker exec -it rnd-ecom-mongo mongosh \
  "mongodb://localhost:27017/rnd-ecommerce?replicaSet=rs0"

# Common queries:
db.users.find().pretty()
db.users.find({ phone: "9876543210" })
db.tokens.find({ user: ObjectId("...") })
db.tokens.countDocuments()  # how many active sessions?

# Check indexes
db.users.getIndexes()
db.tokens.getIndexes()
```
