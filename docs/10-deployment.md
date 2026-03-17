# 10 — Deployment Guide

---

## CI/CD Pipeline Overview

Every push to `main` or `v1` triggers the GitHub Actions pipeline at `.github/workflows/ci.yml`.

```
Push to v1 or main
        │
        ▼
┌───────────────────────────────────────┐
│         All 4 run IN PARALLEL         │
│                                       │
│  ┌──────────┐  ┌──────────────────┐   │
│  │ Quality  │  │   Unit Tests     │   │
│  │ typecheck│  │   +Coverage      │   │
│  │ lint     │  │   (70% gate)     │   │
│  │ prettier │  └──────────────────┘   │
│  └──────────┘                         │
│  ┌──────────┐  ┌──────────────────┐   │
│  │Integration│  │ Build+Security  │   │
│  │ Tests    │  │ tsc build        │   │
│  │ (MongoDB+│  │ npm audit        │   │
│  │  Redis)  │  └──────────────────┘   │
│  └──────────┘                         │
└──────────────────┬────────────────────┘
                   │ (after unit tests finish)
                   ▼
          ┌────────────────┐
          │  SonarCloud    │
          │  SAST Analysis │
          │  Quality Gate  │
          └────────────────┘
```

---

## Docker Architecture

### Development Stack (`docker-compose.yml`)

```
Host                Container         Port
----                ---------         ----
:27019         ←→  mongo:27017       MongoDB (primary)
:27020         ←→  mongo-test:27017  MongoDB (test DB)
:6381          ←→  redis:6379        Redis
:3100          ←→  backend:3000      Express API (nodemon hot-reload)
:4201          ←→  frontend:4200     Angular (ng serve hot-reload)
:80            ←→  nginx:80          Reverse proxy
:8082          ←→  mongo-express:8081 DB viewer
```

### Monitoring Stack (`docker-compose.monitoring.yml`)

```
:9090  → Prometheus  (scrapes backend /metrics every 15s)
:3001  → Grafana     (reads from Prometheus)
:9216  → mongo-exporter (MongoDB metrics → Prometheus)
:9121  → redis-exporter (Redis metrics → Prometheus)
```

---

## Production Dockerfile

`backend/Dockerfile` uses a **multi-stage build**:

```
Stage 1: builder (node:22-alpine)
  - Install ALL dependencies (including devDependencies)
  - Compile TypeScript → dist/

Stage 2: production (node:22-alpine)
  - Install only production dependencies (--omit=dev)
  - Copy compiled dist/ from Stage 1
  - Run node dist/server.js

Result: small, secure image with no TypeScript compiler or test tools
```

---

## Environment Variables (Production)

Never commit real values. Set these as secrets in your deployment platform (Railway, EC2, etc.)

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | Yes | `production` | Disables stack traces in responses |
| `PORT` | Yes | `3000` | Internal container port |
| `MONGO_URI` | Yes | `mongodb+srv://...` | Use MongoDB Atlas for managed DB |
| `REDIS_HOST` | Yes | `redis-hostname` | Redis Cloud or self-hosted |
| `REDIS_PORT` | Yes | `6379` | |
| `JWT_ACCESS_SECRET` | Yes | random 64+ chars | Generate with `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Yes | random 64+ chars | Different from access secret |
| `CORS_ORIGIN` | Yes | `https://yourdomain.com` | Exact frontend URL |
| `FIREBASE_PROJECT_ID` | Yes | `sarara-b9eac` | From Firebase console |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Yes | base64 string | `base64 firebase-service-account.json` |
| `LOG_LEVEL` | No | `info` | `debug` is too noisy for prod |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Tune for your traffic |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | No | `10` | Tune for your traffic |

**How to encode Firebase credentials for production:**
```bash
base64 -w 0 firebase-service-account.json
# Copy the output as FIREBASE_SERVICE_ACCOUNT_BASE64 env var
```

---

## Health Checks for Deployment

Configure your load balancer / container orchestrator to use:

```
Liveness:  GET /health       → 200 = process alive
Readiness: GET /health/ready → 200 = DB connected, traffic can come in
                               503 = warming up or DB down, no traffic
```

In Kubernetes:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals:
1. Stop accepting new connections
2. Wait for in-flight requests to complete
3. Disconnect MongoDB
4. Disconnect Redis
5. Exit cleanly

After 10 seconds, force-exits. This ensures no data corruption during deploys.

---

## Nginx Configuration (Production)

For a real domain, replace the `docker-compose.yml` Nginx config with SSL:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location /api {
        proxy_pass http://backend:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;  # Angular HTML5 routing
    }

    # Block metrics from public access
    location /metrics {
        deny all;
    }
}
```
